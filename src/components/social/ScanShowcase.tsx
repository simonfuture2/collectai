import { ScanLine, CheckCircle2, Sparkles } from "lucide-react";
import photo from "@/assets/magikarp_wailord_scan.jpg.asset.json";

// Card bounds inside the photo, as % of the image.
const CARD = { left: 18.5, top: 7.3, width: 61.8, height: 62.8 };

const steps = [
  { label: "Card found", value: "Edges locked", delay: "0.6s" },
  { label: "Name", value: "Magikarp & Wailord GX", delay: "1.4s" },
  { label: "Set & number", value: "Unbroken Bonds · 161/181", delay: "2.2s" },
  { label: "Type", value: "Tag Team · Full Art", delay: "3s" },
];

export default function ScanShowcase() {
  return (
    <div className="grid items-center gap-8 md:grid-cols-[minmax(0,340px)_1fr]">
      <style>{`
        @keyframes sc-beam { 0%,100% { top: 0% } 50% { top: 100% } }
        @keyframes sc-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes sc-corner { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        @keyframes sc-run { to { stroke-dashoffset: -400 } }
        @media (prefers-reduced-motion: reduce) { .sc-anim { animation: none !important } }
      `}</style>
      <div className="relative mx-auto w-full max-w-[340px] aspect-[3/4] overflow-hidden rounded-3xl border border-border shadow-2xl">
        <img src={photo.url} alt="Magikarp & Wailord GX card being scanned" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-background/30" />
        <div className="absolute" style={{ left: `${CARD.left}%`, top: `${CARD.top}%`, width: `${CARD.width}%`, height: `${CARD.height}%` }}>
          <div className="absolute inset-0 rounded-md bg-transparent shadow-[0_0_0_9999px_hsl(var(--background)/0.45)]" />
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="0" y="0" width="100" height="100" rx="3" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.8" vectorEffect="non-scaling-stroke" className="drop-shadow-[0_0_6px_hsl(var(--primary))]" />
            <rect x="0" y="0" width="100" height="100" rx="3" fill="none" stroke="hsl(var(--primary-foreground))" strokeWidth="2.5" strokeDasharray="12 188" vectorEffect="non-scaling-stroke" className="sc-anim" style={{ animation: "sc-run 2.4s linear infinite" }} />
          </svg>
          {["left-0 top-0 border-l-4 border-t-4", "right-0 top-0 border-r-4 border-t-4", "left-0 bottom-0 border-l-4 border-b-4", "right-0 bottom-0 border-r-4 border-b-4"].map(c => (
            <span key={c} className={`sc-anim absolute -m-1.5 h-6 w-6 border-primary ${c}`} style={{ animation: "sc-corner 1.6s ease-in-out infinite" }} />
          ))}
          <div className="sc-anim absolute inset-x-0 h-0" style={{ animation: "sc-beam 2.6s ease-in-out infinite" }}>
            <div className="absolute inset-x-0 -top-10 h-10 bg-gradient-to-b from-transparent to-primary/40" />
            <div className="absolute inset-x-[-4%] h-[3px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_18px_4px_hsl(var(--primary))]" />
          </div>
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 rounded-full bg-background/85 px-4 py-2 text-sm font-medium backdrop-blur">
          <ScanLine className="h-4 w-4 text-primary" /> Live scan · hold steady
          <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary"><Sparkles className="h-4 w-4" />Point. Scan. Done.</p>
        <h3 className="font-display text-2xl font-semibold">From camera to card details in seconds</h3>
        <p className="mt-2 text-muted-foreground">Hold a card up and CollectAI finds its edges, reads it, and matches it to real price data. No typing.</p>
        <ul className="mt-6 space-y-3">
          {steps.map(s => (
            <li key={s.label} className="sc-anim flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 opacity-0" style={{ animation: `sc-in .5s ease-out ${s.delay} forwards` }}>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <span className="ml-auto text-right text-sm font-semibold">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
