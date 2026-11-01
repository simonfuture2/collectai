// Pure candidate-quality rules for price-check (no I/O).
import { rungForGrade, type LadderKey } from "../_shared/pcValuation.ts";

export type Slab = { company?: string | null; grade?: string | number | null; label?: string | null } | null | undefined;

/** Ladder rung for a slab read off the photo; null when not a slab or no matching rung. */
export function slabRung(slab: Slab): LadderKey | null {
  if (!slab?.company || slab.grade === null || slab.grade === undefined || slab.grade === "") return null;
  const r = rungForGrade(slab.company, slab.grade, slab.label ?? null);
  return r === "ungraded" ? null : r;
}

export type Lang = "english" | "japanese" | "korean" | "other" | null;
export function normLanguage(l?: string | null): Lang {
  const s = String(l ?? "").toLowerCase().trim();
  if (!s) return null;
  if (s.startsWith("jap") || s === "jp" || s === "ja") return "japanese";
  if (s.startsWith("kor") || s === "kr" || s === "ko") return "korean";
  if (s.startsWith("eng") || s === "en") return "english";
  return "other";
}

export const isJapaneseProduct = (name: string, set: string | null) => /japanese/i.test(`${name} ${set ?? ""}`);

/** Score boost: when JP/KR text was read, Japanese products rise and others drop. */
export function languageBoost(lang: Lang, name: string, set: string | null): number {
  if (lang !== "japanese" && lang !== "korean") return 0;
  return isJapaneseProduct(name, set) ? 15 : -10;
}

/** Parallel label from a product name, e.g. "Charizard [Reverse Holo] #4" → "Reverse Holo". */
export function parallelLabel(name: string): string | null {
  const br = name.match(/\[([^\]]+)\]/)?.[1];
  if (br) return br.trim();
  if (/\b1st edition\b/i.test(name)) return "1st Edition";
  const num = name.match(/\b([A-Za-z]+ )?\/\s?(\d{1,4})\b/);
  if (num) return `${num[1] ?? ""}/${num[2]}`.trim();
  return null;
}

/** Name with parallel markers removed, used to group versions of the same card. */
export function baseKey(name: string, number: string | null): string {
  const n = name
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b1st edition\b/gi, " ")
    .replace(/#\s*[\w-]+/g, " ")
    .replace(/\b([A-Za-z]+ )?\/\s?\d{1,4}\b/g, " ")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${n}|${String(number ?? "").toLowerCase()}`;
}

/** Keep parallels of the same card next to each other; groups ordered by their best score. Input must be score-sorted. */
export function groupParallels<T extends { name: string; number: string | null; score: number }>(sorted: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of sorted) {
    const k = baseKey(c.name, c.number);
    const g = groups.get(k);
    if (g) g.push(c); else groups.set(k, [c]);
  }
  return [...groups.values()].flat();
}

/** Accuracy % from picked ranks (null/1 = #1 was right; 0 = picked from search, outside the list). */
export function accuracy(ranks: Array<number | null>) {
  const total = ranks.length;
  if (!total) return { total: 0, top1: 0, top3: 0 };
  const top1 = ranks.filter((r) => r === null || r === 1).length;
  const top3 = ranks.filter((r) => r === null || (r >= 1 && r <= 3)).length;
  return { total, top1: Math.round((top1 / total) * 100), top3: Math.round((top3 / total) * 100) };
}
