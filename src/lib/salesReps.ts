// Sales rep rules shared by the /reps workspace and the admin Reps screens.
// SQL mirrors: rep_territory_match(), pick_rep_for(), rep_log_call(), rep_stats(), rep_commission_report().

export const CALL_OUTCOMES = [
  { id: "no_answer", label: "No answer" },
  { id: "voicemail", label: "Left voicemail" },
  { id: "interested", label: "Talked – interested" },
  { id: "not_now", label: "Talked – not now" },
  { id: "wrong_number", label: "Wrong number" },
  { id: "do_not_contact", label: "Do not contact" },
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number]["id"];

/** What each call outcome does to the lead and its sequence (mirrors rep_log_call). */
export const OUTCOME_EFFECT: Record<CallOutcome, { stage?: string; sequence: "continue" | "stop" | "pause"; followUpDays?: number }> = {
  no_answer: { sequence: "continue", followUpDays: 2 },
  voicemail: { sequence: "continue", followUpDays: 2 },
  interested: { stage: "replied", sequence: "stop", followUpDays: 0 },
  not_now: { sequence: "pause", followUpDays: 30 },
  wrong_number: { sequence: "continue" },
  do_not_contact: { stage: "do_not_contact", sequence: "stop" },
};

export const VOICEMAIL_MAX_SECONDS = 25;
export const WORDS_PER_SECOND = 2.5; // ~150 words a minute when speaking
export const voicemailSeconds = (text: string) => Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND);
export const voicemailFits = (text: string) => voicemailSeconds(text) <= VOICEMAIL_MAX_SECONDS;

const stripCounty = (s: string) => s.trim().replace(/\s+county$/i, "").toLowerCase();

/** 'MD' matches the whole state; 'MD:Harford' matches that county only. */
export function territoryMatch(territories: string[] | null | undefined, state?: string | null, county?: string | null): boolean {
  const st = String(state ?? "").trim().toUpperCase();
  if (!st) return false;
  return (territories ?? []).some((t) => {
    const [ts, tc] = t.split(":");
    if (ts.trim().toUpperCase() !== st) return false;
    if (tc === undefined) return true;
    return stripCounty(tc) === stripCounty(String(county ?? ""));
  });
}

/** Clean up an admin-typed territory list: "md, MD:harford county" -> ["MD", "MD:Harford"]. */
export function parseTerritories(input: string): string[] {
  const out = new Set<string>();
  for (const raw of input.split(/[,;\n]+/)) {
    const [s, c] = raw.trim().split(":");
    if (!/^[a-z]{2}$/i.test(s?.trim() ?? "")) continue;
    const county = c?.trim().replace(/\s+county$/i, "");
    out.add(county ? `${s.trim().toUpperCase()}:${county.replace(/\b\w/g, (m) => m.toUpperCase())}` : s.trim().toUpperCase());
  }
  return [...out];
}

export interface RepForAssign { user_id: string; active: boolean; territories: string[]; last_assigned_at: string | null; created_at: string }
/** Round-robin: the matching active rep assigned longest ago (never-assigned first). */
export function pickRep(reps: RepForAssign[], state?: string | null, county?: string | null): string | null {
  const m = reps.filter((r) => r.active && territoryMatch(r.territories, state, county));
  m.sort((a, b) => (a.last_assigned_at ? Date.parse(a.last_assigned_at) : -Infinity) - (b.last_assigned_at ? Date.parse(b.last_assigned_at) : -Infinity)
    || Date.parse(a.created_at) - Date.parse(b.created_at));
  return m[0]?.user_id ?? null;
}

/** Touches = emails sent + calls logged + DMs logged. */
export const touches = (s: { emails?: number; calls?: number; dms?: number }) => (s.emails ?? 0) + (s.calls ?? 0) + (s.dms ?? 0);
export const goalProgress = (done: number, goal: number) => (goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 100);

/** Commission in cents at a percentage rate (reporting only). */
export const commissionCents = (revenueCents: number, ratePct: number) => Math.round((revenueCents * ratePct) / 100);

export const isValidRefCode = (c: string) => /^[a-z0-9_-]{2,64}$/.test(c);
export const suggestRefCode = (name: string) => `rep_${name.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9]/g, "") || "new"}`;

/** Day before the meeting, or null when that is already past. */
export function reminderAt(meetingAt: Date, now = new Date()): Date | null {
  const r = new Date(meetingAt.getTime() - 86_400_000);
  return r.getTime() > now.getTime() ? r : null;
}

export const startOfWeek = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
