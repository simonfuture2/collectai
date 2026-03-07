import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify user via anon client (dual-client pattern)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    console.log("Deleting account for user:", userId);

    // Use service role for data deletion
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Delete in order (respecting foreign keys)
    await adminClient.from("card_folders").delete().eq(
      "folder_id",
      adminClient.from("folders").select("id").eq("user_id", userId)
    );
    // Simpler approach: delete by joining
    const { data: folderIds } = await adminClient
      .from("folders")
      .select("id")
      .eq("user_id", userId);

    if (folderIds?.length) {
      await adminClient
        .from("card_folders")
        .delete()
        .in("folder_id", folderIds.map((f: any) => f.id));
    }

    // Delete all user data across tables
    await Promise.all([
      adminClient.from("cards").delete().eq("user_id", userId),
      adminClient.from("folders").delete().eq("user_id", userId),
      adminClient.from("credit_transactions").delete().eq("user_id", userId),
      adminClient.from("user_credits").delete().eq("user_id", userId),
      adminClient.from("push_tokens").delete().eq("user_id", userId),
      adminClient.from("referrals").delete().eq("referrer_id", userId),
      adminClient.from("referrals").delete().eq("referred_id", userId),
      adminClient.from("user_roles").delete().eq("user_id", userId),
      adminClient.from("profiles").delete().eq("id", userId),
    ]);

    // Delete the auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError.message);
      throw new Error("Failed to delete account");
    }

    console.log("Account fully deleted for user:", userId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Delete account error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
