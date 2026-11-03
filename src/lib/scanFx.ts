// Laser-scan visual effects for /scan/live. Visual only: reads the scanner phase and the
// on-screen card quad, never changes detection, capture or matching.
// Pure geometry/timing helpers are tested in scanFx.test.mts.
import type { ScanPhase } from "@/lib/liveDetect";

export type P = { x: number; y: number };
export type SQuad = [P, P, P, P]; // tl, tr, br, bl (screen px)

export const FX = {
  SEARCH_BREATHE_MS: 1600,
  SEARCH_SWEEP_MS: 2400,
  RUN_MS: 1400,
  RUN_MS_CHECKING: 700,
  DASH_FRAC: 0.12,
  BEAM_PASS_MS: 900,       // one down-and-up pass while steady
  BEAM_PASS_CHECKING_MS: 500,
  BEAM_CORE: 3,
  BEAM_SOFT: 40,
  FLASH_MS: 120,
  RING_MS: 400,
  RESULT_HOLD_MS: 1200,
  RESULT_FADE_MS: 600,
  SHAKE_MS: 250,
  GRID_GAP: 2,
  GRID_ALPHA: 0.06,
  GRID_MIN_AREA: 6000,     // skip the grid on tiny cards (px²)
  INTERP_MS: 100,          // detection interval the corners are interpolated across
  LS_KEY: "live_fx",
} as const;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpP = (a: P, b: P, t: number): P => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const lerpQuad = (a: SQuad, b: SQuad, t: number) => a.map((p, i) => lerpP(p, b[i], t)) as SQuad;

/** Ping-pong 0→1→0 over one period. */
export const pingPong = (now: number, period: number) => { const u = (now % period) / period; return u < 0.5 ? u * 2 : 2 - u * 2; };

/** Beam line at sweep position t, following the card's perspective (left edge TL→BL, right edge TR→BR). */
export const beamLine = (q: SQuad, t: number): [P, P] => [lerpP(q[0], q[3], t), lerpP(q[1], q[2], t)];

const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
export const perimeter = (q: SQuad) => q.reduce((s, p, i) => s + d(p, q[(i + 1) % 4]), 0);

/** Point at fraction f (0..1) of the perimeter, clockwise from TL. */
export function perimeterPoint(q: SQuad, f: number): P {
  let left = (((f % 1) + 1) % 1) * perimeter(q);
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], L = d(a, b);
    if (left <= L || i === 3) return lerpP(a, b, L ? Math.min(1, left / L) : 0);
    left -= L;
  }
  return q[0];
}

/** Horizontal shake offset for the error state: 3 side-to-side moves, then 0. */
export const shakeOffset = (age: number) => (age >= FX.SHAKE_MS ? 0 : Math.sin((age / FX.SHAKE_MS) * Math.PI * 6) * 6 * (1 - age / FX.SHAKE_MS));

/** Result effect alpha: full while held, then fades over RESULT_FADE_MS. */
export const resultAlpha = (age: number) =>
  age < FX.RESULT_HOLD_MS ? 1 : Math.max(0, 1 - (age - FX.RESULT_HOLD_MS) / FX.RESULT_FADE_MS);

export const quadArea = (q: SQuad) => Math.abs(q.reduce((s, p, i) => s + p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y, 0)) / 2;

/* ------------------------------ drawing ------------------------------ */
export type FxColors = { gold: string; ok: string; err: string; fg: string; azure: string };
export type FxInput = {
  q: SQuad; guide: boolean; phase: ScanPhase; phaseAge: number; now: number;
  steady: number; resultAge: number | null; insight: boolean; reduced: boolean; colors: FxColors;
  /** hsl() builder with alpha, e.g. a("--primary", 0.5) */
  a: (token: keyof FxColors, alpha: number) => string;
};

const path = (ctx: CanvasRenderingContext2D, q: SQuad) => { ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };

function corners(ctx: CanvasRenderingContext2D, q: SQuad, len: number) {
  q.forEach((p, i) => {
    const a = q[(i + 1) % 4], b = q[(i + 3) % 4];
    const L = (t: P) => { const dd = d(t, p) || 1, l = Math.min(len, dd * 0.3); return { x: p.x + (t.x - p.x) / dd * l, y: p.y + (t.y - p.y) / dd * l }; };
    const pa = L(a), pb = L(b);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(p.x, p.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  });
}

function beam(ctx: CanvasRenderingContext2D, q: SQuad, t: number, color: (al: number) => string, core: number, soft: number) {
  const [l, r] = beamLine(q, t);
  // Normal to the beam (perpendicular in screen space), for the soft gradient band.
  const dx = r.x - l.x, dy = r.y - l.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const mx = (l.x + r.x) / 2, my = (l.y + r.y) / 2;
  const g = ctx.createLinearGradient(mx - nx * soft, my - ny * soft, mx + nx * soft, my + ny * soft);
  g.addColorStop(0, color(0)); g.addColorStop(0.5, color(0.35)); g.addColorStop(1, color(0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(l.x - nx * soft, l.y - ny * soft); ctx.lineTo(r.x - nx * soft, r.y - ny * soft);
  ctx.lineTo(r.x + nx * soft, r.y + ny * soft); ctx.lineTo(l.x + nx * soft, l.y + ny * soft); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = color(1); ctx.lineWidth = core;
  ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
}

function runningLights(ctx: CanvasRenderingContext2D, q: SQuad, now: number, period: number, n: number, color: (al: number) => string) {
  const head = (now % period) / period, steps = 10;
  for (let k = 0; k < n; k++) {
    const start = head + k / n;
    for (let s = 0; s < steps; s++) {
      const f0 = start - (s / steps) * FX.DASH_FRAC, f1 = start - ((s + 1) / steps) * FX.DASH_FRAC;
      const p0 = perimeterPoint(q, f0), p1 = perimeterPoint(q, f1);
      ctx.strokeStyle = color(1 - s / steps); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
  }
}

export function drawScanFx(ctx: CanvasRenderingContext2D, f: FxInput) {
  const { phase, now, reduced } = f;
  const tint: keyof FxColors = f.insight ? "azure" : "gold";
  const col = (tok: keyof FxColors) => (al: number) => f.a(tok, al);
  let q = f.q;

  // Error: soft red shake, then back to the normal look.
  if (phase === "error" && !reduced) { const o = shakeOffset(f.phaseAge); q = q.map(p => ({ x: p.x + o, y: p.y })) as SQuad; }

  ctx.lineJoin = "round"; ctx.lineCap = "round";

  // Result (green flash, ring, corner pop, fade) — overrides other looks while it plays.
  if (f.resultAge != null && f.resultAge < FX.RESULT_HOLD_MS + FX.RESULT_FADE_MS) {
    const al = resultAlpha(f.resultAge);
    ctx.save(); ctx.globalAlpha = al;
    ctx.strokeStyle = f.a("ok", 1); ctx.lineWidth = 4; ctx.shadowColor = f.a("ok", 1); ctx.shadowBlur = 18;
    path(ctx, q); ctx.stroke(); ctx.shadowBlur = 0;
    if (!reduced && f.resultAge < FX.RING_MS) {
      const u = f.resultAge / FX.RING_MS, cx = (q[0].x + q[2].x) / 2, cy = (q[0].y + q[2].y) / 2, sc = 1 + u * 0.25;
      const ring = q.map(p => ({ x: cx + (p.x - cx) * sc, y: cy + (p.y - cy) * sc })) as SQuad;
      ctx.globalAlpha = al * (1 - u); ctx.lineWidth = 3; path(ctx, ring); ctx.stroke(); ctx.globalAlpha = al;
    }
    const pop = !reduced && f.resultAge < 250 ? 1 + Math.sin((f.resultAge / 250) * Math.PI) * 0.6 : 1;
    ctx.lineWidth = 6; corners(ctx, q, 26 * pop);
    ctx.restore();
    if (phase === "result" || phase === "cooldown") return;
  }

  // Searching: breathing guide corners + faint slow beam (no beam with reduced motion).
  if (phase === "searching" || phase === "idle" || phase === "cooldown" || (phase === "error" && reduced)) {
    const br = reduced ? 0.6 : 0.4 + 0.4 * (0.5 - 0.5 * Math.cos((now / FX.SEARCH_BREATHE_MS) * Math.PI * 2));
    ctx.save();
    ctx.strokeStyle = phase === "error" ? f.a("err", 0.8) : f.a("fg", br); ctx.lineWidth = 3; corners(ctx, q, 26);
    if (!reduced && phase === "searching") {
      ctx.save(); path(ctx, q); ctx.clip();
      ctx.globalCompositeOperation = "lighter";
      beam(ctx, q, pingPong(now, FX.SEARCH_SWEEP_MS * 2), al => f.a("fg", al * 0.25), 1, 14);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  if (phase === "error") {
    ctx.save(); ctx.strokeStyle = f.a("err", 0.85); ctx.lineWidth = 3; path(ctx, q); ctx.stroke(); ctx.lineWidth = 5; corners(ctx, q, 26); ctx.restore();
    return;
  }

  const checking = phase === "checking" || phase === "capturing";

  // Tracking: white outline + gold running lights.
  if (phase === "tracking") {
    ctx.save();
    ctx.strokeStyle = f.a("fg", 0.7); ctx.lineWidth = 2; path(ctx, q); ctx.stroke();
    if (!reduced) { ctx.globalCompositeOperation = "lighter"; runningLights(ctx, q, now, FX.RUN_MS, 2, col(tint)); }
    ctx.lineWidth = 4; ctx.strokeStyle = f.a("fg", 0.9); corners(ctx, q, 22);
    ctx.restore();
    return;
  }

  // Steady / capturing / checking.
  ctx.save();
  ctx.strokeStyle = f.a(tint, 1); ctx.lineWidth = 3; ctx.shadowColor = f.a(tint, 1); ctx.shadowBlur = 18;
  path(ctx, q); ctx.stroke(); ctx.shadowBlur = 0;

  if (reduced) {
    // Static outline + progress fill along the bottom edge.
    const prog = checking ? 1 : f.steady;
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(q[3].x, q[3].y); const e = lerpP(q[3], q[2], prog); ctx.lineTo(e.x, e.y); ctx.stroke();
  } else {
    ctx.save(); path(ctx, q); ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    const pass = checking ? FX.BEAM_PASS_CHECKING_MS : FX.BEAM_PASS_MS;
    const t = pingPong(now, pass);
    // Scan-line grid over the area the beam has just passed, fading behind it.
    if (quadArea(q) >= FX.GRID_MIN_AREA) {
      const goingDown = (now % pass) / pass < 0.5;
      const span = 0.35, from = goingDown ? Math.max(0, t - span) : t, to = goingDown ? t : Math.min(1, t + span);
      const rows = Math.max(1, Math.round(((to - from) * d(q[0], q[3])) / FX.GRID_GAP));
      ctx.lineWidth = 1;
      for (let i = 0; i <= rows; i++) {
        const u = from + ((to - from) * i) / rows;
        const fade = 1 - Math.abs(u - t) / span;
        const [l, r] = beamLine(q, u);
        ctx.strokeStyle = f.a(tint, FX.GRID_ALPHA * fade);
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
      }
    }
    beam(ctx, q, t, col(tint), FX.BEAM_CORE, FX.BEAM_SOFT);
    if (checking) {
      // Diagonal shimmer.
      const u = (now % 1200) / 1200, cx = lerp(q[0].x, q[2].x, u), cy = lerp(q[0].y, q[2].y, u);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      g.addColorStop(0, f.a("fg", 0.18)); g.addColorStop(1, f.a("fg", 0));
      ctx.fillStyle = g; path(ctx, q); ctx.fill();
    }
    // Capture flash.
    if (phase === "capturing" && f.phaseAge < FX.FLASH_MS) { ctx.fillStyle = f.a("fg", 0.7 * (1 - f.phaseAge / FX.FLASH_MS)); path(ctx, q); ctx.fill(); }
    ctx.restore();
    if (checking) { ctx.globalCompositeOperation = "lighter"; runningLights(ctx, q, now, FX.RUN_MS_CHECKING, 4, col(tint)); ctx.globalCompositeOperation = "source-over"; }
  }
  ctx.strokeStyle = f.a(tint, 1); ctx.lineWidth = 5; corners(ctx, q, 22 + 10 * (checking ? 1 : f.steady));
  ctx.restore();
}
