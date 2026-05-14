import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

const PRO_PRODUCT_ID = "prod_U2o8G9JgJbkJrd";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated", subscribed: false, plan: "free", credits: 0 }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use anon key client with user's auth header for proper token validation
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Not authenticated", subscribed: false, plan: "free", credits: 0 }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    // Service role client for DB operations
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get credits from database
    const { data: creditsData } = await supabaseClient
      .from("user_credits")
      .select("*")
      .eq("user_id", user.id)
      .single();

    let credits = creditsData?.credits ?? 3;
    let plan = creditsData?.plan ?? "free";

    // Check Stripe for active subscription
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    let subscribed = false;
    let subscriptionEnd = null;

    if (customers.data.length > 0) {
      const customerId = customers.data[0].id;
      logStep("Found Stripe customer", { customerId });

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0];
        subscribed = true;
        const toIsoSafe = (sec: unknown): string | null => {
          const n = typeof sec === "number" ? sec : Number(sec);
          if (!Number.isFinite(n) || n <= 0) return null;
          const d = new Date(n * 1000);
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        };
        const sub: any = subscription;
        const periodEndRaw =
          sub.current_period_end ??
          sub.items?.data?.[0]?.current_period_end ??
          sub.trial_end ??
          sub.cancel_at ??
          null;
        subscriptionEnd = toIsoSafe(periodEndRaw);
        if (!subscriptionEnd) {
          logStep("Subscription has no valid period end", { subscriptionId: sub.id });
        }
        plan = "pro";
        logStep("Active subscription found", { subscriptionId: subscription.id });

        // Update DB if needed
        if (creditsData && creditsData.plan !== "pro") {
          await supabaseClient
            .from("user_credits")
            .update({ plan: "pro", stripe_customer_id: customerId, stripe_subscription_id: subscription.id })
            .eq("user_id", user.id);
        }
      } else if (plan === "pro" && creditsData) {
        // Subscription lapsed
        await supabaseClient
          .from("user_credits")
          .update({ plan: "free" })
          .eq("user_id", user.id);
        plan = "free";
      }
    }

    // If no credits record exists, create one
    if (!creditsData) {
      await supabaseClient
        .from("user_credits")
        .insert({ user_id: user.id, credits: 3, plan: "free" });
      credits = 3;
      plan = "free";
    }

    logStep("Returning status", { plan, credits, subscribed });

    return new Response(JSON.stringify({
      subscribed,
      plan,
      credits,
      subscription_end: subscriptionEnd,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
