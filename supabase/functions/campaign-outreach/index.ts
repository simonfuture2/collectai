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

async function sendEmail(to: string, subject: string, body: string, unsubUrl?: string) {
  const apiKey = Deno.env.get("SENDGRID_API_KEY")?.trim();
  const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL")?.trim();

  if (!apiKey) throw new Error("SENDGRID_API_KEY is missing");
  if (!fromEmail) throw new Error("SENDGRID_FROM_EMAIL is missing");
  

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail },
    subject,
    content: [{ type: "text/html", value: body }],
    ...(unsubUrl ? { headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
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

    if (action === "broadcast") {
      const { template_id, campaign_name, dry_run } = params;
      const { data: template } = await supabase.from("campaign_templates").select("*").eq("id", template_id).single();
      if (!template || template.channel !== "email") throw new Error("Email template not found");

      const { data: suppressed } = await supabase.from("suppressed_emails").select("email");
      const blocked = new Set((suppressed || []).map((r: any) => String(r.email).toLowerCase()));
      const { data: crm } = await supabase.from("leads").select("id,name,email,company,partner_code").not("email", "is", null);
      const { data: agent } = await supabase.from("agent_leads").select("id,name,business_name,email,status,do_not_contact")
        .not("email", "is", null).eq("status", "contacted").eq("do_not_contact", false);

      const seen = new Set<string>();
      const recipients: { kind: "crm" | "agent"; id: string; email: string; lead: Record<string, any> }[] = [];
      for (const l of crm || []) {
        const e = String(l.email).trim().toLowerCase();
        if (!e || seen.has(e) || blocked.has(e)) continue;
        seen.add(e); recipients.push({ kind: "crm", id: l.id, email: e, lead: l });
      }
      for (const l of agent || []) {
        const e = String(l.email).trim().toLowerCase();
        if (!e || seen.has(e) || blocked.has(e)) continue;
        seen.add(e); recipients.push({ kind: "agent", id: l.id, email: e, lead: { ...l, company: l.business_name } });
      }
      if (dry_run) {
        return new Response(JSON.stringify({ count: recipients.length, crm: recipients.filter(r => r.kind === "crm").length, agent: recipients.filter(r => r.kind === "agent").length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: campaign } = await supabase.from("outreach_campaigns").insert({
        template_id, name: campaign_name || template.name, status: "sending",
        target_filter: { broadcast: true, count: recipients.length }, sent_count: 0, created_by: userData.user.id,
      }).select().single();

      const base = Deno.env.get("SUPABASE_URL")!;
      let sentCount = 0;
      const errors: string[] = [];
      for (const r of recipients) {
        try {
          const token = crypto.randomUUID() + "-" + crypto.randomUUID().slice(0, 8);
          await supabase.from("email_unsubscribe_tokens").insert({ token, email: r.email });
          const unsub = `${base}/functions/v1/email-unsubscribe?token=${token}`;
          const footer = `<div style="font-family:Arial,sans-serif;font-size:12px;color:#888;max-width:560px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">MyCollectAI · 306 W Redwood Street, Baltimore, MD 21201<br>Don't want these emails? <a href="${unsub}" style="color:#888">Unsubscribe</a></div>`;
          const lead = { ...r.lead, name: (r.lead.name || "").split(" ")[0] || "there" };
          const body = replacePlaceholders(template.body, lead) + footer;
          const subject = replacePlaceholders(template.subject || "", lead);
          await sendEmail(r.email, subject, body, unsub);
          if (r.kind === "crm") {
            await supabase.from("lead_activities").insert({
              lead_id: r.id, type: "email_sent", content: `Campaign: ${campaign_name || template.name}`,
              metadata: { campaign_id: campaign?.id, subject }, created_by: userData.user.id,
            });
          } else {
            await supabase.from("agent_leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", r.id);
          }
          sentCount++;
        } catch (e) {
          errors.push(`${r.email}: ${(e as Error).message}`);
        }
      }
      if (campaign) await supabase.from("outreach_campaigns").update({ status: "sent", sent_count: sentCount }).eq("id", campaign.id);
      return new Response(JSON.stringify({ success: true, sent_count: sentCount, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("campaign-outreach error", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
