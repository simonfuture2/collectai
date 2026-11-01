export const PRICE_ONLY_UPGRADE_CREDITS = 1;
export const STUCK_AFTER_MS = 10 * 60 * 1000;
export const FREE_SCANS_PER_HOUR = 10;
export const PRO_SCANS_PER_HOUR = 60;

export type Billing = "charge" | "free_retry" | "busy";

/** Paid: price-only upgrade or re-run of a completed analysis. Free: retry of a failed/stuck one. */
export function billingFor(
  card: { analysis_depth?: string | null; analysis_status?: string | null; analysis_started_at?: string | null },
  now = Date.now(),
): Billing {
  const status = card.analysis_status ?? "";
  if (card.analysis_depth === "price_only" && status === "complete") return "charge";
  if (status === "complete") return "charge";
  if (status === "failed") return "free_retry";
  if (status === "identifying" || status === "pricing") {
    const started = card.analysis_started_at ? Date.parse(card.analysis_started_at) : 0;
    return now - started > STUCK_AFTER_MS ? "free_retry" : "busy";
  }
  return "charge";
}

export const isProAccess = (c: { plan?: string | null; beta_access_until?: string | null } | null, now = Date.now()) =>
  c?.plan === "pro" || (!!c?.beta_access_until && Date.parse(c.beta_access_until) > now);
