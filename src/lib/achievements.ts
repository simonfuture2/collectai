import { Trophy, Sparkles, Flame, Gem, DollarSign, Layers, Star, Zap } from "lucide-react";

export interface AchievementCard {
  id: string;
  card_name: string | null;
  card_set: string | null;
  rarity: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  created_at: string;
  special_features?: string[] | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: typeof Trophy;
  unlocked: boolean;
  progress?: { current: number; target: number };
}

const avg = (c: AchievementCard) =>
  ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2;

const isHolo = (c: AchievementCard) => {
  const r = (c.rarity || "").toLowerCase();
  const f = (c.special_features || []).join(" ").toLowerCase();
  return /holo|foil|refractor|prizm|reverse/.test(r + " " + f);
};

// Daily-streak: count distinct calendar days with any scan, ending today
export const computeStreak = (cards: AchievementCard[]): number => {
  if (cards.length === 0) return 0;
  const days = new Set(
    cards.map((c) => new Date(c.created_at).toISOString().slice(0, 10))
  );
  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export const computeAchievements = (cards: AchievementCard[]): Achievement[] => {
  const total = cards.length;
  const holos = cards.filter(isHolo).length;
  const top = cards.reduce((m, c) => Math.max(m, avg(c)), 0);
  const portfolio = cards.reduce((s, c) => s + avg(c), 0);
  const streak = computeStreak(cards);
  const sets = new Set(cards.map((c) => c.card_set).filter(Boolean)).size;

  return [
    {
      id: "first_scan",
      title: "First Scan",
      description: "Scan your very first card",
      icon: Sparkles,
      unlocked: total >= 1,
      progress: { current: Math.min(total, 1), target: 1 },
    },
    {
      id: "ten_cards",
      title: "Getting Serious",
      description: "Reach 10 cards in your collection",
      icon: Layers,
      unlocked: total >= 10,
      progress: { current: Math.min(total, 10), target: 10 },
    },
    {
      id: "fifty_cards",
      title: "True Collector",
      description: "Reach 50 cards",
      icon: Trophy,
      unlocked: total >= 50,
      progress: { current: Math.min(total, 50), target: 50 },
    },
    {
      id: "first_holo",
      title: "First Holo",
      description: "Scan your first holo, foil, or refractor",
      icon: Star,
      unlocked: holos >= 1,
      progress: { current: Math.min(holos, 1), target: 1 },
    },
    {
      id: "hundred_dollar",
      title: "Hundo Hit",
      description: "Pull a card valued at $100+",
      icon: DollarSign,
      unlocked: top >= 100,
      progress: { current: Math.min(top, 100), target: 100 },
    },
    {
      id: "grail",
      title: "Grail Card",
      description: "Pull a card valued at $500+",
      icon: Gem,
      unlocked: top >= 500,
      progress: { current: Math.min(top, 500), target: 500 },
    },
    {
      id: "portfolio_1k",
      title: "Portfolio: $1K",
      description: "Build a collection worth $1,000+",
      icon: Zap,
      unlocked: portfolio >= 1000,
      progress: { current: Math.min(portfolio, 1000), target: 1000 },
    },
    {
      id: "streak_3",
      title: "On a Roll",
      description: "Scan cards 3 days in a row",
      icon: Flame,
      unlocked: streak >= 3,
      progress: { current: Math.min(streak, 3), target: 3 },
    },
    {
      id: "streak_7",
      title: "Week Warrior",
      description: "Scan cards 7 days in a row",
      icon: Flame,
      unlocked: streak >= 7,
      progress: { current: Math.min(streak, 7), target: 7 },
    },
    {
      id: "five_sets",
      title: "Set Explorer",
      description: "Collect cards from 5 different sets",
      icon: Layers,
      unlocked: sets >= 5,
      progress: { current: Math.min(sets, 5), target: 5 },
    },
  ];
};
