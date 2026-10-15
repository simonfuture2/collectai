// src/lib/agentRef.ts — tracks which agent post/email brought a visitor in (?ref=ig_123, reddit_reply, email_card_shop...)
// Uses the app's existing Supabase client, so the logged-in user's session is attached automatically.
import { supabase } from "@/integrations/supabase/client";

const REF_KEY = "mca_ref";
const ANON_KEY = "mca_anon";
const REF_TTL_DAYS = 30;

type AgentEvent = "visit" | "demo_scan" | "signup" | "first_scan" | "paid";

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

// Fire-and-forget. Does nothing for visitors who didn't arrive with a ref.
export async function trackAgentEvent(event: AgentEvent): Promise<void> {
  const ref = getRef();
  if (!ref) return;
  let anon_id: string | null = null;
  try { anon_id = store()?.getItem(ANON_KEY) ?? null; } catch { /* ignore */ }
  try {
    await supabase.functions.invoke("agent-track", { body: { ref, event, anon_id } });
  } catch { /* never block the app on tracking */ }
}
