// Funnel maths for the admin Funnel view. Rows come from agent_funnel(days).
export type FunnelRow = { ref_code: string; event_type: string; events: number; people: number };

export const FUNNEL_STEPS = ["landing_view", "demo_result", "signup", "first_scan"] as const;

export const FUNNEL_EVENTS = [
  "landing_view", "demo_cta_click", "demo_upload_started", "demo_result", "demo_error", "demo_sample_tap",
  "demo_limit_hit", "save_card_click", "signup", "demo_card_imported", "first_scan", "paid", "visit", "demo_scan",
  "webinar_view", "webinar_signup", "webinar_play", "webinar_half", "webinar_complete", "webinar_scan_click",
] as const;

/** People per funnel step (optionally for one ref) and the step-to-step conversion %, null when the previous step is 0. */
export function funnelSteps(rows: FunnelRow[], ref?: string) {
  const people = (e: string) => rows.filter(r => r.event_type === e && (!ref || r.ref_code === ref)).reduce((s, r) => s + Number(r.people), 0);
  return FUNNEL_STEPS.map((step, i) => {
    const n = people(step);
    const prev = i ? people(FUNNEL_STEPS[i - 1]) : null;
    return { step, people: n, rate: prev == null ? null : prev > 0 ? Math.round((n / prev) * 1000) / 10 : null };
  });
}

/** Event → ref → count table. */
export function countsByRef(rows: FunnelRow[]) {
  const refs = [...new Set(rows.map(r => r.ref_code))].sort((a, b) => (a === "direct" ? -1 : b === "direct" ? 1 : a.localeCompare(b)));
  const get = (e: string, ref: string) => Number(rows.find(r => r.event_type === e && r.ref_code === ref)?.events ?? 0);
  return { refs, rows: FUNNEL_EVENTS.map(e => ({ event: e, total: refs.reduce((s, r) => s + get(e, r), 0), byRef: Object.fromEntries(refs.map(r => [r, get(e, r)])) })) };
}
