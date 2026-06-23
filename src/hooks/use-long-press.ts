import { useCallback, useRef } from "react";

interface Options {
  /** ms to trigger long press */
  delay?: number;
  /** movement (px) that cancels the press */
  moveThreshold?: number;
}

/**
 * Long-press handler that works for both pointer and touch.
 * Returns props to spread onto the target element.
 */
export function useLongPress(onLongPress: () => void, opts: Options = {}) {
  const { delay = 450, moveThreshold = 10 } = opts;
  const timer = useRef<number | null>(null);
  const triggered = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // primary button only
      if (e.pointerType === "mouse" && e.button !== 0) return;
      triggered.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        triggered.current = true;
        // light haptic on supported devices
        try { (navigator as any).vibrate?.(15); } catch {/* */}
        onLongPress();
      }, delay);
    },
    [onLongPress, delay]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (Math.hypot(dx, dy) > moveThreshold) clear();
    },
    [clear, moveThreshold]
  );

  const onPointerUp = useCallback(() => clear(), [clear]);
  const onPointerLeave = useCallback(() => clear(), [clear]);
  const onPointerCancel = useCallback(() => clear(), [clear]);

  /** Call from your click handler to suppress click after a long-press fires. */
  const wasLongPress = () => {
    const was = triggered.current;
    triggered.current = false;
    return was;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, wasLongPress };
}
