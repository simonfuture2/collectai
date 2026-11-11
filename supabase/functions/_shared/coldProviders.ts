// Cold-email platform adapters. Instantly first; add Smartlead by implementing the same interface.
export interface ColdLead { email: string; first_name?: string | null; company_name?: string | null; subject: string; body: string; outreach_id: string }
export interface ColdReply { message_id: string; from_email: string; subject: string; body: string }
export interface ColdProvider {
  name: "instantly" | "smartlead";
  pushLeads(campaignId: string, leads: ColdLead[]): Promise<{ ok: string[]; failed: { outreach_id: string; error: string }[] }>;
  replies(campaignId: string, sinceIso: string): Promise<ColdReply[]>;
  bounces(campaignId: string): Promise<string[]>;
}

export function instantly(apiKey: string): ColdProvider {
  const base = "https://api.instantly.ai/api/v2";
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
    if (!r.ok) throw new Error(`Instantly ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };
  return {
    name: "instantly",
    async pushLeads(campaignId, leads) {
      const ok: string[] = []; const failed: { outreach_id: string; error: string }[] = [];
      for (const l of leads) {
        try {
          // The campaign's sequence step should be {{custom_subject}} / {{custom_body}}.
          await call("/leads", { method: "POST", body: JSON.stringify({
            campaign: campaignId, email: l.email, first_name: l.first_name ?? undefined, company_name: l.company_name ?? undefined,
            custom_variables: { custom_subject: l.subject, custom_body: l.body, outreach_id: l.outreach_id },
          }) });
          ok.push(l.outreach_id);
        } catch (e) { failed.push({ outreach_id: l.outreach_id, error: (e as Error).message }); }
      }
      return { ok, failed };
    },
    async replies(campaignId, sinceIso) {
      const data = await call(`/emails?campaign_id=${campaignId}&email_type=received&limit=100`);
      return (data.items ?? []).filter((m: Record<string, string>) => !sinceIso || (m.timestamp_email ?? m.timestamp_created) > sinceIso).map((m: Record<string, any>) => ({
        message_id: String(m.message_id ?? m.id), from_email: String(m.from_address_email ?? m.lead ?? ""),
        subject: String(m.subject ?? ""), body: String(m.body?.text ?? m.content_preview ?? ""),
      }));
    },
    async bounces(campaignId) {
      const data = await call("/leads/list", { method: "POST", body: JSON.stringify({ campaign: campaignId, filter: "FILTER_VAL_BOUNCED", limit: 100 }) });
      return (data.items ?? []).map((l: Record<string, string>) => String(l.email).toLowerCase());
    },
  };
}
