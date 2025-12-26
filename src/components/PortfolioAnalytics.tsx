import { TrendingUp, TrendingDown, DollarSign, Layers, BarChart3, PieChart } from "lucide-react";
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface Card {
  id: string;
  card_name: string | null;
  card_set: string | null;
  rarity: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  created_at: string;
}

interface PortfolioAnalyticsProps {
  cards: Card[];
}

const COLORS = [
  "hsl(280, 85%, 65%)",  // primary purple
  "hsl(200, 90%, 55%)",  // secondary blue
  "hsl(45, 100%, 55%)",  // accent yellow
  "hsl(330, 85%, 65%)", // pink
  "hsl(150, 80%, 45%)", // green
  "hsl(25, 95%, 60%)",  // orange
];

export default function PortfolioAnalytics({ cards }: PortfolioAnalyticsProps) {
  // Calculate total value
  const totalValue = cards.reduce((sum, card) => {
    return sum + ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;
  }, 0);

  // Calculate average card value
  const avgCardValue = cards.length > 0 ? totalValue / cards.length : 0;

  // Find most valuable card
  const mostValuableCard = cards.reduce((max, card) => {
    const cardValue = ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;
    const maxValue = ((max?.estimated_value_low || 0) + (max?.estimated_value_high || 0)) / 2;
    return cardValue > maxValue ? card : max;
  }, cards[0]);

  // Group by set for pie chart
  const setDistribution = cards.reduce((acc, card) => {
    const set = card.card_set || "Unknown";
    if (!acc[set]) {
      acc[set] = { name: set, value: 0, count: 0 };
    }
    acc[set].value += ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;
    acc[set].count += 1;
    return acc;
  }, {} as Record<string, { name: string; value: number; count: number }>);

  const pieData = Object.values(setDistribution)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Group by rarity for bar chart
  const rarityDistribution = cards.reduce((acc, card) => {
    const rarity = card.rarity || "Unknown";
    if (!acc[rarity]) {
      acc[rarity] = { name: rarity, value: 0, count: 0 };
    }
    acc[rarity].value += ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;
    acc[rarity].count += 1;
    return acc;
  }, {} as Record<string, { name: string; value: number; count: number }>);

  const barData = Object.values(rarityDistribution)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Recent additions (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentCards = cards.filter(card => new Date(card.created_at) > thirtyDaysAgo);
  const recentValue = recentCards.reduce((sum, card) => {
    return sum + ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;
  }, 0);

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Total Value"
          value={`$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          color="primary"
        />
        <StatCard
          icon={<Layers className="w-5 h-5" />}
          label="Total Cards"
          value={cards.length.toString()}
          color="secondary"
        />
        <StatCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="Avg Card Value"
          value={`$${avgCardValue.toFixed(2)}`}
          color="accent"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Added (30 days)"
          value={`+${recentCards.length} ($${recentValue.toFixed(0)})`}
          color="green"
        />
      </div>

      {/* Most Valuable Card */}
      {mostValuableCard && (
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">👑</span>
            <h3 className="font-display font-bold">Most Valuable Card</h3>
          </div>
          <p className="text-xl font-semibold">{mostValuableCard.card_name || "Unknown"}</p>
          <p className="text-muted-foreground text-sm">{mostValuableCard.card_set}</p>
          <p className="text-2xl font-display font-bold text-gradient-primary mt-2">
            ${(((mostValuableCard.estimated_value_low || 0) + (mostValuableCard.estimated_value_high || 0)) / 2).toFixed(2)}
          </p>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Set Distribution Pie Chart */}
        {pieData.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-5 h-5 text-primary" />
              <h3 className="font-display font-bold">Value by Set</h3>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Value"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </RePieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {pieData.slice(0, 4).map((item, i) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-muted-foreground truncate max-w-[100px]">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rarity Distribution Bar Chart */}
        {barData.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-secondary" />
              <h3 className="font-display font-bold">Value by Rarity</h3>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis type="category" dataKey="name" width={80} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Value"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string; 
  color: "primary" | "secondary" | "accent" | "green";
}) {
  const colorClasses = {
    primary: "text-primary bg-primary/10 border-primary/20",
    secondary: "text-secondary bg-secondary/10 border-secondary/20",
    accent: "text-accent bg-accent/10 border-accent/20",
    green: "text-green-500 bg-green-500/10 border-green-500/20",
  };

  return (
    <div className={`p-4 rounded-xl border ${colorClasses[color].split(" ").slice(1).join(" ")}`}>
      <div className={`${colorClasses[color].split(" ")[0]} mb-2`}>{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-display font-bold text-foreground">{value}</p>
    </div>
  );
}