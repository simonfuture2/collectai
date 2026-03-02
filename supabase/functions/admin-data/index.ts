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

    // Use anon key client with user's auth header for identity validation
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Service role client for all DB operations
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check admin role using service role client
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body once
    const body = await req.json();
    const { action } = body;

    // ─── GET DASHBOARD ───
    if (action === "get_dashboard") {
      const [usersRes, profilesRes, transactionsRes, cardsCountRes, scanCountRes, revenueRes] =
        await Promise.all([
          adminClient.from("user_credits").select("*").order("created_at", { ascending: false }),
          adminClient.from("profiles").select("id, email, display_name, created_at"),
          adminClient.from("credit_transactions").select("*").order("created_at", { ascending: false }).limit(200),
          adminClient.from("cards").select("id", { count: "exact", head: true }),
          adminClient.from("credit_transactions").select("id", { count: "exact", head: true }).eq("type", "scan_deduction"),
          adminClient.from("credit_transactions").select("amount").eq("type", "credit_purchase"),
        ]);

      const totalRevenue = (revenueRes.data || []).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

      return new Response(
        JSON.stringify({
          users: usersRes.data || [],
          profiles: profilesRes.data || [],
          transactions: transactionsRes.data || [],
          stats: {
            totalCards: cardsCountRes.count || 0,
            totalScans: scanCountRes.count || 0,
            totalRevenue,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── UPDATE CREDITS (set absolute value) ───
    if (action === "update_credits") {
      const { targetUserId, credits, reason } = body;
      if (!targetUserId || credits === undefined) {
        return new Response(JSON.stringify({ error: "targetUserId and credits required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get current credits to calculate diff
      const { data: current } = await adminClient
        .from("user_credits")
        .select("credits")
        .eq("user_id", targetUserId)
        .single();

      const diff = credits - (current?.credits || 0);

      const { error: updateErr } = await adminClient
        .from("user_credits")
        .update({ credits, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId);

      if (updateErr) throw updateErr;

      // Log transaction
      await adminClient.from("credit_transactions").insert({
        user_id: targetUserId,
        amount: diff,
        type: "admin_adjustment",
        description: reason || `Admin set credits to ${credits}`,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ADD CREDITS (relative) ───
    if (action === "add_credits") {
      const { targetUserId, amount, reason } = body;
      if (!targetUserId || !amount) {
        return new Response(JSON.stringify({ error: "targetUserId and amount required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: current } = await adminClient
        .from("user_credits")
        .select("credits")
        .eq("user_id", targetUserId)
        .single();

      const newCredits = Math.max(0, (current?.credits || 0) + amount);

      const { error: updateErr } = await adminClient
        .from("user_credits")
        .update({ credits: newCredits, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId);

      if (updateErr) throw updateErr;

      await adminClient.from("credit_transactions").insert({
        user_id: targetUserId,
        amount,
        type: "admin_adjustment",
        description: reason || `Admin ${amount > 0 ? "added" : "deducted"} ${Math.abs(amount)} credits`,
      });

      return new Response(JSON.stringify({ success: true, newCredits }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE PLAN ───
    if (action === "update_plan") {
      const { targetUserId, plan } = body;
      if (!targetUserId || !plan || !["free", "pro"].includes(plan)) {
        return new Response(JSON.stringify({ error: "targetUserId and valid plan (free/pro) required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateErr } = await adminClient
        .from("user_credits")
        .update({ plan, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId);

      if (updateErr) throw updateErr;

      await adminClient.from("credit_transactions").insert({
        user_id: targetUserId,
        amount: 0,
        type: "admin_plan_change",
        description: `Admin changed plan to ${plan}`,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET USER DETAIL ───
    if (action === "get_user_detail") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "targetUserId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [profileRes, creditsRes, transRes, cardsRes] = await Promise.all([
        adminClient.from("profiles").select("*").eq("id", targetUserId).single(),
        adminClient.from("user_credits").select("*").eq("user_id", targetUserId).single(),
        adminClient.from("credit_transactions").select("*").eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(50),
        adminClient.from("cards").select("id", { count: "exact", head: true }).eq("user_id", targetUserId),
      ]);

      return new Response(
        JSON.stringify({
          profile: profileRes.data,
          credits: creditsRes.data,
          transactions: transRes.data || [],
          cardsCount: cardsRes.count || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── DELETE USER DATA ───
    if (action === "delete_user_data") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "targetUserId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete in order: card_folders → cards → credit_transactions → user_credits
      await adminClient.from("card_folders").delete().eq(
        "card_id",
        adminClient.from("cards").select("id").eq("user_id", targetUserId)
      ).then(() => {});

      await Promise.all([
        adminClient.from("cards").delete().eq("user_id", targetUserId),
        adminClient.from("credit_transactions").delete().eq("user_id", targetUserId),
      ]);

      await adminClient.from("user_credits").delete().eq("user_id", targetUserId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
