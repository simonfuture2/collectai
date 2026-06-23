import { forwardRef, type HTMLAttributes } from "react";
import { useLongPress } from "@/hooks/use-long-press";

interface LongPressableProps extends HTMLAttributes<HTMLDivElement> {
  onLongPress: () => void;
  /** ms threshold */
  delay?: number;
}

/**
 * Div wrapper that detects long-press and suppresses the immediate click
 * that follows. Composes with Radix's asChild pattern (forwards refs).
 */
const LongPressable = forwardRef<HTMLDivElement, LongPressableProps>(
  ({ onLongPress, delay = 450, onClick, children, ...rest }, ref) => {
    const lp = useLongPress(onLongPress, { delay });

    return (
      <div
        ref={ref}
        {...rest}
        onPointerDown={(e) => { lp.onPointerDown(e); rest.onPointerDown?.(e); }}
        onPointerMove={(e) => { lp.onPointerMove(e); rest.onPointerMove?.(e); }}
        onPointerUp={(e) => { lp.onPointerUp(); rest.onPointerUp?.(e); }}
        onPointerLeave={(e) => { lp.onPointerLeave(); rest.onPointerLeave?.(e); }}
        onPointerCancel={(e) => { lp.onPointerCancel(); rest.onPointerCancel?.(e); }}
        onClick={(e) => {
          if (lp.wasLongPress()) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onClick?.(e);
        }}
        style={{ touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none", ...rest.style }}
      >
        {children}
      </div>
    );
  }
);
LongPressable.displayName = "LongPressable";

export default LongPressable;
