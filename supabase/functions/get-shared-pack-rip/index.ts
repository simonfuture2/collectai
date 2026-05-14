import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const token = body?.share_token;
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return json({ error: "Invalid share_token" }, 400);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("pack_rips")
      .select(
        "id, set_name, retail_cost, pulls, total_value, best_pull_name, best_pull_value, created_at, share_token",
      )
      .eq("share_token", token)
      .maybeSingle();

    if (error) {
      console.error("get-shared-pack-rip db error", error);
      return json({ error: "Internal server error" }, 500);
    }
    if (!data) return json({ error: "Not found" }, 404);

    return json(data);
  } catch (e) {
    console.error("get-shared-pack-rip unexpected error", e);
    return json({ error: "Internal server error" }, 500);
  }
});
