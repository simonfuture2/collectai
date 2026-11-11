import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, company, message } = await req.json();

    if (!name || !email) {
      return new Response(JSON.stringify({ error: "Name and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Per-IP rate limit: 5 partner signups per IP per 24h
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    const ipHash = await sha256Hex(`${clientIp}:collectai-partner-signup`);
    const { data: rl, error: rlErr } = await supabase.rpc("consume_ip_rate_limit", {
      _bucket_key: "partner_signup",
      _ip_hash: ipHash,
      _max_requests: 5,
      _window_seconds: 86400,
    });
    if (rlErr) {
      console.error("rate limit RPC error:", rlErr);
      return new Response(JSON.stringify({ error: "Service temporarily unavailable. Please try again." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rlRow = Array.isArray(rl) ? rl[0] : rl;
    if (!rlRow?.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanEmail = String(email).trim().toLowerCase().slice(0, 255);
    const row = {
      name: String(name).trim().slice(0, 100),
      phone: phone ? String(phone).trim().slice(0, 20) : null,
      business_name: company ? String(company).trim().slice(0, 100) : null,
      notes: message ? String(message).trim().slice(0, 1000) : null,
      consent_email: true, consent_source: "partner_form",
    };
    const { data: existing } = await supabase.from("agent_leads").select("id").ilike("email", cleanEmail).is("merged_into", null).maybeSingle();
    const { data, error } = existing
      ? await supabase.from("agent_leads").update(row).eq("id", existing.id).select("id").single()
      : await supabase.from("agent_leads").insert({ ...row, email: cleanEmail, platform: "email", lead_type: company ? "card_shop" : "collector", source: "partner_form" }).select("id").single();
    if (!error) await supabase.from("agent_activities").insert({ lead_id: data.id, type: "partner_form", body: row.notes ?? "Submitted the partner form" });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("partner-signup error:", err.message);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
