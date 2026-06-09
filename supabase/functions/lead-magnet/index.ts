import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRIP_SCHEDULE = [
  { step: 1, day: 1, subject: "Welcome! Here's How to Spot a PSA 10 🏆" },
  { step: 2, day: 3, subject: "The Top 5 Most Expensive Cards Sold This Year 💰" },
  { step: 3, day: 4, subject: "Pokémon: Why Vintage Japanese Cards Are Exploding 🇯🇵" },
  { step: 4, day: 6, subject: "Sports Legends: Cards That Made Millionaires 🏀⚾🏈" },
  { step: 5, day: 8, subject: "3 Grading Mistakes That Cost Collectors Thousands 😱" },
  { step: 6, day: 10, subject: "The Hidden Gem: Low-Pop Cards Worth Hunting 🔎" },
  { step: 7, day: 11, subject: "Is Your Collection Insured? 🛡️" },
  { step: 8, day: 13, subject: "Market Watch: What's Trending Right Now 📈" },
  { step: 9, day: 15, subject: "Your Collection Deserves More — Upgrade to Pro 🚀" },
];

const cheatSheetHTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:32px 40px;text-align:center;">
<h1 style="color:#ffffff;font-size:26px;margin:0 0 4px;">The Collector's Card Grading Cheat Sheet</h1>
<p style="color:#e9d5ff;font-size:14px;margin:0;">by CollectAI — Your AI Card Grading Companion</p>
</td></tr>

<!-- Grade Scale -->
<tr><td style="padding:32px 40px 0;">
<h2 style="color:#7c3aed;font-size:20px;margin:0 0 12px;">📊 The PSA / BGS Grade Scale</h2>
<table width="100%" cellpadding="8" cellspacing="0" style="font-size:13px;border-collapse:collapse;">
<tr style="background:#f9fafb;"><td style="border:1px solid #e5e7eb;font-weight:bold;">Grade</td><td style="border:1px solid #e5e7eb;font-weight:bold;">Label</td><td style="border:1px solid #e5e7eb;font-weight:bold;">Value Multiplier</td></tr>
<tr><td style="border:1px solid #e5e7eb;">10</td><td style="border:1px solid #e5e7eb;">Gem Mint</td><td style="border:1px solid #e5e7eb;">5–50x raw</td></tr>
<tr style="background:#f9fafb;"><td style="border:1px solid #e5e7eb;">9</td><td style="border:1px solid #e5e7eb;">Mint</td><td style="border:1px solid #e5e7eb;">2–10x raw</td></tr>
<tr><td style="border:1px solid #e5e7eb;">8</td><td style="border:1px solid #e5e7eb;">NM-MT</td><td style="border:1px solid #e5e7eb;">1.5–3x raw</td></tr>
<tr style="background:#f9fafb;"><td style="border:1px solid #e5e7eb;">7</td><td style="border:1px solid #e5e7eb;">Near Mint</td><td style="border:1px solid #e5e7eb;">1–2x raw</td></tr>
<tr><td style="border:1px solid #e5e7eb;">6</td><td style="border:1px solid #e5e7eb;">EX-MT</td><td style="border:1px solid #e5e7eb;">~1x raw</td></tr>
<tr style="background:#f9fafb;"><td style="border:1px solid #e5e7eb;">1–5</td><td style="border:1px solid #e5e7eb;">Poor–EX</td><td style="border:1px solid #e5e7eb;">Below raw</td></tr>
</table>
</td></tr>

<!-- 4 Factors -->
<tr><td style="padding:28px 40px 0;">
<h2 style="color:#7c3aed;font-size:20px;margin:0 0 12px;">🔍 4 Condition Factors</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><strong>Centering</strong> — How well the image is centered within the borders. PSA 10 requires 60/40 or better on front, 75/25 on back.</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><strong>Corners</strong> — Must be sharp and crisp. Any rounding, fraying, or dings drop the grade significantly.</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><strong>Edges</strong> — Look for chipping, rough cuts, or color showing through. Run your finger along each edge.</td></tr>
<tr><td style="padding:8px 0;"><strong>Surface</strong> — Check for scratches, print defects, staining, or wax residue. Use angled lighting to reveal hidden flaws.</td></tr>
</table>
</td></tr>

<!-- Photo Tips -->
<tr><td style="padding:28px 40px 0;">
<h2 style="color:#7c3aed;font-size:20px;margin:0 0 12px;">📸 Photo Tips for Self-Grading</h2>
<ul style="font-size:13px;padding-left:20px;color:#374151;line-height:1.8;">
<li>Use natural, indirect light — no harsh shadows or glare</li>
<li>Place card on a dark, non-reflective surface</li>
<li>Shoot straight-on for centering; angled for surface defects</li>
<li>Photograph all 4 corners close-up</li>
<li>Use CollectAI's scanner for instant AI-powered grading</li>
</ul>
</td></tr>

<!-- When to Grade -->
<tr><td style="padding:28px 40px 0;">
<h2 style="color:#7c3aed;font-size:20px;margin:0 0 12px;">💡 When to Send for Professional Grading</h2>
<ul style="font-size:13px;padding-left:20px;color:#374151;line-height:1.8;">
<li>Card raw value is <strong>$50+</strong> and you estimate PSA 8 or higher</li>
<li>The card is a rookie, 1st edition, or low-pop variant</li>
<li>You plan to sell — graded cards sell for significantly more</li>
<li>You want authentication for high-value vintage cards</li>
</ul>
</td></tr>

<!-- CTA -->
<tr><td style="padding:32px 40px;text-align:center;">
<p style="font-size:14px;color:#6b7280;margin:0 0 16px;">Ready to scan and grade your cards with AI?</p>
<a href="https://mycollectai.com" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:15px;">Scan Your Cards Now →</a>
</td></tr>

<!-- Footer -->
<tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="font-size:11px;color:#9ca3af;margin:0;">© CollectAI — AI-Powered Card Grading & Value Scanner</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 255) {
      return new Response(JSON.stringify({ error: "Please provide a valid email address." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Per-IP rate limit: 2 lead-magnet requests per IP per 24h
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    const ipHash = await sha256Hex(`${clientIp}:collectai-lead-magnet`);
    const { data: rl, error: rlErr } = await supabase.rpc("consume_ip_rate_limit", {
      _bucket_key: "lead_magnet",
      _ip_hash: ipHash,
      _max_requests: 2,
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


    // Insert lead
    const { data: leadData, error: insertError } = await supabase.from("leads").insert({
      name: email.split("@")[0],
      email,
      source: "lead_magnet",
      notes: "Downloaded: Card Grading Cheat Sheet",
    }).select("id").single();

    let leadId = leadData?.id;

    if (insertError) {
      console.error("Lead insert error:", insertError);
      // Try to find existing lead to still enqueue drip
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("email", email)
        .single();
      leadId = existing?.id;
    }

    // Enqueue drip campaign emails
    if (leadId) {
      const now = new Date();
      const dripRows = DRIP_SCHEDULE.map((d) => {
        const scheduledDate = new Date(now);
        scheduledDate.setDate(scheduledDate.getDate() + d.day);
        return {
          lead_id: leadId,
          step: d.step,
          subject: d.subject,
          body: "", // HTML is in the drip-campaign function
          scheduled_for: scheduledDate.toISOString().split("T")[0],
        };
      });

      const { error: dripError } = await supabase
        .from("drip_campaign_queue")
        .insert(dripRows);

      if (dripError) {
        console.error("Drip enqueue error:", dripError);
      } else {
        console.log(`Enqueued 9 drip emails for lead ${leadId}`);
      }
    }

    // Send email via SendGrid
    const apiKey = Deno.env.get("SENDGRID_API_KEY")?.trim();
    const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL")?.trim();

    if (!apiKey || !fromEmail) {
      throw new Error("Email configuration is missing");
    }

    let sent = false;
    for (const baseUrl of ["https://api.sendgrid.com", "https://api.eu.sendgrid.com"]) {
      const sgRes = await fetch(`${baseUrl}/v3/mail/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: fromEmail, name: "CollectAI" },
          subject: "Your Card Grading Cheat Sheet 📊",
          content: [{ type: "text/html", value: cheatSheetHTML }],
        }),
      });

      if (sgRes.ok || sgRes.status === 202) {
        sent = true;
        break;
      } else {
        const errText = await sgRes.text();
        console.error(`SendGrid error (${baseUrl}):`, errText);
      }
    }

    if (!sent) {
      throw new Error("Failed to send email via SendGrid");
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("lead-magnet error:", err);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
