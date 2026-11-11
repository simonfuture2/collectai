// Lead fit score (0–100) shared by enrich-lead, the daily lead run and the admin screens
// (src/lib/leadScoring.ts re-exports this file). Pure functions only.

export interface LeadSignals {
  buysCards?: boolean;
  tcgFocus?: boolean;
  sports?: boolean;
  otherCollectibles?: boolean;
  activeSocial?: boolean;
  events?: boolean;
  publicEmail?: boolean;
  onlineStore?: boolean;
  leadType?: string | null;
  followers?: number | null;
}

export const SCORE_POINTS = {
  buysCards: 25, tcgFocus: 20, sports: 10, otherCollectibles: 5, activeSocial: 10,
  events: 10, publicEmail: 15, onlineStore: 10, bigCreator: 15,
} as const;
export const BIG_CREATOR_FOLLOWERS = 5000;
export const ENRICH_BATCH_MAX = 50;
export const ENRICH_MAX_ATTEMPTS = 3; // first try + 2 retries
export const PLACES_DAILY_CAP_DEFAULT = 40;
export const PLACES_COST_PER_SEARCH_USD = 0.035; // Text Search (Enterprise fields, includes website) list price per request
export const MAX_RADIUS_METERS = 50_000;

export function fitScore(s: LeadSignals): number {
  let n = 0;
  if (s.buysCards) n += SCORE_POINTS.buysCards;
  if (s.tcgFocus) n += SCORE_POINTS.tcgFocus;
  if (s.sports) n += SCORE_POINTS.sports;
  if (s.otherCollectibles) n += SCORE_POINTS.otherCollectibles;
  if (s.activeSocial) n += SCORE_POINTS.activeSocial;
  if (s.events) n += SCORE_POINTS.events;
  if (s.publicEmail) n += SCORE_POINTS.publicEmail;
  if (s.onlineStore) n += SCORE_POINTS.onlineStore;
  if (s.leadType === "creator" && (s.followers ?? 0) >= BIG_CREATOR_FOLLOWERS) n += SCORE_POINTS.bigCreator;
  return Math.max(0, Math.min(100, n));
}

/** Miles → meters, clamped to Google's 50 km search circle. */
export function radiusMeters(miles: number): number {
  const m = Math.round(Math.max(5, Math.min(30, miles || 25)) * 1609.34);
  return Math.min(m, MAX_RADIUS_METERS);
}

export function placesCostEstimate(cities: number, terms: number): { searches: number; usd: number } {
  const searches = Math.max(0, cities) * Math.max(0, terms);
  return { searches, usd: Math.round(searches * PLACES_COST_PER_SEARCH_USD * 100) / 100 };
}

/** Should enrichment try this lead again? */
export function shouldRetryEnrich(attempts: number, status: string | null | undefined): boolean {
  if (status === "done") return false;
  return attempts < ENRICH_MAX_ATTEMPTS;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JUNK = /(example\.|sentry|wixpress|\.png$|\.jpg$|\.webp$|\.gif$|domain\.com|email\.com|yourname|noreply|no-reply)/i;
/** Emails actually written in the text — never guessed. */
export function emailsInText(text: string): string[] {
  const out = new Set<string>();
  for (const m of String(text || "").matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase().replace(/^mailto:/, "").replace(/[.,;)]+$/, "");
    if (!JUNK.test(e)) out.add(e);
  }
  return [...out];
}

/** Referral rewards: friend gets credits after this many price checks; referrer capped per month. */
export const FRIEND_REWARD_AFTER_CHECKS = 5;
export const REFERRAL_REWARD = 3;
export const REFERRER_MONTHLY_CAP = 30;
export function referrerReward(earnedThisMonth: number): number {
  return Math.max(0, Math.min(REFERRAL_REWARD, REFERRER_MONTHLY_CAP - earnedThisMonth));
}
export function friendRewardDue(priceChecks: number, alreadyCredited: boolean): boolean {
  return !alreadyCredited && priceChecks >= FRIEND_REWARD_AFTER_CHECKS;
}
