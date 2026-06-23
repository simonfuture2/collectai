import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { HoloFoil, FoilBadge, shouldFoil } from "@/components/HoloFoil";
import {
  Globe, Copy, Share2, Twitter, Instagram, ExternalLink, Search, Loader2, Check,
} from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";

interface CardRow {
  id: string;
  card_name: string | null;
  card_set: string | null;
  card_year: string | null;
  condition_grade: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  image_url: string;
  is_public: boolean;
}

const fmtUsd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n.toFixed(0)}`;

export default function Showcase() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "selected">("all");

  useEffect(() => {
    document.title = "Showcase | MyCollectAI";
  }, []);

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setUserId(user.id);

      const [{ data: prof }, { data: cardData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, public_collection_enabled, public_collection_slug")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("cards")
          .select("id, card_name, card_set, card_year, condition_grade, estimated_value_low, estimated_value_high, image_url, is_public")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      setDisplayName(prof?.display_name || "Collector");
      setEnabled(prof?.public_collection_enabled || false);
      setSlug(prof?.public_collection_slug || null);

      const list = (cardData || []) as CardRow[];
      setCards(list);

      const urls: Record<string, string> = {};
      await Promise.all(
        list.map(async (c) => {
          if (!c.image_url) return;
          const path = c.image_url.startsWith("http")
            ? c.image_url.match(/card-images\/(.+?)(\?|$)/)?.[1]
            : c.image_url;
          if (path) {
            const { data } = await supabase.storage.from("card-images").createSignedUrl(path, 3600);
            urls[c.id] = data?.signedUrl || c.image_url;
          } else {
            urls[c.id] = c.image_url;
          }
        })
      );
      setImageUrls(urls);
      setLoading(false);
    };
    run();
  }, [navigate]);

  const togglePublic = async () => {
    if (!userId) return;
    setTogglingPublic(true);
    const next = !enabled;
    let nextSlug = slug;
    if (next && !slug) {
      const base = displayName.toLowerCase().replace(/[^a-z0-9]/g, "") || "collector";
      nextSlug = `${base}-${Math.random().toString(36).substring(2, 6)}`;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ public_collection_enabled: next, public_collection_slug: nextSlug })
      .eq("id", userId);
    if (error) toast.error("Failed to update");
    else {
      setEnabled(next);
      setSlug(nextSlug);
      toast.success(next ? "Showcase is now live" : "Showcase is private");
    }
    setTogglingPublic(false);
  };

  const toggleCard = async (card: CardRow) => {
    setSavingId(card.id);
    const next = !card.is_public;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, is_public: next } : c)));
    const { error } = await supabase.from("cards").update({ is_public: next }).eq("id", card.id);
    if (error) {
      toast.error("Couldn't update card");
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, is_public: !next } : c)));
    }
    setSavingId(null);
  };

  const setAll = async (value: boolean) => {
    if (!userId) return;
    setCards((prev) => prev.map((c) => ({ ...c, is_public: value })));
    const { error } = await supabase.from("cards").update({ is_public: value }).eq("user_id", userId);
    if (error) toast.error("Bulk update failed");
    else toast.success(value ? "All cards added" : "Showcase cleared");
  };

  const publicUrl = slug ? `${window.location.origin}/u/${slug}` : "";
  const selected = useMemo(() => cards.filter((c) => c.is_public), [cards]);
  const totalValue = useMemo(
    () =>
      selected.reduce(
        (s, c) => s + ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2,
        0
      ),
    [selected]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (filter === "selected" && !c.is_public) return false;
      if (!q) return true;
      return (
        (c.card_name || "").toLowerCase().includes(q) ||
        (c.card_set || "").toLowerCase().includes(q)
      );
    });
  }, [cards, query, filter]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
  };
  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "My MyCollectAI Showcase", url: publicUrl });
      } catch {/* */}
    } else copyLink();
  };
  const shareX = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent("Check out my trading card collection on MyCollectAI")}&url=${encodeURIComponent(publicUrl)}`,
      "_blank",
      "noopener"
    );
  };
  const shareIG = async () => {
    await copyLink();
    toast.info("Link copied for Instagram");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090d] text-foreground">
      <SEO title="Showcase | MyCollectAI" description="Curate the cards that appear on your public showcase." path="/showcase" />

      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-primary/10 blur-[140px]" />
      </div>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Public Profile</p>
            <h1 className="text-3xl font-display font-bold mt-1">Your Showcase</h1>
          </div>
          <Link to="/collection">
            <Button variant="ghost" size="sm">← Collection</Button>
          </Link>
        </div>

        {/* Visibility + Share card */}
        <GlassCard padding="lg" className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex items-center gap-4 flex-1">
              <div className="p-3 rounded-xl bg-primary/10">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-bold text-lg">Showcase visibility</h2>
                  {enabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[10px] uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {enabled
                    ? "Anyone with the link can view selected cards."
                    : "Turn on to publish your showcase to a shareable URL."}
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={togglePublic} disabled={togglingPublic} />
            </div>
          </div>

          {enabled && slug && (
            <div className="mt-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-black/40 border border-white/5 rounded-lg px-4 py-2.5 text-sm font-mono truncate">
                  {publicUrl}
                </div>
                <Button variant="outline" size="icon" onClick={copyLink}>
                  <Copy className="w-4 h-4" />
                </Button>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="icon">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={nativeShare} className="gradient-primary">
                  <Share2 className="w-4 h-4 mr-1.5" /> Share
                </Button>
                <Button size="sm" variant="outline" onClick={shareX}>
                  <Twitter className="w-4 h-4 mr-1.5" /> Post to X
                </Button>
                <Button size="sm" variant="outline" onClick={shareIG}>
                  <Instagram className="w-4 h-4 mr-1.5" /> Instagram
                </Button>
              </div>
            </div>
          )}
        </GlassCard>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <GlassCard padding="sm" className="text-center">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">In Showcase</div>
            <div className="text-2xl font-display font-bold tabular-nums mt-1">{selected.length}</div>
          </GlassCard>
          <GlassCard padding="sm" className="text-center">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total Cards</div>
            <div className="text-2xl font-display font-bold tabular-nums mt-1">{cards.length}</div>
          </GlassCard>
          <GlassCard padding="sm" className="text-center">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Showcase Value</div>
            <div className="text-2xl font-display font-bold tabular-nums mt-1 text-gradient-primary">
              {fmtUsd(totalValue)}
            </div>
          </GlassCard>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search your cards…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-black/30 border-white/5"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              variant={filter === "selected" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("selected")}
            >
              In showcase
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAll(true)}>Add all</Button>
            <Button variant="ghost" size="sm" onClick={() => setAll(false)}>Clear</Button>
          </div>
        </div>

        {/* Card picker grid */}
        {visible.length === 0 ? (
          <GlassCard padding="lg" className="text-center text-muted-foreground">
            No cards match.
          </GlassCard>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {visible.map((card) => {
              const avg =
                ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;
              const isGraded =
                !!card.condition_grade && /psa|bgs|cgc|sgc/i.test(card.condition_grade);
              const foil = shouldFoil({ isGraded, value: avg, threshold: 50 });
              const isOn = card.is_public;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => toggleCard(card)}
                  disabled={savingId === card.id}
                  className={`text-left group relative rounded-xl transition-all ${
                    isOn
                      ? "ring-2 ring-primary shadow-[0_0_0_4px_rgba(255,180,30,0.08)]"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <HoloFoil
                    active={foil && isOn}
                    radiusClassName="rounded-xl"
                    badge={isGraded ? <FoilBadge label={card.condition_grade!} /> : undefined}
                    badgeRight={avg >= 50 ? <FoilBadge label={fmtUsd(avg)} /> : undefined}
                  >
                    <div className="aspect-[3/4] bg-black/40 rounded-xl overflow-hidden ring-1 ring-white/5">
                      <img
                        src={imageUrls[card.id] || card.image_url}
                        alt={card.card_name || "Card"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </HoloFoil>

                  {/* selection chip */}
                  <div
                    className={`absolute top-2 right-2 z-20 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                      isOn
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-black/50 border-white/20 text-white/70"
                    }`}
                  >
                    {savingId === card.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isOn ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-[10px]">+</span>
                    )}
                  </div>

                  <div className="mt-2 px-0.5">
                    <p className="text-sm font-semibold truncate">
                      {card.card_name || "Unknown"}
                    </p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
                        {[card.card_year, card.card_set].filter(Boolean).join(" · ") || "—"}
                      </span>
                      {avg > 0 && (
                        <span className="text-[11px] font-semibold tabular-nums text-primary ml-2">
                          {fmtUsd(avg)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
