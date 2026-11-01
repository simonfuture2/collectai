// Mirrors supabase/functions/reanalyze-card/rules.ts so buttons show what the server will charge.
export const STUCK_AFTER_MS = 10 * 60 * 1000;

type CardState = { analysis_status?: string | null; analysis_started_at?: string | null } | null | undefined;

export function isFreeRetry(card: CardState, now = Date.now()) {
  const s = card?.analysis_status;
  if (s === "failed") return true;
  if (s === "identifying" || s === "pricing") {
    const t = card?.analysis_started_at ? Date.parse(card.analysis_started_at) : 0;
    return now - t > STUCK_AFTER_MS;
  }
  return false;
}

/** "Free retry" for failed/stuck, "Free with Pro" for Pro/beta, otherwise "1 credit". */
export function analysisCost(card: CardState, isPro: boolean, now = Date.now()) {
  if (isFreeRetry(card, now)) return "Free retry";
  return isPro ? "Free with Pro" : "1 credit";
}

export const withCost = (label: string, card: CardState, isPro: boolean) => `${label} · ${analysisCost(card, isPro)}`;
