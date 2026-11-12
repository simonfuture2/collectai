import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Signs storage paths only when they belong to a published social video.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { path } = await req.json().catch(() => ({}));
    if (typeof path !== "string" || !path || path.length > 500 || path.includes("..")) return json({ error: "Invalid path" }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rows } = await admin.from("social_videos").select("id").eq("published", true)
      .or(`url.eq."${path.replace(/"/g, "")}",poster_url.eq."${path.replace(/"/g, "")}"`).limit(1);
    if (!rows?.length) return json({ error: "Not found" }, 404);
    const { data, error } = await admin.storage.from("social-videos").createSignedUrl(path, 3600);
    if (error || !data) return json({ error: "Not found" }, 404);
    return json({ url: data.signedUrl });
  } catch {
    return json({ error: "Server error" }, 500);
  }
});
