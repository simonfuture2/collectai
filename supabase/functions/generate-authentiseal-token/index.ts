import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Minimal HMAC-SHA256 JWT signing using Web Crypto API
async function signJWT(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${data}.${sigB64}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sharedSecret = Deno.env.get("AUTHENTISEAL_SHARED_SECRET");

    if (!sharedSecret) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured: missing shared secret" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profile for display name
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const body = await req.json();
    const { cardData, cardId } = body;

    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
      sub: user.id,
      user_email: user.email,
      user_name: profile?.display_name || user.email?.split("@")[0],
      source: "collectai",
      iat: now,
      exp: now + 600, // 10 minutes
      callback_url: `${supabaseUrl}/functions/v1/authentiseal-webhook`,
    };

    // Include card_id so AuthentiSeal can reference it in the callback
    if (cardId) payload.card_id = cardId;

    // Add card data fields if present
    if (cardData) {
      if (cardData.name) payload.item_name = cardData.name;
      if (cardData.category) payload.item_category = cardData.category;
      if (cardData.set) payload.item_set = cardData.set;
      if (cardData.year) payload.item_year = cardData.year;
      if (cardData.condition) payload.condition = cardData.condition;
      if (cardData.valueLow != null) payload.value_low = cardData.valueLow;
      if (cardData.valueHigh != null) payload.value_high = cardData.valueHigh;
    }

    const token = await signJWT(payload, sharedSecret);

    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
