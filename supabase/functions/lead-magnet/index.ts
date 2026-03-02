import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
<a href="https://collectai.lovable.app" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:15px;">Scan Your Cards Now →</a>
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@") || email.length > 255) {
      return new Response(JSON.stringify({ error: "Please provide a valid email address." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Insert lead
    const { error: insertError } = await supabase.from("leads").insert({
      name: email.split("@")[0],
      email,
      source: "lead_magnet",
      notes: "Downloaded: Card Grading Cheat Sheet",
    });

    if (insertError) {
      console.error("Lead insert error:", insertError);
      // Don't fail — still send the email even if duplicate
    }

    // Send email via SendGrid
    const apiKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL");

    if (!apiKey || !fromEmail) {
      throw new Error("Email configuration is missing");
    }

    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
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

    if (!sgRes.ok) {
      const errText = await sgRes.text();
      console.error("SendGrid error:", errText);
      throw new Error("Failed to send email");
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("lead-magnet error:", err);
    return new Response(JSON.stringify({ error: err.message || "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
