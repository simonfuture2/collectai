import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Verify HMAC-SHA256 JWT
async function verifyJWT(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Decode signature
  const sigStr = sigB64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = sigStr + "=".repeat((4 - (sigStr.length % 4)) % 4);
  const sigBytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
  if (!valid) return null;

  // Decode payload
  const payloadStr = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
  const payloadPadded = payloadStr + "=".repeat((4 - (payloadStr.length % 4)) % 4);
  const payload = JSON.parse(atob(payloadPadded));

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sharedSecret = Deno.env.get("AUTHENTISEAL_SHARED_SECRET");
    if (!sharedSecret) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { token, card_id, serial_number } = body;

    if (!token || !card_id || !serial_number) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: token, card_id, serial_number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the callback token signed by AuthentiSeal with the shared secret
    const payload = await verifyJWT(token, sharedSecret);
    if (!payload) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate source
    if (payload.source !== "authentiseal") {
      return new Response(
        JSON.stringify({ error: "Invalid token source" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to update the card
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Update the card's authentiseal_serial
    const { error } = await supabase
      .from("cards")
      .update({ authentiseal_serial: serial_number })
      .eq("id", card_id);

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to update card", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, card_id, serial_number }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
