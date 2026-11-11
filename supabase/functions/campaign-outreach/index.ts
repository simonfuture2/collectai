import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { suppressedSet, unsubscribeUrl } from "../_shared/outreach.ts";

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

async function sendgridUnsubscribes(): Promise<string[]> {
  const apiKey = Deno.env.get("SENDGRID_API_KEY")?.trim();
  if (!apiKey) return [];
  const out: string[] = [];
  for (const path of ["unsubscribes", "bounces", "spam_reports"]) {
    try {
      const r = await fetch(`https://api.sendgrid.com/v3/suppression/${path}?limit=500`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) { console.warn("SendGrid suppression read failed", path, r.status, await r.text()); continue; }
      for (const x of await r.json()) if (x?.email) out.push(String(x.email).toLowerCase());
    } catch (e) { console.warn("SendGrid suppression read error", path, e); }
  }
  return out;
}

async function sendEmail(to: string, subject: string, body: string, unsubUrl?: string, sgUnsub = false) {
  const apiKey = Deno.env.get("SENDGRID_API_KEY")?.trim();
  const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL")?.trim();

  if (!apiKey) throw new Error("SENDGRID_API_KEY is missing");
  if (!fromEmail) throw new Error("SENDGRID_FROM_EMAIL is missing");
  

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail },
    subject,
    content: [{ type: "text/html", value: body }],
    ...(sgUnsub ? { tracking_settings: { subscription_tracking: { enable: true, substitution_tag: "[unsubscribe]" } } } : {}),
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
      const { data: lead } = await supabase.from("agent_leads").select("*").eq("id", lead_id).single();
      if (!lead?.email) throw new Error("Lead has no email");
      if ((await suppressedSet(supabase)).has(String(lead.email).toLowerCase()) || lead.do_not_contact) throw new Error("This address has unsubscribed or is marked do-not-contact");
      lead.company = lead.company || lead.business_name;

      const finalBody = replacePlaceholders(body, lead);
      const finalSubject = replacePlaceholders(subject, lead);
      await sendEmail(lead.email, finalSubject, finalBody, await unsubscribeUrl(lead.email), true);

      await supabase.from("agent_activities").insert({ lead_id, type: "email_sent", body: `Subject: ${finalSubject}`, meta: { subject: finalSubject, body: finalBody }, rep_id: userData.user.id });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_sms") {
      const { lead_id, body } = params;
      const { data: lead } = await supabase.from("agent_leads").select("*").eq("id", lead_id).single();
      if (!lead?.phone) throw new Error("Lead has no phone number");

      const finalBody = replacePlaceholders(body, lead);
      await sendSMS(lead.phone, finalBody);

      await supabase.from("agent_activities").insert({ lead_id, type: "sms_sent", body: finalBody, meta: { body: finalBody }, rep_id: userData.user.id });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_partner_code") {
      const { lead_id } = params;
      const code = "PARTNER-" + crypto.randomUUID().slice(0, 8).toUpperCase();
      await supabase.from("agent_leads").update({ partner_code: code }).eq("id", lead_id);

      await supabase.from("agent_activities").insert({ lead_id, type: "note", body: `Partner code generated: ${code}`, meta: {}, rep_id: userData.user.id });

      return new Response(JSON.stringify({ success: true, partner_code: code }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bulk_send") {
      const { template_id, lead_ids, campaign_name } = params;
      const { data: template } = await supabase.from("campaign_templates").select("*").eq("id", template_id).single();
      if (!template) throw new Error("Template not found");

      const { data: leads } = await supabase.from("agent_leads").select("*").in("id", lead_ids).is("merged_into", null);
      if (!leads?.length) throw new Error("No leads found");

      // Create campaign record
      const { data: campaign } = await supabase.from("outreach_campaigns").insert({
        template_id, name: campaign_name || template.name, status: "sending",
        target_filter: { lead_ids }, sent_count: 0, created_by: userData.user.id,
      }).select().single();

      let sentCount = 0;
      const errors: string[] = [];

      const blockedBulk = await suppressedSet(supabase);
      for (const lead of leads) {
        try {
          lead.company = lead.company || lead.business_name;
          if (lead.do_not_contact || (lead.email && blockedBulk.has(String(lead.email).toLowerCase()) && template.channel === "email")) {
            errors.push(`${lead.email}: unsubscribed / do-not-contact, skipped`);
            continue;
          }
          if (template.channel === "email" && lead.email) {
            const finalBody = replacePlaceholders(template.body, lead);
            const finalSubject = replacePlaceholders(template.subject || "", lead);
            await sendEmail(lead.email, finalSubject, finalBody, await unsubscribeUrl(lead.email), true);
            await supabase.from("agent_activities").insert({ lead_id: lead.id, type: "email_sent", body: `Campaign: ${campaign_name || template.name}`, meta: { campaign_id: campaign?.id, subject: finalSubject }, rep_id: userData.user.id });
            sentCount++;
          } else if (template.channel === "sms" && lead.phone) {
            const finalBody = replacePlaceholders(template.body, lead);
            await sendSMS(lead.phone, finalBody);
            await supabase.from("agent_activities").insert({ lead_id: lead.id, type: "sms_sent", body: `Campaign: ${campaign_name || template.name}`, meta: { campaign_id: campaign?.id }, rep_id: userData.user.id });
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

    if (action === "broadcast" || action === "broadcast_test") {
      const { template_id, campaign_name, dry_run, test_to } = params;
      const { data: template } = await supabase.from("campaign_templates").select("*").eq("id", template_id).single();
      if (!template || template.channel !== "email") throw new Error("Email template not found");
      const DAILY_CAP = 50;
      const logName = `campaign:${template_id}`;

      if (action === "broadcast_test") {
        const to = String(test_to || "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error("Enter a valid test email");
        const lead = { name: "Simon", email: to };
        await sendEmail(to, "[TEST] " + replacePlaceholders(template.subject || "", lead), replacePlaceholders(template.body, lead), undefined, true);
        return new Response(JSON.stringify({ success: true, sent_to: to }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Who to skip: suppressed, SendGrid unsubscribes, and Agent HQ leads who replied / opted out / not interested
      const blocked = new Set<string>();
      for (const e of await suppressedSet(supabase)) blocked.add(e);
      for (const r of await sendgridUnsubscribes()) blocked.add(r);
      const { data: allAgent } = await supabase.from("agent_leads").select("id,name,business_name,email,status,do_not_contact,replied_at,reply_intent,partner_code").not("email", "is", null).is("merged_into", null);
      const skipAgent = (l: any) => l.do_not_contact || l.replied_at || l.status !== "contacted" ||
        /not.?interested|unsubscribe|opt.?out|negative|stop/i.test(`${l.reply_intent || ""} ${l.status}`);
      for (const l of allAgent || []) if (skipAgent(l)) blocked.add(String(l.email).trim().toLowerCase());
      const { data: already } = await supabase.from("email_send_log").select("recipient_email").eq("template_name", logName).eq("status", "sent");
      const alreadySent = new Set((already || []).map((r: any) => String(r.recipient_email).toLowerCase()));

      const crm: any[] = []; // old CRM leads now live in agent_leads
      const seen = new Set<string>();
      const recipients: { kind: "crm" | "agent"; id: string; email: string; lead: Record<string, any> }[] = [];
      const add = (kind: "crm" | "agent", l: any) => {
        const e = String(l.email).trim().toLowerCase();
        if (!e || seen.has(e) || blocked.has(e) || alreadySent.has(e)) return;
        seen.add(e); recipients.push({ kind, id: l.id, email: e, lead: { ...l, company: l.company || l.business_name } });
      };
      for (const l of crm || []) add("crm", l);
      for (const l of allAgent || []) if (!skipAgent(l)) add("agent", l);

      const today = new Date().toISOString().slice(0, 10);
      const { count: sentToday } = await supabase.from("email_send_log").select("id", { count: "exact", head: true })
        .like("template_name", "campaign:%").eq("status", "sent").gte("created_at", today);
      const remainingToday = Math.max(0, DAILY_CAP - (sentToday || 0));
      const batch = recipients.slice(0, remainingToday);

      if (dry_run) {
        return new Response(JSON.stringify({ count: recipients.length, today: batch.length, cap: DAILY_CAP, already: alreadySent.size,
          crm: batch.filter(r => r.kind === "crm").length, agent: batch.filter(r => r.kind === "agent").length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!batch.length) throw new Error(remainingToday ? "Nobody left to send to" : "Daily limit of 50 reached, try tomorrow");

      const { data: campaign } = await supabase.from("outreach_campaigns").insert({
        template_id, name: campaign_name || template.name, status: "sending",
        target_filter: { broadcast: true, count: batch.length }, sent_count: 0, created_by: userData.user.id,
      }).select().single();

      const base = Deno.env.get("SUPABASE_URL")!;
      let sentCount = 0;
      const errors: string[] = [];
      for (const r of batch) {
        try {
          const unsub = await unsubscribeUrl(r.email);
          const lead = { ...r.lead, name: (r.lead.name || "").split(" ")[0] || "there" };
          const subject = replacePlaceholders(template.subject || "", lead);
          await sendEmail(r.email, subject, replacePlaceholders(template.body, lead), unsub, true);
          await supabase.from("email_send_log").insert({ template_name: logName, recipient_email: r.email, status: "sent", metadata: { campaign_id: campaign?.id } });
          await supabase.from("agent_leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", r.id);
          await supabase.from("agent_activities").insert({ lead_id: r.id, type: "campaign_send", body: `Campaign: ${campaign_name || template.name}`, meta: { campaign_id: campaign?.id, subject }, rep_id: userData.user.id });
          sentCount++;
        } catch (e) {
          errors.push(`${r.email}: ${(e as Error).message}`);
          await supabase.from("email_send_log").insert({ template_name: logName, recipient_email: r.email, status: "failed", error_message: (e as Error).message });
        }
      }
      if (campaign) await supabase.from("outreach_campaigns").update({ status: "sent", sent_count: sentCount }).eq("id", campaign.id);
      return new Response(JSON.stringify({ success: true, sent_count: sentCount, remaining: recipients.length - batch.length, errors }), {
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
