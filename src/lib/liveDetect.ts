// Live card scanner: thresholds, pure geometry/hash helpers and the OpenCV pipeline.
// Pure helpers are tested in liveDetect.test.mts; OpenCV functions take `cv` as an argument.

/* ------------------------------ thresholds ------------------------------ */
export const LIVE = {
  FRAME_WIDTH: 360,          // analysis frame width (px)
  FRAME_INTERVAL_MS: 100,    // ~10 frames a second
  CARD_ASPECT: 63 / 88,      // short side / long side
  ASPECT_TOLERANCE: 0.15,    // ±15%
  SLAB_ASPECT: 0.585,        // PSA/BGS slab short/long
  SLAB_TOLERANCE: 0.12,
  MIN_COVERAGE: 0.12,        // of frame area
  MAX_COVERAGE: 0.9,
  CLOSER_BELOW: 0.25,        // found but smaller than this → "Move closer"
  EMA_ALPHA: 0.45,           // corner smoothing (higher = follows faster)
  LOST_AFTER_MS: 300,
  STEADY_MS: 600,            // low motion this long → auto-capture
  MOTION_MAX: 0.012,         // avg corner move per frame, as a fraction of frame width
  SHARPNESS_MIN: 60,         // Laplacian variance inside the card
  FALLBACK_DIFF_MAX: 6,      // fallback mode: mean abs pixel diff between frames
  SLOW_FRAME_MS: 150,        // slower than this (median) → fixed guides
  SLOW_SAMPLE: 15,
  CANNY_LOW: 50,
  CANNY_HIGH: 150,
  APPROX_EPS: 0.02,
  OUT_W: 630,
  OUT_H: 880,
  JPEG_QUALITY: 0.85,
  DUP_HAMMING_MAX: 10,
  ERROR_PAUSE_MS: 2_000,
  RESULT_MS: 1_200,         // show "Found – name" this long
  LEAVE_MS: 400,            // no card this long ends the cooldown
  IDLE_HINT_MS: 4_000,      // auto on, no card this long → hint
  SHARP_GRACE_MS: 1_800,    // still this long but never "sharp" → capture anyway
  GUIDE_COVERAGE_W: 0.62,    // fallback guide width as fraction of the view width
} as const;

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // tl, tr, br, bl

/* ------------------------------ geometry ------------------------------ */
export function orderCorners(pts: Pt[]): Quad {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function quadSize(q: Quad) {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  return { w, h };
}

/** "card" | "slab" | null by the shape's short/long ratio. */
export function shapeKind(w: number, h: number): "card" | "slab" | null {
  if (w <= 0 || h <= 0) return null;
  const r = Math.min(w, h) / Math.max(w, h);
  if (Math.abs(r - LIVE.CARD_ASPECT) <= LIVE.CARD_ASPECT * LIVE.ASPECT_TOLERANCE) return "card";
  if (Math.abs(r - LIVE.SLAB_ASPECT) <= LIVE.SLAB_ASPECT * LIVE.SLAB_TOLERANCE) return "slab";
  return null;
}

export const coverageOk = (c: number) => c >= LIVE.MIN_COVERAGE && c <= LIVE.MAX_COVERAGE;

export function emaQuad(prev: Quad | null, next: Quad, alpha: number = LIVE.EMA_ALPHA): Quad {
  if (!prev) return next;
  return next.map((p, i) => ({ x: prev[i].x + alpha * (p.x - prev[i].x), y: prev[i].y + alpha * (p.y - prev[i].y) })) as Quad;
}

/** Average corner movement between two quads, in the same units as the points. */
export function quadMotion(a: Quad | null, b: Quad | null): number {
  if (!a || !b) return Infinity;
  return a.reduce((s, p, i) => s + dist(p, b[i]), 0) / 4;
}

export const isLandscape = (q: Quad) => { const { w, h } = quadSize(q); return w > h; };

/* ------------------------------ scan state ------------------------------ */
export type ScanState = "searching" | "closer" | "steady" | "capturing";

export function scanState(i: { found: boolean; coverage: number; capturing: boolean }): ScanState {
  if (i.capturing) return "capturing";
  if (!i.found) return "searching";
  if (i.coverage < LIVE.CLOSER_BELOW) return "closer";
  return "steady";
}

/** Steadiness bookkeeping: returns the new steady-since timestamp (or null) and whether to fire. */
export function steadyStep(since: number | null, now: number, still: boolean, sharp: boolean) {
  // Sharpness alone never blocks forever: a card held still for SHARP_GRACE_MS fires anyway.
  if (!still) return { since: null as number | null, fire: false, progress: 0 };
  const s = since ?? now;
  const need = sharp ? LIVE.STEADY_MS : LIVE.SHARP_GRACE_MS;
  const progress = Math.min(1, (now - s) / need);
  return { since: s, fire: now - s >= need, progress };
}

export const PILL: Record<ScanState, string> = {
  searching: "Point at a card",
  closer: "Move closer",
  steady: "Hold steady…",
  capturing: "Checking price…",
};

/* ------------------------------ scanner phases ------------------------------ */
export type ScanPhase = "idle" | "searching" | "tracking" | "steady" | "capturing" | "checking" | "result" | "error" | "cooldown";

/** Phases where the frame loop must not analyse frames. */
export const loopPaused = (p: ScanPhase) => p === "capturing" || p === "checking" || p === "idle";

/** Cooldown ends when the card has left the frame, or a clearly different card is in view. */
export function cooldownDone(i: { now: number; lastSeen: number; hashDist: number | null }): "left" | "new" | null {
  if (!i.lastSeen || i.now - i.lastSeen >= LIVE.LEAVE_MS) return "left";
  if (i.hashDist != null && i.hashDist > LIVE.DUP_HAMMING_MAX) return "new";
  return null;
}

/** Live (not capturing) phase from detection results. */
export const trackPhase = (found: boolean, coverage: number): ScanPhase =>
  !found ? "searching" : coverage < LIVE.CLOSER_BELOW ? "tracking" : "steady";

/** Whether auto mode should show the idle hint. */
export const showIdleHint = (auto: boolean, phase: ScanPhase, now: number, lastCardAt: number, since: number) =>
  auto && phase === "searching" && now - Math.max(lastCardAt, since) >= LIVE.IDLE_HINT_MS;

/* ------------------------------ duplicate guard ------------------------------ */
/** 64-bit difference hash from a 9×8 grayscale grid (row-major, 72 values). Hex string. */
export function dHash(gray9x8: ArrayLike<number>): string {
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray9x8[y * 9 + x] > gray9x8[y * 9 + x + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export const isDuplicate = (h: string, last: string | null) => !!last && hamming(h, last) <= LIVE.DUP_HAMMING_MAX;

/* ------------------------------ pickers ------------------------------ */
export const GAMES: { id: string; label: string; category?: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "pokemon", label: "Pokémon", category: "pokemon-cards" },
  { id: "onepiece", label: "One Piece", category: "onepiece-cards" },
  { id: "magic", label: "Magic", category: "magic-cards" },
  { id: "yugioh", label: "Yu-Gi-Oh!", category: "yugioh-cards" },
  { id: "lorcana", label: "Lorcana", category: "lorcana-cards" },
  { id: "dragonball", label: "Dragon Ball", category: "dragon-ball-cards" },
  { id: "sports", label: "Sports" },
  { id: "other", label: "Other TCG" },
];
export const categoryFor = (gameId: string) => GAMES.find(g => g.id === gameId)?.category;

export const LANGUAGES = [
  { id: "any", flag: "🌐", label: "Any" },
  { id: "english", flag: "🇺🇸", label: "English" },
  { id: "japanese", flag: "🇯🇵", label: "Japanese" },
  { id: "korean", flag: "🇰🇷", label: "Korean" },
  { id: "chinese", flag: "🇨🇳", label: "Chinese" },
] as const;
export type LangId = typeof LANGUAGES[number]["id"];
export const nextLanguage = (id: string): LangId => {
  const i = LANGUAGES.findIndex(l => l.id === id);
  return LANGUAGES[(i + 1) % LANGUAGES.length].id;
};
export const flagFor = (lang: string | null | undefined) =>
  lang === "japanese" ? "🇯🇵" : lang === "korean" ? "🇰🇷" : lang === "chinese" ? "🇨🇳" : null;

/** Plain-words pill message for a failed price check. */
export function errorPill(status: number | null): { text: string; hardPause: boolean } {
  if (status === 429) return { text: "You've hit 100 scans this hour – tap play to resume later", hardPause: true };
  if (status === 422) return { text: "Couldn't read that card – try less glare", hardPause: false };
  return { text: "Busy – trying again", hardPause: false };
}

/* ------------------------------ pixel helpers (no OpenCV) ------------------------------ */
export function toGray(d: Uint8ClampedArray): Uint8Array {
  const g = new Uint8Array(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  return g;
}

/** Variance of a 4-neighbour Laplacian over a grayscale image. */
export function laplacianVariance(g: ArrayLike<number>, w: number, h: number): number {
  let sum = 0, sq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const v = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
    sum += v; sq += v * v; n++;
  }
  if (!n) return 0;
  const m = sum / n;
  return sq / n - m * m;
}

export function meanAbsDiff(a: ArrayLike<number> | null, b: ArrayLike<number>): number {
  if (!a || a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < b.length; i++) s += Math.abs(a[i] - b[i]);
  return s / b.length;
}

/* ------------------------------ OpenCV pipeline ------------------------------ */
// deno-lint-ignore no-explicit-any
type CV = any;

let cvPromise: Promise<CV> | null = null;
/** Lazy-loads OpenCV.js once. Rejects after 20 s. */
export function loadOpenCV(): Promise<CV> {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise<CV>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OpenCV timeout")), 20_000);
    import("@techstark/opencv-js").then((mod: any) => {
      const cv = mod.default ?? mod;
      const done = (c: CV) => { clearTimeout(timer); resolve({ cv: c }); };
      if (cv?.Mat) return done(cv);
      if (typeof cv?.then === "function") return cv.then((c: CV) => done(c));
      cv.onRuntimeInitialized = () => done(cv);
    }).catch((e) => { clearTimeout(timer); reject(e); });
  }).then((w: any) => w.cv);
  return cvPromise;
}

export type Detection = { quad: Quad; coverage: number; kind: "card" | "slab"; sharpness: number };

/** Finds the largest card-like (or slab-like) convex quad in a small frame canvas. */
export function detectCard(cv: CV, frame: HTMLCanvasElement): Detection | null {
  const W = frame.width, H = frame.height;
  const src = cv.imread(frame);
  const gray = new cv.Mat(), edges = new cv.Mat(), contours = new cv.MatVector(), hier = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  let best: { quad: Quad; area: number; kind: "card" | "slab" } | null = null;
  let slab: typeof best = null;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, edges, new cv.Size(5, 5), 0);
    cv.Canny(edges, edges, LIVE.CANNY_LOW, LIVE.CANNY_HIGH);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      const cov = area / (W * H);
      if (!coverageOk(cov)) { c.delete(); continue; }
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, LIVE.APPROX_EPS * cv.arcLength(c, true), true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const pts: Pt[] = [];
        for (let k = 0; k < 4; k++) pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
        const quad = orderCorners(pts);
        const { w, h } = quadSize(quad);
        const kind = shapeKind(w, h);
        if (kind === "card" && (!best || area > best.area)) best = { quad, area, kind };
        if (kind === "slab" && (!slab || area > slab.area)) slab = { quad, area, kind };
      }
      approx.delete(); c.delete();
    }
    const pick = best ?? slab;
    if (!pick) return null;
    // Sharpness inside the shape's bounding box.
    const xs = pick.quad.map(p => p.x), ys = pick.quad.map(p => p.y);
    const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys));
    const rw = Math.min(W - x0, Math.max(...xs) - x0), rh = Math.min(H - y0, Math.max(...ys) - y0);
    let sharpness = 0;
    if (rw > 8 && rh > 8) {
      const roi = gray.roi(new cv.Rect(x0, y0, rw, rh));
      const lap = new cv.Mat(), mean = new cv.Mat(), sd = new cv.Mat();
      cv.Laplacian(roi, lap, cv.CV_64F);
      cv.meanStdDev(lap, mean, sd);
      sharpness = sd.data64F[0] ** 2;
      roi.delete(); lap.delete(); mean.delete(); sd.delete();
    }
    return { quad: pick.quad, coverage: pick.area / (W * H), kind: pick.kind, sharpness };
  } finally {
    src.delete(); gray.delete(); edges.delete(); contours.delete(); hier.delete(); kernel.delete();
  }
}

/** Flattens the quad (in `source` pixel coords) into an upright card canvas. */
export function warpCard(cv: CV, source: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const land = isLandscape(quad);
  const ow = land ? LIVE.OUT_H : LIVE.OUT_W, oh = land ? LIVE.OUT_W : LIVE.OUT_H;
  const src = cv.imread(source), dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap(p => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, ow, 0, ow, oh, 0, oh]);
  const M = cv.getPerspectiveTransform(from, to);
  const out = document.createElement("canvas");
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(ow, oh), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    cv.imshow(out, dst);
  } finally { src.delete(); dst.delete(); from.delete(); to.delete(); M.delete(); }
  return out;
}

/** Plain crop (fallback mode): the axis-aligned rect of the quad. */
export function cropCard(source: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const xs = quad.map(p => p.x), ys = quad.map(p => p.y);
  const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys));
  const w = Math.min(source.width - x0, Math.max(...xs) - x0), h = Math.min(source.height - y0, Math.max(...ys) - y0);
  const land = w > h;
  const out = document.createElement("canvas");
  out.width = land ? LIVE.OUT_H : LIVE.OUT_W; out.height = land ? LIVE.OUT_W : LIVE.OUT_H;
  out.getContext("2d")!.drawImage(source, x0, y0, w, h, 0, 0, out.width, out.height);
  return out;
}

/** dHash of a canvas. */
export function canvasHash(c: HTMLCanvasElement): string {
  const t = document.createElement("canvas"); t.width = 9; t.height = 8;
  const ctx = t.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(c, 0, 0, 9, 8);
  return dHash(toGray(ctx.getImageData(0, 0, 9, 8).data));
}
