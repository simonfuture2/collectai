import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Eye, EyeOff, Share2, Copy, Twitter, Instagram, Download, Sparkles } from "lucide-react";
import collectaiLogo from "@/assets/collectai-logo.png";
import SEO from "@/components/SEO";
import { HoloFoil, FoilBadge, shouldFoil } from "@/components/HoloFoil";
import { GlassCard } from "@/components/ui/glass-card";
import { toast } from "sonner";
import { toPng } from "html-to-image";

interface PublicCard {
  id: string;
  card_name: string | null;
  card_set: string | null;
  card_year: string | null;
  condition_grade: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  image_url: string;
}

const fmtUsd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n.toFixed(0)}`;

export default function PublicCollection() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);
  const [cards, setCards] = useState<PublicCard[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [hideValue, setHideValue] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!slug) return;
      const { data: prof, error: profError } = await (supabase as any)
        .from("public_profiles")
        .select("id, display_name")
        .eq("public_collection_slug", slug)
        .maybeSingle();

      if (profError || !prof) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile({ display_name: prof.display_name });

      const { data: cardData } = await supabase
        .from("cards")
        .select("id, card_name, card_set, card_year, condition_grade, estimated_value_low, estimated_value_high, image_url")
        .eq("user_id", prof.id)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(60);

      const cardList = (cardData || []) as PublicCard[];
      setCards(cardList);

      const urls: Record<string, string> = {};
      await Promise.all(
        cardList.map(async (card) => {
          if (!card.image_url) return;
          if (card.image_url.startsWith("http")) {
            const match = card.image_url.match(/card-images\/(.+?)(\?|$)/);
            if (match?.[1]) {
              const { data: signed } = await supabase.storage
                .from("card-images")
                .createSignedUrl(match[1], 3600);
              urls[card.id] = signed?.signedUrl || card.image_url;
            } else {
              urls[card.id] = card.image_url;
            }
          } else {
            const { data: signed } = await supabase.storage
              .from("card-images")
              .createSignedUrl(card.image_url, 3600);
            urls[card.id] = signed?.signedUrl || card.image_url;
          }
        })
      );
      setImageUrls(urls);
      setLoading(false);
    };
    run();
  }, [slug]);

  const totalValue = useMemo(
    () =>
      cards.reduce(
        (sum, c) => sum + ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2,
        0
      ),
    [cards]
  );

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `Check out ${profile?.display_name ?? "this"}'s trading card collection on MyCollectAI`;

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied");
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "MyCollectAI Showcase", text: shareText, url: shareUrl });
      } catch {/* user cancelled */}
    } else {
      copy();
    }
  };

  const shareX = () => {
    const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(u, "_blank", "noopener");
  };

  const shareInstagram = async () => {
    await copy();
    toast.info("Link copied — paste into Instagram", {
      description: "Instagram doesn't support direct web sharing. Use the image export to post your showcase.",
    });
  };

  const exportImage = async () => {
    const el = document.getElementById("showcase-capture");
    if (!el) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#08090d",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${slug || "showcase"}-mycollectai.png`;
      a.click();
      toast.success("Image saved");
    } catch (e) {
      toast.error("Couldn't export image");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-display font-bold mb-4">Showcase Not Found</h1>
        <p className="text-muted-foreground mb-6">This collection is private or doesn't exist.</p>
        <Link to="/auth">
          <Button className="gradient-primary">
            <Camera className="mr-2 w-4 h-4" /> Start Your Own Collection
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090d] text-foreground">
      <SEO
        title={`${profile?.display_name ?? "Collector"}'s Showcase | MyCollectAI`}
        description={`${profile?.display_name ?? "This collector"}'s curated card showcase — graded slabs, chases, and market values.`}
        path={`/u/${slug ?? ""}`}
        ogType="website"
      />

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-primary/15 blur-[140px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-fuchsia-500/10 blur-[120px]" />
      </div>

      <header className="border-b border-white/5 backdrop-blur-md sticky top-0 z-30 bg-black/30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={collectaiLogo} alt="MyCollectAI" className="w-7 h-7 rounded-lg" />
            <span className="text-base font-display font-bold text-gradient-primary">MyCollectAI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHideValue((v) => !v)}
              className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {hideValue ? <EyeOff className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
              {hideValue ? "Hidden" : "Value"}
            </Button>
            <Button size="sm" onClick={nativeShare} className="gradient-primary">
              <Share2 className="w-4 h-4 mr-1.5" /> Share
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-6xl">
        <div id="showcase-capture" className="space-y-10 rounded-3xl">
          {/* Hero */}
          <section className="text-center pt-4 pb-2 relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-400/30 bg-amber-400/5 mb-5">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-amber-200/90">
                Curated Showcase
              </span>
            </div>
            <h1 className="text-4xl sm:text-6xl font-display font-bold tracking-tight">
              {profile?.display_name || "Collector"}
            </h1>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              The Collection
            </p>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 max-w-xl mx-auto gap-3">
              <GlassCard padding="sm" className="text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Cards</div>
                <div className="text-2xl font-display font-bold tabular-nums mt-1">{cards.length}</div>
              </GlassCard>
              <GlassCard padding="sm" className="text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Graded</div>
                <div className="text-2xl font-display font-bold tabular-nums mt-1">
                  {cards.filter((c) => !!c.condition_grade && /psa|bgs|cgc|sgc/i.test(c.condition_grade)).length}
                </div>
              </GlassCard>
              <GlassCard padding="sm" className="text-center col-span-2 sm:col-span-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total Value</div>
                <div className="text-2xl font-display font-bold tabular-nums mt-1 text-gradient-primary">
                  {hideValue ? "•••••" : fmtUsd(totalValue)}
                </div>
              </GlassCard>
            </div>
          </section>

          {/* Grid */}
          {cards.length === 0 ? (
            <GlassCard padding="lg" className="text-center">
              <p className="text-muted-foreground">No cards in this showcase yet.</p>
            </GlassCard>
          ) : (
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {cards.map((card) => {
                const avg =
                  ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;
                const isGraded =
                  !!card.condition_grade && /psa|bgs|cgc|sgc/i.test(card.condition_grade);
                const foil = shouldFoil({ isGraded, value: avg, threshold: 50 });
                return (
                  <div key={card.id} className="group">
                    <HoloFoil
                      active={foil}
                      radiusClassName="rounded-xl"
                      badge={isGraded ? <FoilBadge label={card.condition_grade!} /> : undefined}
                      badgeRight={
                        !hideValue && avg >= 50 ? <FoilBadge label={fmtUsd(avg)} /> : undefined
                      }
                    >
                      <div className="aspect-[3/4] bg-black/40 rounded-xl overflow-hidden ring-1 ring-white/5">
                        <img
                          src={imageUrls[card.id] || card.image_url}
                          alt={card.card_name || "Card"}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          loading="lazy"
                          crossOrigin="anonymous"
                        />
                      </div>
                    </HoloFoil>
                    <div className="mt-2.5 px-0.5">
                      <p className="text-sm font-semibold truncate">{card.card_name || "Unknown"}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
                          {[card.card_year, card.card_set].filter(Boolean).join(" · ") || "—"}
                        </span>
                        {!hideValue && avg > 0 && (
                          <span className="text-[11px] font-semibold tabular-nums text-primary ml-2 shrink-0">
                            {fmtUsd(avg)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>

        {/* Share row */}
        <section className="mt-10">
          <GlassCard padding="md">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                  Share this showcase
                </div>
                <div className="text-sm text-foreground/80 truncate font-mono">{shareUrl}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={copy}>
                  <Copy className="w-4 h-4 mr-1.5" /> Copy
                </Button>
                <Button variant="outline" size="sm" onClick={shareX}>
                  <Twitter className="w-4 h-4 mr-1.5" /> X
                </Button>
                <Button variant="outline" size="sm" onClick={shareInstagram}>
                  <Instagram className="w-4 h-4 mr-1.5" /> Instagram
                </Button>
                <Button size="sm" onClick={exportImage} disabled={exporting} className="gradient-primary">
                  <Download className="w-4 h-4 mr-1.5" />
                  {exporting ? "Rendering…" : "Save Image"}
                </Button>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* CTA */}
        <section className="mt-10 text-center">
          <div className="inline-flex flex-col items-center gap-3 px-8 py-8 rounded-3xl border border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Powered by MyCollectAI
            </div>
            <h2 className="text-xl font-display font-bold">Build your own showcase</h2>
            <Link to="/auth">
              <Button size="lg" className="gradient-primary">
                <Camera className="mr-2 w-5 h-5" /> Start Scanning Free
              </Button>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
