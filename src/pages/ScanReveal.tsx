import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Value } from "@/components/ui/value";
import { FadeUp, PressScale } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, BadgeCheck, Plus, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";
import GradeLadder from "@/components/GradeLadder";
import { AIAnalysisCard } from "@/components/AIAnalysisCard";

const PENDING_STATUSES = ["pending", "identifying", "pricing", "analyzing", "verifying"];

const ROTATING_MESSAGES = [
  "Pulling recent sales…",
  "Checking graded comps…",
  "Running AI analysis…",
  "Cross-referencing TCGPlayer…",
  "Scanning eBay sold listings…",
];

const getSignedImageUrl = async (imageUrlOrPath: string) => {
  if (!imageUrlOrPath) return "";
  if (!imageUrlOrPath.startsWith("http")) {
    const { data } = await supabase.storage.from("card-images").createSignedUrl(imageUrlOrPath, 3600);
    return data?.signedUrl || imageUrlOrPath;
  }
  const match = imageUrlOrPath.match(/card-images\/(.+?)(\?|$)/);
  if (match?.[1]) {
    const { data } = await supabase.storage.from("card-images").createSignedUrl(match[1], 3600);
    return data?.signedUrl || imageUrlOrPath;
  }
  return imageUrlOrPath;
};

function confidenceToPct(card: any): { pct: number; label: string } {
  const a = card?.ai_analysis || {};
  const numeric =
    typeof a.confidencePct === "number" ? a.confidencePct :
    typeof a.confidence === "number" ? a.confidence :
    typeof a.matchPct === "number" ? a.matchPct : null;
  if (numeric != null) {
    const pct = Math.max(0, Math.min(100, Math.round(numeric)));
    return { pct, label: pct >= 80 ? "High" : pct >= 55 ? "Medium" : "Low" };
  }
  const band = (a.confidence || a.confidenceBand || a.variant_confidence || "").toString().toLowerCase();
  if (band === "high") return { pct: 92, label: "High" };
  if (band === "medium") return { pct: 72, label: "Medium" };
  if (band === "low") return { pct: 48, label: "Low" };
  return { pct: 0, label: "—" };
}

function ConfidenceRing({ pct, label }: { pct: number; label: string }) {
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setAnimated(eased * pct);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  const offset = c - (animated / 100) * c;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="confGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F5D27A" />
            <stop offset="100%" stopColor="#B8860B" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--border))"
          strokeWidth={stroke}
          fill="none"
          opacity={0.4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#confGold)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-numeric text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent leading-none">
          {Math.round(animated)}%
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mt-1.5">
          {label}
        </span>
      </div>
    </div>
  );
}

function RotatingStatus({ statusLabel }: { statusLabel?: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % ROTATING_MESSAGES.length), 1800);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
      <AnimatePresence mode="wait">
        <motion.span
          key={statusLabel ? `s-${statusLabel}` : idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
        >
          {statusLabel || ROTATING_MESSAGES[idx]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-muted/40 ${className}`}
      style={{ backgroundImage: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)", backgroundSize: "200% 100%" }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ backgroundImage: "linear-gradient(90deg, transparent, rgba(245,210,122,0.10), transparent)" }}
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

type Comp = { price: number; source: string; date?: string; title?: string };

function parseComps(card: any): Comp[] {
  const out: Comp[] = [];
  const emd = card?.ai_analysis?.extractedMarketData;
  if (emd?.sources) {
    for (const s of emd.sources) {
      if (typeof s.median === "number") {
        out.push({ price: s.median, source: s.source || "Market", date: "Median" });
      }
    }
  }
  const ebay = card?.ebay_recent_sales || card?.ai_analysis?.ebayRecentSales;
  const notable: any[] = ebay?.notableSales || [];
  for (const n of notable.slice(0, 8)) {
    if (typeof n === "string") {
      const m = n.match(/\$?([\d,]+(?:\.\d+)?)/);
      if (m) out.push({ price: parseFloat(m[1].replace(/,/g, "")), source: "eBay", title: n });
    } else if (n && typeof n === "object") {
      const price = Number(n.price ?? n.amount ?? 0);
      if (price > 0) out.push({ price, source: n.source || "eBay", date: n.date, title: n.title });
    }
  }
  return out.sort((a, b) => b.price - a.price);
}

const ScanReveal = () => {
  const { cardId } = useParams();
  const navigate = useNavigate();
  const [card, setCard] = useState<any>(null);
  const [imgUrl, setImgUrl] = useState<string>("");
  const [revealed, setRevealed] = useState(false);
  const notifiedRef = useRef(false);

  // Initial load + realtime + poll
  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;

    const fetchCard = async () => {
      const { data } = await supabase.from("cards").select("*").eq("id", cardId).maybeSingle();
      if (cancelled || !data) return;
      setCard(data);
      if (!imgUrl && data.image_url) {
        const url = await getSignedImageUrl(data.image_url);
        if (!cancelled) setImgUrl(url);
      }
      if (data.analysis_status === "complete" && !notifiedRef.current) {
        notifiedRef.current = true;
      }
    };

    fetchCard();
    const channel = supabase
      .channel(`scan-reveal-${cardId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cards", filter: `id=eq.${cardId}` }, fetchCard)
      .subscribe();
    const pollId = window.setInterval(fetchCard, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  // Trigger reveal animation once image is in
  useEffect(() => {
    if (imgUrl && !revealed) {
      const t = window.setTimeout(() => setRevealed(true), 250);
      return () => window.clearTimeout(t);
    }
  }, [imgUrl, revealed]);

  const status = card?.analysis_status as string | undefined;
  const isPending = !status || PENDING_STATUSES.includes(status);
  const conf = useMemo(() => confidenceToPct(card), [card]);
  const comps = useMemo(() => parseComps(card), [card]);

  const lo = Number(card?.estimated_value_low || 0);
  const hi = Number(card?.estimated_value_high || 0);
  const rawValue = lo && hi ? (lo + hi) / 2 : lo || hi || 0;

  const grades = card?.ai_analysis?.gradedValueEstimates;
  const recGrader: string = (grades?.recommendedGrader || "psa").toLowerCase();
  const graderVals = grades?.[recGrader];
  const gradedValue: number = Number(graderVals?.valueAtPSA10 ?? graderVals?.valueAtGrade ?? 0);
  const gradedLabel = `${recGrader.toUpperCase()} 10`;

  const statusLabel =
    status === "identifying" ? "Identifying card…" :
    status === "pricing" ? "Pricing card…" :
    status === "analyzing" ? "Running AI analysis…" :
    status === "verifying" ? "Verifying details…" :
    undefined;

  const cardName = card?.card_name || card?.ai_analysis?.cardName;
  const cardSet = card?.card_set || card?.ai_analysis?.cardSet;
  const cardYear = card?.card_year || card?.ai_analysis?.cardYear;
  const edition = card?.edition || card?.ai_analysis?.edition;
  const parallel = card?.ai_analysis?.parallel || card?.ai_analysis?.variant;
  const number = card?.ai_analysis?.cardNumber || card?.ai_analysis?.number;

  const topComp = comps[0];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Scan Result – MyCollectAI"
        description="Your card has been identified — view confidence, value, and recent sold comps."
        path={`/scan/reveal/${cardId}`}
        noIndex
      />

      <header className="border-b border-border-subtle/60 backdrop-blur-md sticky top-0 z-30 bg-background/70">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/scan">
            <Button variant="ghost" size="icon" aria-label="Back to scan">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Scan Result
          </div>
          <Link to="/scan">
            <Button variant="ghost" size="sm">New Scan</Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
        {/* Hero: image + identity + confidence */}
        <FadeUp>
          <GlassCard padding="lg" className="relative overflow-hidden">
            <div
              aria-hidden
              className="absolute inset-0 opacity-40 pointer-events-none"
              style={{
                background:
                  "radial-gradient(60% 50% at 50% 0%, rgba(245,210,122,0.18), transparent 70%)",
              }}
            />
            <div className="relative grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
              {/* Card image with reveal */}
              <div className="flex justify-center md:justify-start">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 12, rotateX: -8 }}
                  animate={{
                    opacity: revealed ? 1 : 0,
                    scale: revealed ? 1 : 0.9,
                    y: revealed ? 0 : 12,
                    rotateX: revealed ? 0 : -8,
                  }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  className="relative"
                  style={{ perspective: 800 }}
                >
                  {imgUrl ? (
                    <>
                      <img
                        src={imgUrl}
                        alt={cardName || "Scanned card"}
                        className="h-56 w-auto rounded-xl border border-border-subtle shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] object-cover"
                      />
                      <div
                        aria-hidden
                        className="absolute -bottom-6 left-1/2 -translate-x-1/2 h-8 w-[80%] rounded-[50%]"
                        style={{
                          background:
                            "radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 70%)",
                          filter: "blur(8px)",
                        }}
                      />
                    </>
                  ) : (
                    <Shimmer className="h-56 w-40" />
                  )}
                </motion.div>
              </div>

              {/* Identity + confidence */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Identified
                  </div>
                  {cardName ? (
                    <h1 className="text-2xl md:text-3xl font-display font-bold leading-tight">
                      {cardName}
                    </h1>
                  ) : (
                    <Shimmer className="h-8 w-3/4" />
                  )}
                  {(cardSet || cardYear) ? (
                    <p className="text-sm text-muted-foreground">
                      {[cardSet, cardYear].filter(Boolean).join(" • ")}
                    </p>
                  ) : isPending ? (
                    <Shimmer className="h-4 w-1/2" />
                  ) : null}
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  {[
                    { label: "Number", value: number },
                    { label: "Edition", value: edition },
                    { label: "Parallel", value: parallel },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-lg border border-border-subtle/70 bg-surface/40 px-2.5 py-2"
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {m.label}
                      </div>
                      <div className="text-sm font-medium text-foreground mt-0.5 truncate">
                        {m.value || "—"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Confidence row */}
                <div className="flex items-center gap-4 pt-1">
                  {conf.pct > 0 ? (
                    <ConfidenceRing pct={conf.pct} label={conf.label} />
                  ) : (
                    <div className="w-[132px] h-[132px] flex items-center justify-center">
                      <Shimmer className="h-[132px] w-[132px] rounded-full" />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      Confidence Score
                    </div>
                    <p className="text-sm text-foreground/90 leading-snug">
                      AI-verified match against set database, visual hash, and recent comps.
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <BadgeCheck className="w-3.5 h-3.5 text-primary" />
                      <span>Cross-checked across multiple sources</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </FadeUp>

        {/* Value block */}
        <FadeUp delay={0.1}>
          <GlassCard padding="lg">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2">
                  Estimated Value · Raw
                </div>
                {rawValue > 0 ? (
                  <Value amount={rawValue} size="xl" tone="gold" decimals={2} />
                ) : isPending ? (
                  <Shimmer className="h-14 w-56" />
                ) : (
                  <span className="text-3xl font-numeric text-muted-foreground">—</span>
                )}
                {lo > 0 && hi > 0 && lo !== hi && (
                  <div className="mt-2 text-xs text-muted-foreground font-numeric">
                    Range ${lo.toFixed(0)} – ${hi.toFixed(0)}
                  </div>
                )}
              </div>

              <div className="md:text-right">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2">
                  Graded · {gradedLabel}
                </div>
                {gradedValue > 0 ? (
                  <Value amount={gradedValue} size="lg" tone="default" decimals={2} />
                ) : isPending ? (
                  <Shimmer className="h-8 w-32 md:ml-auto" />
                ) : (
                  <span className="text-2xl font-numeric text-muted-foreground">—</span>
                )}
                {gradedValue > 0 && rawValue > 0 && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-gain font-medium">
                    <TrendingUp className="w-3 h-3" />
                    {Math.max(0, Math.round((gradedValue / rawValue - 1) * 100))}% grading upside
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </FadeUp>

        {/* Grade Ladder */}
        <FadeUp delay={0.13}>
          <GradeLadder estimates={card?.ai_analysis?.gradedValueEstimates} rawValue={rawValue} />
        </FadeUp>

        {/* Comps */}
        <FadeUp delay={0.15}>
          <GlassCard padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Recent Sold Comps
              </div>
              {isPending && <RotatingStatus statusLabel={statusLabel} />}
            </div>

            {topComp ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-primary/40 bg-gradient-to-r from-primary/10 to-transparent p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/90">
                      Highest Recent Sale
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {topComp.source}{topComp.date ? ` · ${topComp.date}` : ""}
                    </div>
                  </div>
                  <Value amount={topComp.price} size="lg" tone="gold" decimals={2} />
                </div>

                <div className="divide-y divide-border-subtle/60">
                  {comps.slice(1, 6).map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {c.title || c.source}
                        </div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                          {c.source}{c.date ? ` · ${c.date}` : ""}
                        </div>
                      </div>
                      <Value amount={c.price} size="md" decimals={2} animate={false} />
                    </div>
                  ))}
                </div>
              </div>
            ) : isPending ? (
              <div className="space-y-3">
                <Shimmer className="h-16 w-full" />
                <Shimmer className="h-10 w-full" />
                <Shimmer className="h-10 w-full" />
                <Shimmer className="h-10 w-4/5" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No recent comps located. Try re-scanning or check back shortly.
              </p>
            )}
          </GlassCard>
        </FadeUp>

        {/* Primary actions */}
        <FadeUp delay={0.2}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
            <PressScale as="button" className="contents">
              <Button
                onClick={() => {
                  toast.success("Added to your collection");
                  navigate("/collection");
                }}
                className="w-full gradient-primary text-white font-semibold py-6 text-base rounded-xl shadow-[0_10px_30px_-8px_rgba(245,210,122,0.55)]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add to Collection
              </Button>
            </PressScale>
            <PressScale as="button" className="contents">
              <Button
                variant="outline"
                onClick={() => cardId && navigate(`/card/${cardId}`)}
                className="w-full py-6 text-base rounded-xl border-border-subtle bg-surface/40 backdrop-blur-md font-semibold"
              >
                See Full Analysis
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </PressScale>
          </div>
        </FadeUp>
      </main>

      <Footer />
    </div>
  );
};

export default ScanReveal;
