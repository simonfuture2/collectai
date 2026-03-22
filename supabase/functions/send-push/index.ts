import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PushRequest {
  type: "broadcast" | "user" | "users";
  user_ids?: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fcmServerKey = Deno.env.get("FCM_SERVER_KEY");

    if (!fcmServerKey) {
      return new Response(
        JSON.stringify({ error: "FCM_SERVER_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    const internalKey = req.headers.get("x-internal-key");

    if (authHeader) {
      // Dual-client pattern: use anon client for identity
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = claimsData.claims.sub;

      // Use service role to check admin
      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data: isAdmin } = await adminClient.rpc("is_admin", { _user_id: userId });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (internalKey !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for DB operations
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload: PushRequest = await req.json();
    const { type, user_ids, title, body, data } = payload;

    // Get tokens
    let query = supabase.from("push_tokens").select("token");
    if (type === "user" && user_ids?.length === 1) {
      query = query.eq("user_id", user_ids[0]);
    } else if (type === "users" && user_ids?.length) {
      query = query.in("user_id", user_ids);
    }

    const { data: tokens, error: tokErr } = await query;
    if (tokErr || !tokens?.length) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    const registrationIds = tokens.map((t: any) => t.token);

    for (let i = 0; i < registrationIds.length; i += 1000) {
      const batch = registrationIds.slice(i, i + 1000);
      const fcmPayload = {
        registration_ids: batch,
        notification: { title, body },
        data: data || {},
      };

      const fcmRes = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${fcmServerKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fcmPayload),
      });

      if (fcmRes.ok) {
        const result = await fcmRes.json();
        sent += result.success || 0;
      }
    }

    return new Response(
      JSON.stringify({ sent, total: registrationIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-push error:", err.message);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
