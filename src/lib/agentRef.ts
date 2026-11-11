// src/lib/agentRef.ts — tracks which agent post/email brought a visitor in (?ref=ig_123, reddit_reply, email_card_shop...)
// Uses the app's existing Supabase client, so the logged-in user's session is attached automatically.
import { supabase } from "@/integrations/supabase/client";

const REF_KEY = "mca_ref";
const ANON_KEY = "mca_anon";
const REF_TTL_DAYS = 30;

export type AgentEvent =
  | "visit" | "demo_scan" | "signup" | "first_scan" | "paid"
  | "landing_view" | "demo_cta_click" | "demo_upload_started" | "demo_result" | "demo_error"
  | "demo_sample_tap" | "demo_limit_hit" | "save_card_click" | "demo_card_imported";

function store(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function captureRef(): void {
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (!ref || !/^[a-z0-9_\-]{2,64}$/i.test(ref)) return;
  try {
    const s = store();
    s?.setItem(REF_KEY, JSON.stringify({ ref, at: Date.now() }));
    if (!s?.getItem(ANON_KEY)) s?.setItem(ANON_KEY, crypto.randomUUID());
    // A friend's referral code (8 hex chars) on any page counts as a referral at sign-up.
    if (/^[0-9A-F]{8}$/.test(ref)) s?.setItem("collectai_ref", ref);
  } catch { /* storage blocked */ }
  void trackAgentEvent("visit");
}

export function getRef(): string | null {
  try {
    const raw = store()?.getItem(REF_KEY);
    if (!raw) return null;
    const { ref, at } = JSON.parse(raw);
    if (Date.now() - at > REF_TTL_DAYS * 864e5) return null;
    return ref;
  } catch { return null; }
}

function anonId(): string | null {
  try {
    const s = store();
    let id = s?.getItem(ANON_KEY) ?? null;
    if (!id && s) { id = crypto.randomUUID(); s.setItem(ANON_KEY, id); }
    return id;
  } catch { return null; }
}

// Fire-and-forget. Visitors who didn't arrive with a ref are tracked as "direct".
export async function trackAgentEvent(event: AgentEvent, meta?: Record<string, unknown>): Promise<void> {
  const ref = getRef() ?? "direct";
  const anon_id = anonId();
  try {
    await supabase.functions.invoke("agent-track", { body: { ref, event, anon_id, ...(meta ? { meta } : {}) } });
  } catch { /* never block the app on tracking */ }
}
