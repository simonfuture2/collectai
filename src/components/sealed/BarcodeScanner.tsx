import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Live camera barcode reader: native BarcodeDetector, falling back to @zxing/browser. */
export default function BarcodeScanner({ open, onOpenChange, onResult }: {
  open: boolean; onOpenChange: (o: boolean) => void; onResult: (digits: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stop = () => {};
    let cancelled = false;
    setErr(null);
    const done = (raw: string) => {
      const d = raw.replace(/\D/g, "");
      if (d.length >= 8 && d.length <= 14) { onResult(d); onOpenChange(false); return true; }
      return false;
    };
    (async () => {
      // wait for video element to mount
      await new Promise((r) => setTimeout(r, 50));
      const video = videoRef.current;
      if (!video || cancelled) return;
      try {
        const BD = (window as any).BarcodeDetector;
        if (BD) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          video.srcObject = stream; await video.play();
          const det = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
          let raf = 0;
          const tick = async () => {
            if (cancelled) return;
            try {
              const codes = await det.detect(video);
              if (codes?.[0]?.rawValue && done(codes[0].rawValue)) return;
            } catch {/* keep trying */}
            raf = window.setTimeout(tick, 250) as unknown as number;
          };
          tick();
          stop = () => { clearTimeout(raf); stream.getTracks().forEach((t) => t.stop()); };
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, (res) => {
            if (res && done(res.getText())) controls.stop();
          });
          stop = () => controls.stop();
          if (cancelled) stop();
        }
      } catch {
        setErr("Couldn't open the camera. Type the digits instead.");
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [open, onOpenChange, onResult]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Scan barcode</DialogTitle></DialogHeader>
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-secondary/80" />
        </div>
        <p className="text-xs text-muted-foreground">{err || "Point the camera at the barcode on the package."}</p>
      </DialogContent>
    </Dialog>
  );
}
