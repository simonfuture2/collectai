import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendgridMarketing, suppressedSet, unsubscribeUrl } from "../_shared/outreach.ts";
import { assertLane, coldBodyProblem, marketingFooter, pickLane } from "../_shared/lanes.ts";

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
      let optIn = false;
      if (lead.user_id) optIn = !!(await supabase.from("profiles").select("marketing_opt_in").eq("id", lead.user_id).maybeSingle()).data?.marketing_opt_in;
      const lane = pickLane({ consent_email: lead.consent_email, marketing_opt_in: optIn });
      const finalSubject = replacePlaceholders(subject, lead);
      const unsub = await unsubscribeUrl(lead.email);
      const { data: cfgRow } = await supabase.from("agent_settings").select("config").eq("key", "email_outreach").maybeSingle();
      const address = String(cfgRow?.config?.physical_address ?? "306 W Redwood Street, Baltimore, MD 21201");
      const text = replacePlaceholders(body, lead).replace(/<[^>]+>/g, "") + marketingFooter(address, unsub);

      if (lane === "opted_in") {
        assertLane("sendgrid", { email: lead.email, consent_email: lead.consent_email, marketing_opt_in: optIn });
        await sendgridMarketing(lead.email, finalSubject, text, unsub, { test: true });
        await supabase.from("agent_activities").insert({ lead_id, type: "email_sent", body: `Subject: ${finalSubject}`, meta: { subject: finalSubject, lane }, rep_id: userData.user.id });
        return new Response(JSON.stringify({ success: true, lane }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Cold: queue for a cold inbox; never SendGrid.
      const problem = coldBodyProblem(text, unsub);
      if (problem) throw new Error(problem);
      const { error: qErr } = await supabase.from("agent_outreach").insert({
        lead_id, workflow: "email_outreach", channel: "email", external_ref: `manual:${lead_id}:${Date.now()}`,
        subject: finalSubject, draft_text: text, final_text: text, ref_code: "email_manual", status: "approved", decided_at: new Date().toISOString(),
      });
      if (qErr) throw new Error(qErr.message);
      await supabase.from("agent_activities").insert({ lead_id, type: "email_queued", body: `Subject: ${finalSubject}`, meta: { subject: finalSubject, lane }, rep_id: userData.user.id });
      return new Response(JSON.stringify({ success: true, lane, queued: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "send_sms") {
      const { lead_id, body } = params;
      const { data: lead } = await supabase.from("agent_leads").select("*").eq("id", lead_id).single();
      if (!lead?.phone) throw new Error("Lead has no phone number");
      if (!lead.consent_sms) throw new Error("Refused: this lead hasn't agreed to texts");

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

    if (["bulk_send", "broadcast", "broadcast_test"].includes(action)) {
      return new Response(JSON.stringify({ error: "Bulk sending moved to Broadcasts" }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
