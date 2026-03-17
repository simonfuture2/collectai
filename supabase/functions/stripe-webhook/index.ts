import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Credit pack product IDs → credit amounts
const CREDIT_PACKS: Record<string, number> = {
  "prod_U3LUssmKAJLMjx": 10,   // 10 Credit Pack
  "prod_U3LUNHmWz9efkI": 50,   // 50 Credit Pack
  "prod_U3LVySbsHL6Sur": 100,  // 100 Credit Pack
};

const PRO_PRODUCT_ID = "prod_U3LWcSgpIvvEwb";

serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    logStep("Signature verification failed", { error: err.message });
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const customerId = session.customer as string;

      if (!userId) {
        logStep("No user_id in metadata, skipping");
        return new Response("OK", { status: 200 });
      }

      logStep("Processing checkout", { userId, customerId, mode: session.mode });

      // Retrieve line items to get the product
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
      const priceId = lineItems.data[0]?.price?.id;
      const productId = lineItems.data[0]?.price?.product as string;

      logStep("Line item", { priceId, productId });

      if (session.mode === "subscription") {
        // Activate Pro subscription
        const subscriptionId = session.subscription as string;
        await supabaseClient
          .from("user_credits")
          .upsert({
            user_id: userId,
            plan: "pro",
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          }, { onConflict: "user_id" });

        logStep("Pro subscription activated", { userId, subscriptionId });

        // Log transaction
        await supabaseClient.from("credit_transactions").insert({
          user_id: userId,
          type: "subscription",
          amount: 0,
          description: "Pro subscription activated",
        });

      } else if (session.mode === "payment") {
        // Credit pack purchase
        const creditsToAdd = CREDIT_PACKS[productId];
        if (!creditsToAdd) {
          logStep("Unknown product, skipping", { productId });
          return new Response("OK", { status: 200 });
        }

        // Get current credits
        const { data: existing } = await supabaseClient
          .from("user_credits")
          .select("credits")
          .eq("user_id", userId)
          .single();

        const currentCredits = existing?.credits ?? 0;
        const newCredits = currentCredits + creditsToAdd;

        await supabaseClient
          .from("user_credits")
          .upsert({
            user_id: userId,
            credits: newCredits,
            stripe_customer_id: customerId,
          }, { onConflict: "user_id" });

        logStep("Credits added", { userId, creditsToAdd, newCredits });

        // Log transaction
        await supabaseClient.from("credit_transactions").insert({
          user_id: userId,
          type: "credit_purchase",
          amount: creditsToAdd,
          description: `Purchased ${creditsToAdd} credits`,
        });
      }
    } else if (event.type === "customer.subscription.deleted") {
      // Subscription cancelled/expired
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      const { data: userCredits } = await supabaseClient
        .from("user_credits")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (userCredits) {
        await supabaseClient
          .from("user_credits")
          .update({ plan: "free", stripe_subscription_id: null })
          .eq("user_id", userCredits.user_id);

        logStep("Subscription cancelled, downgraded to free", { userId: userCredits.user_id });
      }
    } else {
      logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR processing webhook", { message: errorMessage });
    // Return 200 to prevent Stripe from retrying on transient failures
    return new Response(JSON.stringify({ received: true, error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }
});
