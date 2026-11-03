// Live scanner state machine (see liveDetect.ts for the pure transition rules).
// Everything the frame loop reads lives in refs; React state is only a mirror for rendering.
import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE, type ScanPhase } from "@/lib/liveDetect";

const AUTO_KEY = "live_auto";
const readAuto = () => { try { return localStorage.getItem(AUTO_KEY) !== "0"; } catch { return true; } };

export type ScanDebug = {
  fps: number; detMs: number; found: boolean; area: number; sharpness: number; motion: number;
  steadyMs: number; hashDist: number | null; cooldownMs: number;
};

export function useLiveScanner() {
  const [phase, setPhaseState] = useState<ScanPhase>("idle");
  const phaseRef = useRef<ScanPhase>("idle");
  const [auto, setAutoState] = useState<boolean>(readAuto);
  const autoRef = useRef(auto);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const phaseSince = useRef(0);
  const resultUntil = useRef(0);
  const lastCardAt = useRef(0);        // last time any card was in view (for the idle hint)
  const debugRef = useRef<ScanDebug>({ fps: 0, detMs: 0, found: false, area: 0, sharpness: 0, motion: 0, steadyMs: 0, hashDist: null, cooldownMs: 0 });
  const frameTimes = useRef<number[]>([]);
  const [debug, setDebug] = useState<ScanDebug>(debugRef.current);

  const setPhase = useCallback((p: ScanPhase) => {
    if (phaseRef.current === p) return;
    phaseRef.current = p; phaseSince.current = performance.now();
    setPhaseState(p);
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1500);
  }, []);

  const setAuto = useCallback((on: boolean, persist = true) => {
    autoRef.current = on; setAutoState(on);
    if (persist) { try { localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch { /* ignore */ } }
  }, []);

  const toggleAuto = useCallback(() => {
    const on = !autoRef.current;
    setAuto(on);
    showToast(on ? "Auto-scan on – just hold up cards" : "Auto-scan paused – tap the button to scan");
    if (on && (phaseRef.current === "cooldown" || phaseRef.current === "error" || phaseRef.current === "result")) setPhase("searching");
    return on;
  }, [setAuto, showToast, setPhase]);

  const tickFrame = useCallback((now: number) => {
    const t = frameTimes.current;
    t.push(now);
    while (t.length && now - t[0] > 1000) t.shift();
    debugRef.current.fps = t.length;
  }, []);

  // Mirror debug numbers 4×/s for the overlay.
  useEffect(() => {
    const id = window.setInterval(() => setDebug({ ...debugRef.current }), 250);
    return () => clearInterval(id);
  }, []);

  return {
    phase, phaseRef, setPhase, phaseSince, resultUntil, lastCardAt,
    auto, autoRef, setAuto, toggleAuto, toast, showToast,
    debugRef, debug, tickFrame,
    RESULT_MS: LIVE.RESULT_MS,
  };
}
