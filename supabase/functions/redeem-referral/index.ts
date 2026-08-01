import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const referredUserId = claimsData.claims.sub;

    const { referral_code } = await req.json();
    if (!referral_code || typeof referral_code !== "string") {
      return new Response(JSON.stringify({ error: "Missing referral_code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the referrer by code
    const { data: referrer, error: referrerError } = await supabaseAdmin
      .from("referral_codes")
      .select("user_id, code")
      .eq("code", referral_code.toUpperCase())
      .maybeSingle();

    if (referrerError || !referrer) {
      return new Response(JSON.stringify({ error: "Invalid referral code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Can't refer yourself
    if (referrer.user_id === referredUserId) {
      return new Response(JSON.stringify({ error: "Cannot refer yourself" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap referrals per referrer to prevent farming (max 20 referrals)
    const { count: referralCount } = await supabaseAdmin
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", referrer.user_id);

    if ((referralCount ?? 0) >= 20) {
      return new Response(JSON.stringify({ error: "Referral limit reached" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomic claim: the unique index on referrals.referred_id makes this the
    // single source of truth for one-time redemption, so concurrent requests
    // can't both be credited.
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("referrals")
      .insert({
        referrer_id: referrer.user_id,
        referred_id: referredUserId,
        referral_code: referral_code.toUpperCase(),
        credited: true,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      // 23505 = unique violation => already redeemed by a concurrent/earlier request
      if ((insertError as { code?: string }).code === "23505") {
        return new Response(JSON.stringify({ error: "Referral already redeemed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Insert referral error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create referral" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!inserted) {
      return new Response(JSON.stringify({ error: "Referral already redeemed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Award 3 credits to referrer atomically
    const { error: creditError } = await supabaseAdmin.rpc("add_credits", {
      _user_id: referrer.user_id,
      _amount: 3,
    });
    if (creditError) {
      console.error("Award referral credits error:", creditError);
    }

    // Log the transaction
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: referrer.user_id,
      amount: 3,
      type: "referral_bonus",
      description: `Referral bonus for inviting a new user`,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Redeem referral error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
