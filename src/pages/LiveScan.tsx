import { useCallback, useEffect, useRef, useState } from "react";
import { isAndroidApp, ANDROID_OUT_OF_CREDITS_MSG } from "@/lib/platform";
import { useLocation, useNavigate } from "react-router-dom";
import { useLiveScanner } from "@/hooks/use-live-scanner";
import { FX, drawScanFx, lerpQuad, type FxColors, type SQuad } from "@/lib/scanFx";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import {
  X, ChevronDown, HelpCircle, Pause, Play, Zap, ZapOff, Volume2, VolumeX, ImageIcon, ArrowRight, Camera, Loader2, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/use-credits";
import { useAdmin } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  LIVE, GAMES, LANGUAGES, PILL, categoryFor, canvasHash, cropCard, detectCard, emaQuad, errorPill,
  laplacianVariance, loadOpenCV, cooldownDone, trackPhase, showIdleHint, loopPaused, hamming, meanAbsDiff, nextLanguage, quadMotion, scanState, steadyStep, toGray, warpCard,
  type LangId, type Quad, type ScanState,
} from "@/lib/liveDetect";
import { addToSession, clearSession, patchSession, readSession, removeFromSession, updateSessionPick } from "@/lib/priceSession";
import { parallelOf, ungradedPrice } from "@/lib/priceLadder";
import type { PriceCandidate } from "@/lib/packRip";
import ResultsStrip from "@/components/live/ResultsStrip";
import CardSheet from "@/components/live/CardSheet";
import ReviewSheet from "@/components/live/ReviewSheet";
import HelpSheet from "@/components/live/HelpSheet";
import { MODE_LABEL, selectedOf, type LiveTile, type ScanMode } from "@/components/live/types";

const LS = { lang: "live_lang", game: "live_game", sound: "live_sound", mode: "live_mode", camOk: "live_cam_ok" };
const ls = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

type Perm = "checking" | "intro" | "starting" | "live" | "denied" | "nocamera";

const statusOf = async (error: unknown): Promise<{ status: number | null; body: any }> => {
  const ctx = (error as { context?: Response })?.context;
  if (!ctx || typeof ctx.status !== "number") return { status: null, body: null };
  let body: any = null;
  try { body = await ctx.clone().json(); } catch { /* ignore */ }
  return { status: ctx.status, body };
};

export default function LiveScan() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const { credits, isPro, refresh: refreshCredits } = useCredits();

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [perm, setPerm] = useState<Perm>("checking");
  const [cvState, setCvState] = useState<"loading" | "ready" | "fallback">("loading");
  const [pill, setPill] = useState<{ state: ScanState; text: string; progress: number; error?: boolean }>({ state: "searching", text: PILL.searching, progress: 0 });
  const [torchCap, setTorchCap] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const [lang, setLang] = useState<LangId>(() => ls(LS.lang, "any") as LangId);
  const [game, setGame] = useState(() => ls(LS.game, "auto"));
  const [sound, setSound] = useState(() => ls(LS.sound, "1") === "1");
  const [mode, setMode] = useState<ScanMode>(() => ls(LS.mode, "price") as ScanMode);
  const sc = useLiveScanner();
  const auto = sc.auto;
  const location = useLocation();
  const debugOn = new URLSearchParams(location.search).get("debug") === "1";
  const [videoReady, setVideoReady] = useState(false);
  const [hardPaused, setHardPaused] = useState(false);
  const [scanKind, setScanKind] = useState<"card" | "barcode">("card");

  const [tiles, setTiles] = useState<LiveTile[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetBusy, setSheetBusy] = useState<"save" | "full" | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [metrics, setMetrics] = useState({ cvMs: 0, detMs: 0, lastMs: 0 });

  // Mutable loop state
  const cvRef = useRef<any>(null);
  const slowRef = useRef(false);
  const detTimes = useRef<number[]>([]);
  const quadRef = useRef<Quad | null>(null);       // smoothed, frame coords
  const rawQuadRef = useRef<Quad | null>(null);
  const lastSeenRef = useRef(0);
  const firstSeenRef = useRef(0);
  const steadyRef = useRef<number | null>(null);
  const prevGrayRef = useRef<Uint8Array | null>(null);
  const busyRef = useRef(false);
  const capturingRef = useRef(false);
  const pausedUntilRef = useRef(0);
  const lastHashRef = useRef<string | null>(null);
  const lastUpcRef = useRef<string | null>(null);
  const pulseRef = useRef(0);
  const blockedRef = useRef(false);
  const settingsRef = useRef({ lang, game, auto, hardPaused, scanKind, mode });
  settingsRef.current = { lang, game, auto, hardPaused, scanKind, mode };
  blockedRef.current = !!openId || reviewOpen || helpOpen || gameOpen || modeOpen || perm !== "live";

  /* ------------------------------ auth + device ------------------------------ */
  useEffect(() => {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (!coarse || !navigator.mediaDevices?.getUserMedia) { navigate("/scan", { replace: true }); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { navigate(`/auth?mode=signup&next=${encodeURIComponent("/scan/live")}`, { replace: true }); return; }
      setUserId(session.user.id);
    });
  }, [navigate]);

  // Restore this session's live scans after a refresh.
  useEffect(() => {
    if (!userId) return;
    const saved = readSession().filter(s => s.imagePath.includes("/live-")).sort((a, b) => b.at - a.at);
    if (!saved.length) return;
    const restored: LiveTile[] = saved.map(s => ({
      id: s.priceCheckId, kind: "card", status: s.productId || s.price != null ? "done" : "nomatch", preview: null, imagePath: s.imagePath,
      candidates: s.productId ? [{ productId: s.productId, name: s.name, set: s.set ?? null, number: s.number ?? null, ladder: s.price != null ? { ungraded: s.price } : {}, url: `https://www.pricecharting.com/game/${s.productId}` }] : [],
      selectedId: s.productId ?? null, language: s.language ?? null, savedCardId: s.savedCardId ?? null, at: s.at,
    }));
    setTiles(restored);
    supabase.storage.from("card-images").createSignedUrls(restored.map(t => t.imagePath!), 3600).then(({ data }) => {
      if (!data) return;
      setTiles(prev => prev.map(t => ({ ...t, preview: t.preview ?? data.find(d => d.path === t.imagePath)?.signedUrl ?? null })));
    });
  }, [userId]);

  /* ------------------------------ camera ------------------------------ */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setTorchOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setPerm("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      });
      streamRef.current = stream;
      lsSet(LS.camOk, "1");
      const v = videoRef.current;
      if (v) { v.muted = true; v.setAttribute("playsinline", ""); v.srcObject = stream; await v.play().catch(() => {}); }
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
      setTorchCap(!!caps.torch);
      setPerm("live");
    } catch (e) {
      const name = (e as Error)?.name;
      setPerm(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "nocamera");
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      let granted = ls(LS.camOk, "") === "1";
      try {
        const st = await (navigator.permissions as any)?.query({ name: "camera" });
        if (st?.state === "granted") granted = true;
        if (st?.state === "denied") { setPerm("denied"); return; }
      } catch { /* not supported */ }
      if (granted) startCamera(); else setPerm("intro");
    })();
    return () => stopCamera();
  }, [userId, startCamera, stopCamera]);

  // The loop only starts once the video is really playing (iOS gives blank frames before that).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const ready = () => { if (v.readyState >= 2 && v.videoWidth) { setVideoReady(true); if (sc.phaseRef.current === "idle") sc.setPhase("searching"); } };
    const lost = () => { setVideoReady(false); sc.setPhase("idle"); };
    v.addEventListener("loadeddata", ready); v.addEventListener("playing", ready); v.addEventListener("emptied", lost);
    ready();
    return () => { v.removeEventListener("loadeddata", ready); v.removeEventListener("playing", ready); v.removeEventListener("emptied", lost); };
  }, [perm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop the camera when the tab is hidden; resume when it's back.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stopCamera();
      else if (userId && ls(LS.camOk, "") === "1" && !streamRef.current) startCamera();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [userId, startCamera, stopCamera]);

  // Lazy-load OpenCV only once the camera is live.
  useEffect(() => {
    if (perm !== "live" || cvRef.current || cvState === "fallback") return;
    const t0 = performance.now();
    loadOpenCV().then(cv => {
      cvRef.current = cv;
      const ms = Math.round(performance.now() - t0);
      setMetrics(m => ({ ...m, cvMs: ms }));
      console.log(`[live] opencv ready ${ms}ms`);
      setCvState("ready");
    }).catch((e) => { console.warn("[live] opencv failed, using guides", e); setCvState("fallback"); });
  }, [perm, cvState]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] }); setTorchOn(!torchOn); } catch { /* ignore */ }
  };

  /* ------------------------------ feedback ------------------------------ */
  const feedback = useCallback(() => {
    if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    else navigator.vibrate?.(15);
    if (!sound) return;
    try {
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(880, ac.currentTime); o.frequency.setValueAtTime(1320, ac.currentTime + 0.07);
      g.gain.setValueAtTime(0.08, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.2);
      setTimeout(() => ac.close(), 400);
    } catch { /* ignore */ }
  }, [sound]);

  const flashPill = (text: string, ms = 1800, error = true) => {
    setPill({ state: "searching", text, progress: 0, error });
    pausedUntilRef.current = Math.max(pausedUntilRef.current, Date.now() + ms);
  };

  /* ------------------------------ capture → price-check ------------------------------ */
  const sendCard = useCallback(async (card: HTMLCanvasElement, skipDup = false) => {
    if (!userId || busyRef.current) return;
    const hash = canvasHash(card);
    void skipDup; // the cooldown (not this function) decides whether a card is new
    busyRef.current = true;
    sc.setPhase("capturing");
    if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}); else navigator.vibrate?.(8);
    capturingRef.current = true; pulseRef.current = performance.now();
    const seenAt = firstSeenRef.current || performance.now();
    const tempId = `tmp-${Date.now()}`;
    const blob: Blob | null = await new Promise(r => card.toBlob(r, "image/jpeg", LIVE.JPEG_QUALITY));
    if (!blob) { busyRef.current = false; capturingRef.current = false; return; }
    const preview = URL.createObjectURL(blob);
    setTiles(prev => [{ id: tempId, kind: "card", status: "checking", preview, imagePath: null, candidates: [], selectedId: null, language: null, savedCardId: null, at: Date.now() }, ...prev]);
    setPill({ state: "capturing", text: PILL.capturing, progress: 1 });
    const path = `${userId}/live-${Date.now()}.jpg`;
    try {
      sc.setPhase("checking");
      const up = await supabase.storage.from("card-images").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw Object.assign(new Error(up.error.message), { status: null });
      const s = settingsRef.current;
      const body: Record<string, unknown> = { imagePath: path, language: s.lang };
      const cat = categoryFor(s.game);
      if (cat) body.category = cat;
      const { data, error } = await supabase.functions.invoke("price-check", { body });
      if (error || data?.error) {
        const { status } = error ? await statusOf(error) : { status: 500 };
        throw Object.assign(new Error(data?.error || "failed"), { status });
      }
      lastHashRef.current = hash;
      const candidates: PriceCandidate[] = data.candidates ?? [];
      const sel: PriceCandidate | null = data.selected ?? candidates[0] ?? null;
      const id: string = data.priceCheckId ?? tempId;
      const language = data.identification?.language ?? null;
      const tile: LiveTile = {
        id, kind: "card", status: sel ? "done" : "nomatch", preview, imagePath: path, candidates, selectedId: sel?.productId ?? null,
        language, savedCardId: null, at: Date.now(),
      };
      setTiles(prev => prev.map(t => (t.id === tempId ? tile : t)));
      if (data.priceCheckId) addToSession({
        priceCheckId: id, imagePath: path, name: sel?.name ?? "No match", price: ungradedPrice(sel?.ladder), at: Date.now(),
        number: sel?.number ?? null, set: sel?.set ?? null, parallel: sel ? parallelOf(sel.name) : null, language,
        candidateCount: candidates.length, productId: sel?.productId ?? null,
      });
      feedback();
      const ms = Math.round(performance.now() - seenAt);
      setMetrics(m => ({ ...m, lastMs: ms }));
      console.log(`[live] card→price ${ms}ms server=${data.latencyMs}ms match=${sel?.name ?? "none"}`);
      setPill({ state: "capturing", text: sel ? `Found – ${sel.name}` : "No match – tap the card below", progress: 0 });
      sc.resultUntil.current = performance.now() + LIVE.RESULT_MS;
      sc.setPhase("result");
    } catch (e) {
      const status = (e as { status?: number | null }).status ?? null;
      setTiles(prev => prev.filter(t => t.id !== tempId));
      URL.revokeObjectURL(preview);
      const { text, hardPause } = errorPill(status);
      console.warn("[live] price-check failed", status, (e as Error).message);
      setPill({ state: "searching", text, progress: 0, error: true });
      if (hardPause) { setHardPaused(true); sc.setAuto(false, false); }
      lastHashRef.current = hash;
      sc.resultUntil.current = performance.now() + LIVE.ERROR_PAUSE_MS;
      sc.setPhase("error");
    } finally {
      busyRef.current = false; capturingRef.current = false;
      steadyRef.current = null; firstSeenRef.current = 0;
    }
  }, [userId, feedback]); // eslint-disable-line react-hooks/exhaustive-deps

  const fullFrame = () => {
    const v = videoRef.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    return c;
  };

  /** Frame area ÷ on-screen visible area, so "Move closer" matches what the user sees (object-fit: cover crops). */
  const visibleShare = (v: HTMLVideoElement, FW: number, FH: number) => {
    const root = rootRef.current;
    if (!root) return 1;
    const cw = root.clientWidth, ch = root.clientHeight;
    const s = Math.max(cw / v.videoWidth, ch / v.videoHeight), k = FW / v.videoWidth;
    const vis = Math.min(FW, (cw / s) * k) * Math.min(FH, (ch / s) * k);
    return vis > 0 ? (FW * FH) / vis : 1;
  };

  /** Guide quad in frame coords (fallback / manual without a detection). */
  const guideQuad = useCallback((): Quad | null => {
    const v = videoRef.current, root = rootRef.current;
    if (!v?.videoWidth || !root) return null;
    const cw = root.clientWidth, ch = root.clientHeight, vw = v.videoWidth, vh = v.videoHeight;
    const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
    const gw = cw * LIVE.GUIDE_COVERAGE_W, gh = Math.min(gw * 88 / 63, ch * 0.5);
    const gw2 = gh * 63 / 88;
    const cx = cw / 2, cy = ch * 0.4;
    const k = LIVE.FRAME_WIDTH / vw;
    const toF = (x: number, y: number) => ({ x: ((x - ox) / s) * k, y: ((y - oy) / s) * k });
    return [toF(cx - gw2 / 2, cy - gh / 2), toF(cx + gw2 / 2, cy - gh / 2), toF(cx + gw2 / 2, cy + gh / 2), toF(cx - gw2 / 2, cy + gh / 2)];
  }, []);

  const captureNow = useCallback((q: Quad | null) => {
    const v = videoRef.current;
    if (!v?.videoWidth || !q) return;
    const k = v.videoWidth / LIVE.FRAME_WIDTH;
    const full = fullFrame();
    const fq = q.map(p => ({ x: p.x * k, y: p.y * k })) as Quad;
    const card = cvRef.current && cvStateRef.current === "ready" && !slowRef.current ? warpCard(cvRef.current, full, fq) : cropCard(full, fq);
    sendCard(card);
  }, [sendCard]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ frame loop ------------------------------ */
  // One loop, started when the video is playing. It reads phase, auto and in-flight state from refs only.
  const cooldownHashTick = useRef(0);
  useEffect(() => {
    if (perm !== "live" || scanKind !== "card" || !videoReady) return;
    if (!frameRef.current) frameRef.current = document.createElement("canvas");
    const frame = frameRef.current;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v?.videoWidth || blockedRef.current || document.hidden) return;
      const now = performance.now();
      const phase = sc.phaseRef.current;
      const dbg = sc.debugRef.current;
      if (loopPaused(phase)) return;
      sc.tickFrame(now);

      const FW = LIVE.FRAME_WIDTH, FH = Math.round(v.videoHeight * FW / v.videoWidth);
      if (frame.width !== FW) { frame.width = FW; frame.height = FH; }
      const ctx = frame.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, FW, FH);
      const useCv = cvRef.current && cvStateRef.current === "ready" && !slowRef.current;
      let found = false, coverage = 0, still = false, sharp = false, sharpness = 0, motion = 0, realCard = false;

      if (useCv) {
        const t0 = performance.now();
        let det = null;
        try { det = detectCard(cvRef.current, frame); } catch (e) { console.warn("[live] detect error", e); }
        const dt = performance.now() - t0;
        dbg.detMs = Math.round(dt);
        detTimes.current.push(dt);
        if (detTimes.current.length > LIVE.SLOW_SAMPLE) detTimes.current.shift();
        if (detTimes.current.length === LIVE.SLOW_SAMPLE) {
          const med = [...detTimes.current].sort((x, y) => x - y)[Math.floor(LIVE.SLOW_SAMPLE / 2)];
          if (Math.random() < 0.1) setMetrics(m => ({ ...m, detMs: Math.round(med) }));
          if (med > LIVE.SLOW_FRAME_MS) { slowRef.current = true; console.warn(`[live] slow detection ${Math.round(med)}ms → guides`); setCvState("fallback"); }
        }
        if (det) {
          motion = quadMotion(rawQuadRef.current, det.quad) / FW;
          rawQuadRef.current = det.quad;
          quadRef.current = emaQuad(quadRef.current, det.quad);
          if (!lastSeenRef.current || now - lastSeenRef.current > LIVE.LOST_AFTER_MS) firstSeenRef.current = now;
          lastSeenRef.current = now; realCard = true;
          found = true; coverage = det.coverage * visibleShare(v, FW, FH);
          sharpness = det.sharpness;
          still = motion < LIVE.MOTION_MAX; sharp = det.sharpness >= LIVE.SHARPNESS_MIN;
        } else if (now - lastSeenRef.current > LIVE.LOST_AFTER_MS) {
          quadRef.current = null; rawQuadRef.current = null;
        } else if (quadRef.current) { found = true; coverage = 0.3; }
      } else {
        // Fixed guides (outline engine loading, failed or too slow): steadiness from frame difference.
        const t0 = performance.now();
        const gray = toGray(ctx.getImageData(0, 0, FW, FH).data);
        motion = meanAbsDiff(prevGrayRef.current, gray);
        still = motion < LIVE.FALLBACK_DIFF_MAX;
        sharpness = laplacianVariance(gray, FW, FH);
        sharp = sharpness >= LIVE.SHARPNESS_MIN * 0.5;
        prevGrayRef.current = gray;
        quadRef.current = guideQuad();
        dbg.detMs = Math.round(performance.now() - t0);
        // Guides can't tell "no card"; a still, detailed frame counts as a card in view.
        realCard = sharp;
        if (realCard) lastSeenRef.current = now;
        found = true; coverage = 0.4;
        if (!firstSeenRef.current) firstSeenRef.current = now;
      }
      if (realCard) sc.lastCardAt.current = now;
      dbg.found = realCard; dbg.area = Math.round(coverage * 100); dbg.sharpness = Math.round(sharpness);
      dbg.motion = Math.round(motion * 1000) / 1000;

      // Result / error: hold the message, then cooldown.
      if (phase === "result" || phase === "error") {
        dbg.cooldownMs = Math.max(0, Math.round(sc.resultUntil.current - now));
        if (now >= sc.resultUntil.current) sc.setPhase("cooldown");
        return;
      }
      // Cooldown: wait for the card to leave or a different card to appear.
      if (phase === "cooldown") {
        let dist: number | null = null;
        if (realCard && quadRef.current && lastHashRef.current && (cooldownHashTick.current++ % 3 === 0)) {
          try { dist = hamming(canvasHash(cropCard(frame, quadRef.current)), lastHashRef.current); dbg.hashDist = dist; } catch { /* ignore */ }
        }
        const why = cooldownDone({ now, lastSeen: realCard ? now : lastSeenRef.current, hashDist: dist });
        dbg.cooldownMs = 0;
        if (why) {
          if (why === "left") lastHashRef.current = null;
          steadyRef.current = null; firstSeenRef.current = realCard ? now : 0;
          sc.setPhase("searching");
          setPill({ state: "searching", text: PILL.searching, progress: 0 });
        }
        return;
      }

      const s = settingsRef.current;
      const autoOn = sc.autoRef.current && !s.hardPaused;
      const next = trackPhase(found, coverage);
      if (next === "steady") {
        const step = steadyStep(steadyRef.current, now, still, sharp);
        steadyRef.current = step.since;
        dbg.steadyMs = step.since ? Math.round(now - step.since) : 0;
        sc.setPhase("steady");
        setPill({ state: "steady", text: autoOn ? PILL.steady : "Tap the button to scan", progress: autoOn ? step.progress : 0 });
        if (step.fire && autoOn && !busyRef.current) captureNow(quadRef.current);
      } else {
        steadyRef.current = null; dbg.steadyMs = 0;
        sc.setPhase(next);
        const st: ScanState = next === "tracking" ? "closer" : "searching";
        const hint = showIdleHint(autoOn, next, now, sc.lastCardAt.current, sc.phaseSince.current);
        const text = hint ? "Point at a card – it scans automatically" : PILL[st];
        setPill(p => (p.state === st && p.text === text && !p.error ? p : { state: st, text, progress: 0 }));
      }
    }, LIVE.FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  }, [perm, scanKind, videoReady, captureNow, guideQuad]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ overlay drawing (laser-scan effects) ------------------------------ */
  // Own requestAnimationFrame loop (up to 60 fps), separate from the ~10 fps detection loop.
  // Visual only: reads quadRef / phase refs, never changes detection or capture.
  const [fxOn, setFxOn] = useState(() => ls(FX.LS_KEY, "1") === "1");
  const fxOnRef = useRef(fxOn); fxOnRef.current = fxOn;
  const fxRef = useRef<{ from: SQuad | null; to: SQuad | null; at: number; src: unknown; resultAt: number | null; lastPhase: string }>({ from: null, to: null, at: 0, src: null, resultAt: null, lastPhase: "idle" });
  useEffect(() => {
    if (perm !== "live" || scanKind !== "card") return;
    const reducedMq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let colors: FxColors | null = null;
    const step = () => {
      raf = requestAnimationFrame(step);
      if (blockedRef.current || document.hidden) return;
      const c = overlayRef.current, v = videoRef.current, root = rootRef.current;
      if (!c || !v?.videoWidth || !root) return;
      const dpr = window.devicePixelRatio || 1, cw = root.clientWidth, ch = root.clientHeight;
      if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); colors = null; }
      if (!colors) {
        const css = getComputedStyle(root), g = (n: string) => css.getPropertyValue(n).trim();
        colors = { gold: g("--primary"), ok: g("--cam-ok"), err: g("--destructive"), fg: g("--cam-fg"), azure: g("--secondary") };
      }
      const cols = colors;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const s = Math.max(cw / v.videoWidth, ch / v.videoHeight), ox = (cw - v.videoWidth * s) / 2, oy = (ch - v.videoHeight * s) / 2;
      const k = v.videoWidth / LIVE.FRAME_WIDTH;
      const toS = (p: { x: number; y: number }) => ({ x: p.x * k * s + ox, y: p.y * k * s + oy });
      const now = performance.now();
      const fx = fxRef.current;
      const src = quadRef.current;
      const guide = !src;
      const target = (src ?? guideQuad())?.map(toS) as SQuad | undefined;
      if (!target) return;
      // Interpolate corners between detection updates.
      if (src !== fx.src || !fx.to) {
        fx.from = fx.to && fx.from ? lerpQuad(fx.from, fx.to, Math.min(1, (now - fx.at) / FX.INTERP_MS)) : target;
        fx.to = target; fx.at = now; fx.src = src;
      }
      const q = lerpQuad(fx.from!, fx.to, Math.min(1, (now - fx.at) / FX.INTERP_MS));
      const phase = sc.phaseRef.current;
      if (phase === "result" && fx.lastPhase !== "result") fx.resultAt = now;
      fx.lastPhase = phase;
      drawScanFx(ctx, {
        q, guide, phase, phaseAge: now - sc.phaseSince.current, now,
        steady: Math.min(1, sc.debugRef.current.steadyMs / LIVE.STEADY_MS),
        resultAge: fx.resultAt != null ? now - fx.resultAt : null,
        insight: settingsRef.current.mode === "insight",
        reduced: !!reducedMq?.matches || !fxOnRef.current,
        colors: cols,
        a: (t, al) => `hsl(${cols[t]} / ${al})`,
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [perm, scanKind, guideQuad]); // eslint-disable-line react-hooks/exhaustive-deps

  const cvStateRef = useRef(cvState);
  cvStateRef.current = cvState;
  const pillRef = useRef<ScanState>("searching");
  pillRef.current = pill.state;

  /* ------------------------------ barcode mode ------------------------------ */
  const lookupBarcode = useCallback(async (upc: string) => {
    if (upc === lastUpcRef.current || busyRef.current) return;
    lastUpcRef.current = upc; busyRef.current = true;
    const tempId = `tmp-${Date.now()}`;
    setTiles(prev => [{ id: tempId, kind: "sealed", status: "checking", preview: null, imagePath: null, candidates: [], selectedId: null, language: null, savedCardId: null, at: Date.now() }, ...prev]);
    setPill({ state: "capturing", text: "Looking up barcode…", progress: 1 });
    try {
      const { data, error } = await supabase.functions.invoke("price-check", { body: { action: "barcode", upc } });
      if (error || data?.error) throw new Error(data?.error || "failed");
      if (!data.found) {
        setTiles(prev => prev.filter(t => t.id !== tempId));
        setPill({ state: "searching", text: "Barcode not in the price list", progress: 0, error: true });
        return;
      }
      setTiles(prev => prev.map(t => (t.id === tempId ? {
        ...t, id: `upc-${upc}-${Date.now()}`, status: "done",
        sealed: { name: data.product.name, set: data.product.set, price: data.product.price, url: data.product.url, chase: data.chase ?? [] },
      } : t)));
      feedback();
      setPill({ state: "searching", text: "Got it – next item", progress: 0 });
    } catch {
      setTiles(prev => prev.filter(t => t.id !== tempId));
      setPill({ state: "searching", text: "Busy – trying again", progress: 0, error: true });
      lastUpcRef.current = null;
    } finally { busyRef.current = false; }
  }, [feedback]);

  useEffect(() => {
    if (perm !== "live" || scanKind !== "barcode") return;
    const v = videoRef.current;
    if (!v) return;
    const c = overlayRef.current?.getContext("2d");
    if (c && overlayRef.current) c.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    setPill({ state: "searching", text: "Point at a barcode", progress: 0 });
    let stop = () => {};
    let cancelled = false;
    const handle = (raw: string) => { const d = raw.replace(/\D/g, ""); if (d.length >= 8 && d.length <= 14 && !blockedRef.current) lookupBarcode(d); };
    const BD = (window as any).BarcodeDetector;
    if (BD) {
      const det = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const id = window.setInterval(async () => {
        if (blockedRef.current || !v.videoWidth) return;
        try { const codes = await det.detect(v); if (codes?.[0]?.rawValue) handle(codes[0].rawValue); } catch { /* keep trying */ }
      }, 250);
      stop = () => clearInterval(id);
    } else {
      import("@zxing/browser").then(async ({ BrowserMultiFormatReader }) => {
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(v, (res) => { if (res) handle(res.getText()); });
        stop = () => controls.stop();
        if (cancelled) stop();
      }).catch(() => setPill({ state: "searching", text: "Barcode reader unavailable", progress: 0, error: true }));
    }
    return () => { cancelled = true; stop(); };
  }, [perm, scanKind, lookupBarcode]);

  /* ------------------------------ gallery ------------------------------ */
  const onGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await img.decode().catch(() => {});
    const full = document.createElement("canvas");
    const scale = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
    full.width = Math.round(img.naturalWidth * scale); full.height = Math.round(img.naturalHeight * scale);
    full.getContext("2d")!.drawImage(img, 0, 0, full.width, full.height);
    URL.revokeObjectURL(img.src);
    let card: HTMLCanvasElement = full;
    try {
      const cv = cvRef.current ?? (await loadOpenCV().catch(() => null));
      if (cv) {
        const small = document.createElement("canvas");
        small.width = LIVE.FRAME_WIDTH; small.height = Math.round(full.height * LIVE.FRAME_WIDTH / full.width);
        small.getContext("2d")!.drawImage(full, 0, 0, small.width, small.height);
        const det = detectCard(cv, small);
        if (det) { const k = full.width / LIVE.FRAME_WIDTH; card = warpCard(cv, full, det.quad.map(p => ({ x: p.x * k, y: p.y * k })) as Quad); }
      }
    } catch { /* send the whole photo */ }
    sendCard(card, true);
  };

  /* ------------------------------ sheet actions ------------------------------ */
  const openTile = tiles.find(t => t.id === openId) ?? null;

  useEffect(() => {
    // Restored tiles only carry the picked match; load the full list when opened.
    if (!openTile || openTile.kind !== "card" || openTile.candidates.length > 1 || openTile.id.startsWith("tmp-")) return;
    supabase.from("price_checks").select("candidates, selected_product_id, identification").eq("id", openTile.id).maybeSingle().then(({ data }) => {
      const list = (data?.candidates as PriceCandidate[] | null) ?? [];
      if (list.length) setTiles(prev => prev.map(t => (t.id === openTile.id ? { ...t, candidates: list, selectedId: data?.selected_product_id ?? t.selectedId } : t)));
    });
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectMatch = async (productId: number) => {
    const t = openTile; if (!t) return;
    const o = t.candidates.find(c => c.productId === productId);
    if (!o) return;
    setTiles(prev => prev.map(x => (x.id === t.id ? { ...x, selectedId: productId, status: "done" } : x)));
    updateSessionPick(t.id, o.name, ungradedPrice(o.ladder), undefined, { productId, set: o.set, number: o.number, parallel: parallelOf(o.name) });
    const { data, error } = await supabase.functions.invoke("price-check", { body: { action: "select", priceCheckId: t.id, productId } });
    if (error || data?.error) toast({ title: "Couldn't save your choice", variant: "destructive" });
    else if (t.savedCardId) {
      await supabase.from("cards").update({ card_name: o.name, card_set: o.set, pricecharting_id: productId, pc_prices: o.ladder, estimated_value_low: o.ladder.ungraded ?? null, estimated_value_high: o.ladder.ungraded ?? null })
        .eq("id", t.savedCardId).eq("analysis_depth", "price_only");
    }
  };

  const saveOne = useCallback(async (id: string): Promise<string> => {
    const purpose = settingsRef.current.mode === "insight" ? "insight" : "collection";
    const { data, error } = await supabase.functions.invoke("price-check-save", { body: { priceCheckId: id, scanPurpose: purpose } });
    let cardId: string | undefined = data?.cardId;
    if (error) { const { body } = await statusOf(error); cardId = body?.cardId; }
    if (!cardId) throw new Error(data?.error || "Could not save");
    setTiles(prev => prev.map(t => (t.id === id ? { ...t, savedCardId: cardId! } : t)));
    patchSession(id, { savedCardId: cardId });
    return cardId;
  }, []);

  const fullOne = useCallback(async (id: string) => {
    const t = tiles.find(x => x.id === id);
    const cardId = t?.savedCardId ?? (await saveOne(id));
    const { data, error } = await supabase.functions.invoke("reanalyze-card", { body: { cardId, priceOnlyUpgrade: true } });
    if (error || data?.error) {
      const { status, body } = error ? await statusOf(error) : { status: 400, body: data };
      throw Object.assign(new Error(body?.error || data?.error || "Analysis could not start"), { status });
    }
    return cardId;
  }, [tiles, saveOne]);

  const sheetSave = async () => {
    if (!openTile) return;
    setSheetBusy("save");
    try { await saveOne(openTile.id); toast({ title: mode === "insight" ? "Saved to Insights" : "Added to your collection", description: "Free · price only" }); }
    catch (e) { toast({ title: "Couldn't save", description: (e as Error).message, variant: "destructive" }); }
    finally { setSheetBusy(null); }
  };

  const sheetFull = async () => {
    if (!openTile) return;
    if (!isPro && credits < 1) {
      if (isAndroidApp()) { toast({ title: "No credits left", description: ANDROID_OUT_OF_CREDITS_MSG }); return; }
      toast({ title: "No credits left", description: "Get credits or go Pro for full analysis." }); navigate("/pricing"); return;
    }
    setSheetBusy("full");
    try { const cardId = await fullOne(openTile.id); refreshCredits(); toast({ title: "Full analysis started" }); stopCamera(); navigate(`/card/${cardId}`); }
    catch (e) { toast({ title: "Analysis could not start", description: (e as Error).message, variant: "destructive" }); }
    finally { setSheetBusy(null); }
  };

  const saveAll = async (ids: string[], progress: (n: number) => void) => {
    let ok = 0, done = 0;
    for (const id of ids) {
      try { await saveOne(id); ok++; } catch { /* keep going */ }
      progress(++done);
    }
    toast({ title: `${ok} of ${ids.length} saved`, description: ok < ids.length ? "Some couldn't be saved. Try them again." : "Free · price only" });
    return ok;
  };

  const fullAll = async (ids: string[], progress: (n: number) => void) => {
    let ok = 0, done = 0, outOfCredits = false;
    for (const id of ids) {
      if (outOfCredits) { progress(++done); continue; }
      try { await fullOne(id); ok++; } catch (e) { if ((e as { status?: number }).status === 402) outOfCredits = true; }
      progress(++done);
    }
    refreshCredits();
    toast({ title: `Full analysis started on ${ok} card${ok === 1 ? "" : "s"}`, description: outOfCredits ? "Ran out of credits before the rest." : "Results appear in your collection." });
  };

  const removeTile = (t: LiveTile) => {
    setTiles(prev => prev.filter(x => x.id !== t.id));
    removeFromSession(t.id);
  };

  const clearAll = () => {
    tiles.forEach(t => removeFromSession(t.id));
    if (!tiles.length) clearSession();
    setTiles([]); setReviewOpen(false); lastHashRef.current = null; lastUpcRef.current = null;
  };

  const close = () => {
    stopCamera();
    if (window.history.length > 1) navigate(-1); else navigate("/dashboard");
  };

  const shutter = () => {
    if (scanKind === "barcode") return;
    if (busyRef.current) return;
    pausedUntilRef.current = 0;
    lastHashRef.current = null; // a deliberate tap always scans
    if (sc.phaseRef.current === "idle") return;
    captureNow(quadRef.current ?? guideQuad());
  };

  const toggleAuto = () => {
    if (hardPaused) { setHardPaused(false); pausedUntilRef.current = 0; }
    const on = sc.toggleAuto();
    if (on) { steadyRef.current = null; setPill({ state: "searching", text: PILL.searching, progress: 0 }); }
  };

  const langMeta = LANGUAGES.find(l => l.id === lang) ?? LANGUAGES[0];
  const gameMeta = GAMES.find(g => g.id === game) ?? GAMES[0];
  const done = tiles.filter(t => t.status !== "checking");
  const playing = auto && !hardPaused;
  const d = sc.debug;

  /* ------------------------------ render ------------------------------ */
  return (
    <div ref={rootRef} className="cam-surface fixed inset-0 z-40 overflow-hidden select-none touch-manipulation">
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onGallery} />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4" style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}>
        <button type="button" onClick={() => setModeOpen(true)} className="cam-glass flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium">
          {MODE_LABEL[mode]} <ChevronDown className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Close scanner" onClick={close} className="cam-glass rounded-full p-2"><X className="h-5 w-5" /></button>
      </div>

      {isAdmin && debugOn && (
        <div data-testid="live-debug" className="absolute left-3 top-14 z-10 rounded-md cam-glass px-2 py-1 font-mono text-[10px] leading-tight" style={{ marginTop: "env(safe-area-inset-top)" }}>
          <div>auto {playing ? "ON" : "off"}{hardPaused ? " (limit)" : ""} · state {sc.phase}</div>
          <div>fps {d.fps} · det {d.detMs}ms · {cvState === "ready" && !slowRef.current ? "opencv" : cvState === "loading" ? "guides (cv loading)" : "guides"}</div>
          <div>card {d.found ? "yes" : "no"} {d.area}% · sharp {d.sharpness} · motion {d.motion}</div>
          <div>steady {d.steadyMs}ms · inflight {busyRef.current ? "yes" : "no"} · dHash {d.hashDist ?? "–"} · cool {d.cooldownMs}ms</div>
          <div>cv {metrics.cvMs}ms · card→price {metrics.lastMs}ms · video {videoReady ? "ready" : "waiting"}</div>
        </div>
      )}
      {sc.toast && (
        <div role="status" className="absolute left-1/2 top-16 z-20 -translate-x-1/2 whitespace-nowrap rounded-full cam-glass px-4 py-2 text-sm font-medium" style={{ marginTop: "env(safe-area-inset-top)" }}>
          {sc.toast}
        </div>
      )}

      {/* Right-side buttons */}
      {perm === "live" && (
        <div className="absolute right-3 top-1/4 flex flex-col gap-3">
          <RoundBtn label="Help" onClick={() => setHelpOpen(true)}><HelpCircle className="h-5 w-5" /></RoundBtn>
          <RoundBtn label={`Language: ${langMeta.label}`} onClick={() => { const n = nextLanguage(lang); setLang(n); lsSet(LS.lang, n); }}>
            <span className="text-lg leading-none">{langMeta.flag}</span>
          </RoundBtn>
          <div className="flex flex-col items-center gap-0.5">
            <RoundBtn label={playing ? "Pause auto-scan" : "Start auto-scan"} onClick={toggleAuto}>{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</RoundBtn>
            <span className={`rounded px-1 text-[9px] font-bold tracking-wider ${playing ? "bg-primary text-primary-foreground" : "cam-muted"}`}>AUTO</span>
          </div>
          {torchCap && <RoundBtn label="Flash" onClick={toggleTorch}>{torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}</RoundBtn>}
          <RoundBtn label={sound ? "Sound off" : "Sound on"} onClick={() => { setSound(!sound); lsSet(LS.sound, sound ? "0" : "1"); }}>
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </RoundBtn>
        </div>
      )}

      {/* Permission / loading states */}
      {perm !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          {perm === "checking" || perm === "starting" ? (
            <><Loader2 className="h-8 w-8 animate-spin" /><p className="mt-3 text-sm cam-muted">Starting camera…</p></>
          ) : perm === "intro" ? (
            <>
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full gradient-primary"><Camera className="h-9 w-9" /></div>
              <h1 className="font-display text-2xl font-bold">Scan cards with your camera</h1>
              <p className="mt-2 text-sm cam-muted">MyCollectAI uses your camera to scan cards.</p>
              <Button className="mt-6 w-full max-w-xs gradient-primary" size="lg" onClick={startCamera}>Allow camera</Button>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-bold">{perm === "denied" ? "Camera access is off" : "No camera found"}</h1>
              {perm === "denied" && (
                <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-3 text-left text-xs">
                  <div className="cam-glass rounded-xl p-3"><p className="mb-1 font-semibold">iPhone</p><ol className="list-decimal space-y-0.5 pl-4 cam-muted"><li>Open Settings</li><li>Safari (or MyCollectAI)</li><li>Camera → Allow</li><li>Come back and reload</li></ol></div>
                  <div className="cam-glass rounded-xl p-3"><p className="mb-1 font-semibold">Android</p><ol className="list-decimal space-y-0.5 pl-4 cam-muted"><li>Tap the lock by the address</li><li>Permissions</li><li>Camera → Allow</li><li>Reload the page</li></ol></div>
                </div>
              )}
              <Button className="mt-6 w-full max-w-xs gradient-primary" onClick={() => fileRef.current?.click()}><ImageIcon className="mr-2 h-4 w-4" />Choose a photo instead</Button>
              {perm === "denied" && <Button variant="ghost" className="mt-2" onClick={startCamera}>Try again</Button>}
            </>
          )}
        </div>
      )}

      {perm === "live" && cvState === "loading" && scanKind === "card" && (
        <div className="absolute left-1/2 top-20 -translate-x-1/2 cam-glass rounded-full px-3 py-1 text-xs" style={{ marginTop: "env(safe-area-inset-top)" }}>
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Starting camera…
        </div>
      )}

      {/* Bottom area */}
      <div className="absolute inset-x-0 bottom-0 px-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <button type="button" aria-label="Scan a photo from your gallery" onClick={() => fileRef.current?.click()} className="cam-glass rounded-full p-2.5"><ImageIcon className="h-5 w-5" /></button>
          {perm === "live" && (
            <div role="status" aria-live="polite" className={`relative overflow-hidden rounded-full px-4 py-1.5 text-sm font-medium cam-glass ${pill.state === "capturing" ? "cam-ok" : ""}`}>
              {pill.state === "steady" && <span className="absolute inset-y-0 left-0 bg-primary/40 transition-[width] duration-100" style={{ width: `${pill.progress * 100}%` }} />}
              <span className="relative">{pill.error || !hardPaused ? pill.text : "You've hit 100 scans this hour – tap play to resume later"}</span>
            </div>
          )}
          <span className="w-10" />
        </div>

        <ResultsStrip tiles={tiles} onOpen={(t) => setOpenId(t.id)} onRemove={removeTile} />

        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={() => setGameOpen(true)} className="cam-glass flex w-24 items-center justify-center gap-1 truncate rounded-full px-3 py-2 text-xs font-medium">
            {gameMeta.label}<ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>
          <button type="button" aria-label="Capture" onClick={shutter} disabled={perm !== "live" || scanKind === "barcode"}
            className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-4 border-[hsl(var(--cam-fg))] disabled:opacity-40">
            <span className={`h-14 w-14 rounded-full ${pill.state === "capturing" ? "cam-ok-bg" : "bg-[hsl(var(--cam-fg))]"}`} />
          </button>
          <div className="flex items-center gap-2">
            <div className="cam-glass flex rounded-full p-0.5 text-[11px] font-medium">
              {(["card", "barcode"] as const).map(k => (
                <button key={k} type="button" onClick={() => setScanKind(k)}
                  className={`rounded-full px-2.5 py-1.5 ${scanKind === k ? "bg-[hsl(var(--cam-fg))] text-[hsl(var(--cam-bg))]" : ""}`}>{k === "card" ? "Card" : "Barcode"}</button>
              ))}
            </div>
            <button type="button" aria-label="Review scans" disabled={!done.length} onClick={() => setReviewOpen(true)}
              className="rounded-full gradient-primary p-2.5 disabled:opacity-40"><ArrowRight className="h-5 w-5" /></button>
          </div>
        </div>
      </div>

      <CardSheet tile={openTile} mode={mode} onClose={() => setOpenId(null)} onSelect={selectMatch} onSave={sheetSave} onFull={sheetFull}
        busy={sheetBusy} cost={isPro ? "Free with Pro" : "1 credit"} />
      <ReviewSheet open={reviewOpen} onOpenChange={setReviewOpen} tiles={done} mode={mode} isPro={isPro} credits={credits}
        onSaveAll={saveAll} onFullAll={fullAll} onClear={clearAll} />
      <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} effects={fxOn} onEffects={(on) => { setFxOn(on); lsSet(FX.LS_KEY, on ? "1" : "0"); }} />

      <Drawer open={gameOpen} onOpenChange={setGameOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-md px-4 pb-8">
            <DrawerTitle className="py-3 font-display text-lg">Which game?</DrawerTitle>
            <div className="grid grid-cols-3 gap-2">
              {GAMES.map(g => (
                <button key={g.id} type="button" onClick={() => { setGame(g.id); lsSet(LS.game, g.id); setGameOpen(false); }}
                  className={`flex items-center justify-center gap-1 rounded-xl border px-2 py-3 text-sm ${g.id === game ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}>
                  {g.id === game && <Check className="h-3.5 w-3.5 text-primary" />}{g.label}
                </button>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={modeOpen} onOpenChange={setModeOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-md px-4 pb-8">
            <DrawerTitle className="py-3 font-display text-lg">What happens when you save?</DrawerTitle>
            {(["price", "collection", "insight"] as ScanMode[]).map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); lsSet(LS.mode, m); setModeOpen(false); }}
                className={`mb-2 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${m === mode ? "border-primary bg-primary/10" : "border-border"}`}>
                <span>
                  <span className="block font-semibold">{MODE_LABEL[m]}</span>
                  <span className="text-xs text-muted-foreground">{m === "price" ? "See the price, save if you want" : m === "collection" ? "Cards you own go into your collection" : "At a show or shop – save without owning"}</span>
                </span>
                {m === mode && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function RoundBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="cam-glass flex h-11 w-11 items-center justify-center rounded-full">{children}</button>;
}
