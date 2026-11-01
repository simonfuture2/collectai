export type Ladder = Record<string, number>;

/** Headline graded chips, in display order. Keys follow normalizeLadder on the server. */
export const GRADED_CHIPS: [key: string, label: string][] = [
  ["grade9", "PSA 9"], ["psa10", "PSA 10"], ["grade9_5", "BGS 9.5"],
  ["bgs10", "BGS 10"], ["cgc10", "CGC 10"], ["tag10", "TAG 10"],
];

export const FULL_LADDER: [string, string][] = [
  ["ungraded", "Ungraded"], ["grade1", "Grade 1"], ["grade2", "Grade 2"], ["grade3", "Grade 3"],
  ["grade4", "Grade 4"], ["grade5", "Grade 5"], ["grade6", "Grade 6"], ["grade7", "Grade 7"],
  ["grade8", "Grade 8"], ["grade9", "Grade 9 / PSA 9"], ["grade9_5", "Grade 9.5 / BGS 9.5"],
  ["psa10", "PSA 10"], ["bgs10", "BGS 10"], ["bgs10_black", "BGS 10 Black Label"], ["cgc10", "CGC 10"],
  ["cgc10_pristine", "CGC 10 Pristine"], ["sgc10", "SGC 10"], ["tag10", "TAG 10"], ["ace10", "ACE 10"],
];

const has = (l: Ladder | null | undefined, k: string) => {
  const v = Number(l?.[k]);
  return Number.isFinite(v) && v > 0;
};

export const gradedChips = (l: Ladder | null | undefined) =>
  GRADED_CHIPS.filter(([k]) => has(l, k)).map(([key, label]) => ({ key, label, value: Number(l![key]) }));

export const ladderRows = (l: Ladder | null | undefined) =>
  FULL_LADDER.filter(([k]) => has(l, k)).map(([key, label]) => ({ key, label, value: Number(l![key]) }));

/** Ungraded price or null — never a fallback/invented value. */
export const ungradedPrice = (l: Ladder | null | undefined) => (has(l, "ungraded") ? Number(l!.ungraded) : null);

/** Parallel/variant text from a PriceCharting product name, e.g. "Charizard [Reverse Holo] #4". */
export const parallelOf = (name: string) => name.match(/\[([^\]]+)\]/)?.[1] ?? null;

/** Hero price for a slab's grade rung; null rung = raw card. Never falls back to another grade. */
export const slabHero = (l: Ladder | null | undefined, rung: string | null | undefined) =>
  rung ? { rung, value: has(l, rung) ? Number(l![rung]) : null } : null;

export const languageChip = (lang: string | null | undefined) =>
  lang === "japanese" ? "Japanese" : lang === "korean" ? "Korean" : null;
