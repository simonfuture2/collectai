import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendSMS(to: string, body: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER")!;

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
    }
  );
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.message || "SMS send failed");
  }
  return resp.json();
}

async function sendEmail(to: string, subject: string, body: string) {
  const apiKey = Deno.env.get("SENDGRID_API_KEY")?.trim();
  const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL")?.trim();

  if (!apiKey) throw new Error("SENDGRID_API_KEY is missing");
  if (!fromEmail) throw new Error("SENDGRID_FROM_EMAIL is missing");
  console.log("SENDGRID_FROM_EMAIL value:", JSON.stringify(fromEmail));

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail },
    subject,
    content: [{ type: "text/html", value: body }],
  };

  const endpoints = [
    "https://api.sendgrid.com/v3/mail/send",
    "https://api.eu.sendgrid.com/v3/mail/send",
  ];

  let lastError = "";

  for (const endpoint of endpoints) {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (resp.ok) return;

    const err = await resp.text();
    console.error("SendGrid send failed", { endpoint, status: resp.status, error: err });

    // Retry with EU endpoint only for auth-grant errors (common with EU regional subusers)
    if (!err.includes("authorization grant is invalid")) {
      throw new Error(err || "Email send failed");
    }

    lastError = err;
  }

  throw new Error(lastError || "Email send failed");
}

function replacePlaceholders(template: string, lead: Record<string, any>): string {
  return template
    .replace(/\{\{name\}\}/gi, lead.name || "")
    .replace(/\{\{email\}\}/gi, lead.email || "")
    .replace(/\{\{company\}\}/gi, lead.company || "")
    .replace(/\{\{partner_code\}\}/gi, lead.partner_code || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate user
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData?.user) throw new Error("Not authenticated");

    // Check admin
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: adminCheck } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!adminCheck) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();

    if (action === "send_email") {
      const { lead_id, subject, body } = params;
      const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).single();
      if (!lead?.email) throw new Error("Lead has no email");

      const finalBody = replacePlaceholders(body, lead);
      const finalSubject = replacePlaceholders(subject, lead);
      await sendEmail(lead.email, finalSubject, finalBody);

      await supabase.from("lead_activities").insert({
        lead_id, type: "email_sent", content: `Subject: ${finalSubject}`,
        metadata: { subject: finalSubject, body: finalBody }, created_by: userData.user.id,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_sms") {
      const { lead_id, body } = params;
      const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).single();
      if (!lead?.phone) throw new Error("Lead has no phone number");

      const finalBody = replacePlaceholders(body, lead);
      await sendSMS(lead.phone, finalBody);

      await supabase.from("lead_activities").insert({
        lead_id, type: "sms_sent", content: finalBody,
        metadata: { body: finalBody }, created_by: userData.user.id,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_partner_code") {
      const { lead_id } = params;
      const code = "PARTNER-" + crypto.randomUUID().slice(0, 8).toUpperCase();
      await supabase.from("leads").update({ partner_code: code }).eq("id", lead_id);

      await supabase.from("lead_activities").insert({
        lead_id, type: "note", content: `Partner code generated: ${code}`,
        created_by: userData.user.id,
      });

      return new Response(JSON.stringify({ success: true, partner_code: code }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bulk_send") {
      const { template_id, lead_ids, campaign_name } = params;
      const { data: template } = await supabase.from("campaign_templates").select("*").eq("id", template_id).single();
      if (!template) throw new Error("Template not found");

      const { data: leads } = await supabase.from("leads").select("*").in("id", lead_ids);
      if (!leads?.length) throw new Error("No leads found");

      // Create campaign record
      const { data: campaign } = await supabase.from("outreach_campaigns").insert({
        template_id, name: campaign_name || template.name, status: "sending",
        target_filter: { lead_ids }, sent_count: 0, created_by: userData.user.id,
      }).select().single();

      let sentCount = 0;
      const errors: string[] = [];

      for (const lead of leads) {
        try {
          if (template.channel === "email" && lead.email) {
            const finalBody = replacePlaceholders(template.body, lead);
            const finalSubject = replacePlaceholders(template.subject || "", lead);
            await sendEmail(lead.email, finalSubject, finalBody);
            await supabase.from("lead_activities").insert({
              lead_id: lead.id, type: "email_sent", content: `Campaign: ${campaign_name || template.name}`,
              metadata: { campaign_id: campaign?.id, subject: finalSubject }, created_by: userData.user.id,
            });
            sentCount++;
          } else if (template.channel === "sms" && lead.phone) {
            const finalBody = replacePlaceholders(template.body, lead);
            await sendSMS(lead.phone, finalBody);
            await supabase.from("lead_activities").insert({
              lead_id: lead.id, type: "sms_sent", content: `Campaign: ${campaign_name || template.name}`,
              metadata: { campaign_id: campaign?.id }, created_by: userData.user.id,
            });
            sentCount++;
          }
        } catch (e) {
          errors.push(`${lead.email || lead.phone}: ${e.message}`);
        }
      }

      if (campaign) {
        await supabase.from("outreach_campaigns").update({ status: "sent", sent_count: sentCount }).eq("id", campaign.id);
      }

      return new Response(JSON.stringify({ success: true, sent_count: sentCount, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
