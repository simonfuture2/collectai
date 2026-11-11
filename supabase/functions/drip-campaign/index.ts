// Retired: drips now run as the "Lead magnet welcome" sequence (sequence-tick). Old queue rows stay as history.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "drip-campaign is retired; drips run as the Lead magnet welcome sequence" }), {
    status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
