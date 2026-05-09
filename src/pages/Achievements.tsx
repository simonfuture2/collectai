import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import collectaiLogo from "@/assets/collectai-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Trophy,
  ArrowLeft,
  Lock,
  Flame,
  Calendar,
  ScanLine,
  Award,
  CheckCircle2,
} from "lucide-react";

const HOW_TO_UNLOCK: Record<string, { tip: string; cta?: { label: string; to: string } }> = {
  first_scan: {
    tip: "Open the scanner and capture any card. Even a common will count — this badge is just to get you started.",
    cta: { label: "Scan a Card", to: "/scan" },
  },
  ten_cards: {
    tip: "Build out your collection by scanning 10 different cards. Try scanning a few from a recent pack.",
    cta: { label: "Scan More Cards", to: "/scan" },
  },
  fifty_cards: {
    tip: "Reach 50 scanned cards. Use Pack Rip Mode to add a bunch in one session.",
    cta: { label: "Try Pack Rip", to: "/pack-rip" },
  },
  first_holo: {
    tip: "Scan a card with a holo, foil, refractor, prizm, or reverse-holo finish. Our AI auto-detects the finish.",
    cta: { label: "Scan a Holo", to: "/scan" },
  },
  hundred_dollar: {
    tip: "Pull a card valued at $100+ in our valuation. Try modern chase rookies or rare vintage.",
    cta: { label: "Scan a Card", to: "/scan" },
  },
  grail: {
    tip: "Pull a card valued at $500+. PSA-grade icons, vintage stars, and chase rookies are your best bet.",
    cta: { label: "Scan a Card", to: "/scan" },
  },
  portfolio_1k: {
    tip: "Get your total collection value to $1,000+. Every scan adds to your portfolio.",
    cta: { label: "View Collection", to: "/collection" },
  },
  streak_3: {
    tip: "Scan at least one card on 3 consecutive calendar days. Don't break the chain!",
    cta: { label: "Scan Today", to: "/scan" },
  },
  streak_7: {
    tip: "Scan at least one card every day for 7 days in a row. The hardest part is day 4.",
    cta: { label: "Scan Today", to: "/scan" },
  },
  five_sets: {
    tip: "Collect cards from 5 different sets. Mix vintage, modern, and special releases.",
    cta: { label: "Scan a Card", to: "/scan" },
  },
};
import type { User } from "@supabase/supabase-js";
import { computeAchievements, computeStreak } from "@/lib/achievements";
import type { AchievementCard } from "@/lib/achievements";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";

interface Card extends AchievementCard {}

const Achievements = () => {
  const [user, setUser] = useState<User | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      supabase
        .from("cards")
        .select(
          "id, card_name, card_set, rarity, estimated_value_low, estimated_value_high, created_at, special_features"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data) setCards(data);
          setLoading(false);
        });
    }
  }, [user]);

  const achievements = useMemo(() => computeAchievements(cards), [cards]);
  const streak = useMemo(() => computeStreak(cards), [cards]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;

  const streakAchievements = achievements.filter((a) =>
    a.id.startsWith("streak_")
  );
  const valueAchievements = achievements.filter((a) =>
    ["hundred_dollar", "grail", "portfolio_1k"].includes(a.id)
  );
  const collectionAchievements = achievements.filter(
    (a) =>
      !["hundred_dollar", "grail", "portfolio_1k"].includes(a.id) &&
      !a.id.startsWith("streak_")
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = achievements.find((a) => a.id === selectedId) || null;
  const selectedHow = selectedId ? HOW_TO_UNLOCK[selectedId] : null;

  const renderSection = (title: string, items: typeof achievements) => (
    <div className="mb-10">
      <h3 className="text-xl font-display font-semibold mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((a) => {
          const Icon = a.icon;
          const pct = a.progress
            ? Math.round((a.progress.current / a.progress.target) * 100)
            : a.unlocked
            ? 100
            : 0;
          return (
            <div
              key={a.id}
              className={`relative rounded-2xl border p-5 transition-all hover-scale ${
                a.unlocked
                  ? "border-primary/40 bg-gradient-to-br from-primary/5 to-primary/10"
                  : "border-border bg-card"
              }`}
            >
              {!a.unlocked && (
                <div className="absolute top-3 right-3">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex items-start gap-4">
                <div
                  className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
                    a.unlocked
                      ? "gradient-primary glow-purple"
                      : "bg-muted"
                  }`}
                >
                  <Icon
                    className={`w-6 h-6 ${
                      a.unlocked
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-base">{a.title}</h4>
                    {a.unlocked && (
                      <Award className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {a.description}
                  </p>
                  {a.progress && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {a.unlocked ? "Complete" : "In Progress"}
                        </span>
                        <span className="font-medium">
                          {Math.floor(a.progress.current)}/{a.progress.target}
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <img
              src={collectaiLogo}
              alt="CollectAI Logo"
              className="w-10 h-10 rounded-lg"
            />
            <span className="text-2xl font-display font-bold text-gradient-primary">
              CollectAI
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Trophy className="w-8 h-8 text-primary" />
              Achievements
            </h1>
            <p className="text-muted-foreground mt-1">
              Track your collecting milestones and unlock badges.
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl px-6 py-3 flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-display font-bold text-primary">
                {unlockedCount}
                <span className="text-muted-foreground text-lg">/{totalCount}</span>
              </p>
              <p className="text-xs text-muted-foreground">Badges Unlocked</p>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-display font-bold text-orange-500 flex items-center justify-center gap-1">
                <Flame className="w-5 h-5" />
                {streak}
              </p>
              <p className="text-xs text-muted-foreground">Day Streak</p>
            </div>
          </div>
        </div>

        {/* Streak Banner */}
        {!loading && (
          <div
            className={`rounded-2xl border p-5 mb-10 flex items-center gap-4 ${
              streak > 0
                ? "border-orange-500/30 bg-orange-500/5"
                : "border-border bg-card"
            }`}
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${
                streak > 0 ? "bg-orange-500/15" : "bg-muted"
              }`}
            >
              {streak > 0 ? (
                <Flame className="w-7 h-7 text-orange-500" />
              ) : (
                <Calendar className="w-7 h-7 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">
                {streak > 0
                  ? `${streak}-Day Scan Streak`
                  : "Start Your Streak"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {streak > 0
                  ? `Nice work! You've scanned cards ${streak} day${
                      streak === 1 ? "" : "s"
                    } in a row. Keep it going to unlock streak badges!`
                  : "Scan a card today to start your streak. Build up consecutive days to earn badges!"}
              </p>
            </div>
            <Link to="/scan" className="hidden sm:block">
              <Button
                variant={streak > 0 ? "default" : "outline"}
                className={streak > 0 ? "bg-orange-500 hover:bg-orange-600" : ""}
              >
                <ScanLine className="w-4 h-4 mr-2" />
                {streak > 0 ? "Keep Streak Alive" : "Scan a Card"}
              </Button>
            </Link>
          </div>
        )}

        {loading ? (
          <>
            <div className="mb-6">
              <Skeleton className="h-8 w-48 mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4"
                  >
                    <Skeleton className="w-12 h-12 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {renderSection("Collection", collectionAchievements)}
            {renderSection("Value", valueAchievements)}
            {renderSection("Streaks", streakAchievements)}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Achievements;
