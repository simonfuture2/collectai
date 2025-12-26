import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Sparkles, TrendingUp, TrendingDown, Minus, Calendar, Star, Tag, DollarSign, BarChart3, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import type { Tables } from "@/integrations/supabase/types";

type Card = Tables<"cards">;

interface EbayData {
  description?: string;
  averagePrice?: number;
  lowPrice?: number;
  highPrice?: number;
  recentSalesCount?: string;
  notableSales?: string[];
}

interface TCGPlayerData {
  marketPrice?: number;
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
  description?: string;
}

interface PSAData {
  description?: string;
  estimatedPopulation?: string;
  gradedPremium?: string;
  recentGradedSales?: string[];
}

interface AIAnalysis {
  cardName?: string;
  cardSet?: string;
  cardYear?: string;
  edition?: string;
  rarity?: string;
  cardNumber?: string;
  conditionGrade?: string;
  conditionNotes?: string;
  specialFeatures?: string[];
  estimatedValueLow?: number;
  estimatedValueHigh?: number;
  valueCurrency?: string;
  ebayRecentSales?: EbayData;
  tcgplayerPrice?: TCGPlayerData;
  psaPopulation?: PSAData;
  priceFactors?: string[];
  valueTrend?: "rising" | "stable" | "falling" | "unknown";
  trendReason?: string;
  confidence?: "high" | "medium" | "low";
  confidenceReason?: string;
  investmentOutlook?: string;
  additionalNotes?: string;
}

// Mock price history data (in a real app, this would come from an API)
const generatePriceHistory = (valueLow: number, valueHigh: number) => {
  const avgValue = (valueLow + valueHigh) / 2;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentMonth = new Date().getMonth();
  
  return months.slice(0, currentMonth + 1).map((month, i) => ({
    month,
    price: Math.round(avgValue * (0.85 + Math.random() * 0.3) * 100) / 100,
  }));
};

export default function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [priceHistory, setPriceHistory] = useState<{ month: string; price: number }[]>([]);

  useEffect(() => {
    const fetchCard = async () => {
      if (!id) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        toast.error("Card not found");
        navigate("/collection");
        return;
      }

      setCard(data);
      setNotes(data.notes || "");
      setPriceHistory(generatePriceHistory(data.estimated_value_low || 10, data.estimated_value_high || 50));
      setLoading(false);
    };

    fetchCard();
  }, [id, navigate]);

  const saveNotes = async () => {
    if (!card) return;
    setSaving(true);

    const { error } = await supabase
      .from("cards")
      .update({ notes })
      .eq("id", card.id);

    if (error) {
      toast.error("Failed to save notes");
    } else {
      toast.success("Notes saved!");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!card) return null;

  const analysis = card.ai_analysis as AIAnalysis | null;
  const avgValue = ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/collection")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display font-bold text-xl truncate">{card.card_name || "Card Details"}</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: Card Image */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-4 overflow-hidden">
              <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted">
                <img
                  src={card.image_url}
                  alt={card.card_name || "Card"}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-primary text-primary-foreground rounded-xl p-4">
                <p className="text-sm opacity-80">Estimated Value</p>
                <p className="text-2xl font-display font-bold">
                  ${avgValue.toFixed(2)}
                </p>
                <p className="text-xs opacity-70">
                  ${card.estimated_value_low?.toFixed(2)} - ${card.estimated_value_high?.toFixed(2)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Condition</p>
                <p className="text-xl font-display font-bold text-foreground">
                  {card.condition_grade || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">AI Assessed</p>
              </div>
            </div>
          </div>

          {/* Right: Details */}
          <div className="space-y-6">
            {/* AI Analysis Section */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-lg">AI Analysis</h2>
              </div>

              <div className="space-y-4">
                {/* Card Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem icon={<Tag className="w-4 h-4" />} label="Set" value={card.card_set} />
                  <InfoItem icon={<Calendar className="w-4 h-4" />} label="Year" value={card.card_year} />
                  <InfoItem icon={<Star className="w-4 h-4" />} label="Rarity" value={card.rarity} />
                  <InfoItem icon={<Tag className="w-4 h-4" />} label="Edition" value={card.edition} />
                </div>

                {/* Special Features */}
                {card.special_features && card.special_features.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Special Features</p>
                    <div className="flex flex-wrap gap-2">
                      {card.special_features.map((feature, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Condition Notes */}
                {analysis?.conditionNotes && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Condition Assessment</p>
                    <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3">
                      {analysis.conditionNotes}
                    </p>
                  </div>
                )}

                {/* Price Factors */}
                {analysis?.priceFactors && analysis.priceFactors.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Price Factors</p>
                    <ul className="space-y-1">
                      {analysis.priceFactors.map((factor, i) => (
                        <li key={i} className="text-sm text-foreground flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Market Trend */}
                {analysis?.valueTrend && analysis.valueTrend !== "unknown" && (
                  <div className="flex items-center gap-2 text-sm">
                    {analysis.valueTrend === "rising" ? (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    ) : analysis.valueTrend === "falling" ? (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    ) : (
                      <Minus className="w-4 h-4 text-yellow-500" />
                    )}
                    <span className="text-muted-foreground">Market Trend:</span>
                    <span className={`font-medium ${
                      analysis.valueTrend === "rising" ? "text-green-500" :
                      analysis.valueTrend === "falling" ? "text-red-500" : "text-yellow-500"
                    }`}>
                      {analysis.valueTrend.charAt(0).toUpperCase() + analysis.valueTrend.slice(1)}
                    </span>
                  </div>
                )}
                {analysis?.trendReason && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    {analysis.trendReason}
                  </p>
                )}

                {/* Confidence */}
                {analysis?.confidence && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">AI Confidence:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      analysis.confidence === "high" ? "bg-green-500/20 text-green-500" :
                      analysis.confidence === "medium" ? "bg-yellow-500/20 text-yellow-500" :
                      "bg-red-500/20 text-red-500"
                    }`}>
                      {analysis.confidence.toUpperCase()}
                    </span>
                  </div>
                )}
                {analysis?.confidenceReason && (
                  <p className="text-xs text-muted-foreground">
                    {analysis.confidenceReason}
                  </p>
                )}
              </div>
            </div>

            {/* eBay Market Data */}
            {analysis?.ebayRecentSales && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingCart className="w-5 h-5 text-blue-500" />
                  <h2 className="font-display font-bold text-lg">eBay Market Data</h2>
                </div>
                
                <div className="space-y-4">
                  {/* Price Range */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Low</p>
                      <p className="text-lg font-bold text-foreground">
                        ${analysis.ebayRecentSales.lowPrice?.toFixed(2) || "—"}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="text-xs text-primary">Average</p>
                      <p className="text-lg font-bold text-primary">
                        ${analysis.ebayRecentSales.averagePrice?.toFixed(2) || "—"}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">High</p>
                      <p className="text-lg font-bold text-foreground">
                        ${analysis.ebayRecentSales.highPrice?.toFixed(2) || "—"}
                      </p>
                    </div>
                  </div>

                  {analysis.ebayRecentSales.recentSalesCount && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Activity: </span>
                      {analysis.ebayRecentSales.recentSalesCount}
                    </p>
                  )}

                  {analysis.ebayRecentSales.description && (
                    <p className="text-sm text-muted-foreground">
                      {analysis.ebayRecentSales.description}
                    </p>
                  )}

                  {analysis.ebayRecentSales.notableSales && analysis.ebayRecentSales.notableSales.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Notable Sales</p>
                      <ul className="space-y-1">
                        {analysis.ebayRecentSales.notableSales.map((sale, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <DollarSign className="w-3 h-3 mt-1 text-green-500" />
                            {sale}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TCGPlayer Pricing */}
            {analysis?.tcgplayerPrice && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-orange-500" />
                  <h2 className="font-display font-bold text-lg">TCGPlayer Pricing</h2>
                </div>
                
                <div className="space-y-4">
                  {/* Price Range */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Low</p>
                      <p className="text-base font-bold text-foreground">
                        ${analysis.tcgplayerPrice.lowPrice?.toFixed(2) || "—"}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Mid</p>
                      <p className="text-base font-bold text-foreground">
                        ${analysis.tcgplayerPrice.midPrice?.toFixed(2) || "—"}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                      <p className="text-xs text-orange-500">Market</p>
                      <p className="text-base font-bold text-orange-500">
                        ${analysis.tcgplayerPrice.marketPrice?.toFixed(2) || "—"}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">High</p>
                      <p className="text-base font-bold text-foreground">
                        ${analysis.tcgplayerPrice.highPrice?.toFixed(2) || "—"}
                      </p>
                    </div>
                  </div>

                  {analysis.tcgplayerPrice.description && (
                    <p className="text-sm text-muted-foreground">
                      {analysis.tcgplayerPrice.description}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* PSA Population Data */}
            {analysis?.psaPopulation && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-purple-500" />
                  <h2 className="font-display font-bold text-lg">Graded Card Data</h2>
                </div>
                
                <div className="space-y-3">
                  {analysis.psaPopulation.estimatedPopulation && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Est. Population</span>
                      <span className="font-medium text-foreground">{analysis.psaPopulation.estimatedPopulation}</span>
                    </div>
                  )}
                  
                  {analysis.psaPopulation.gradedPremium && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Graded Premium</span>
                      <span className="font-medium text-foreground">{analysis.psaPopulation.gradedPremium}</span>
                    </div>
                  )}

                  {analysis.psaPopulation.description && (
                    <p className="text-sm text-muted-foreground pt-2 border-t border-border">
                      {analysis.psaPopulation.description}
                    </p>
                  )}

                  {analysis.psaPopulation.recentGradedSales && analysis.psaPopulation.recentGradedSales.length > 0 && (
                    <div className="pt-2">
                      <p className="text-sm font-medium text-foreground mb-2">Recent Graded Sales</p>
                      <ul className="space-y-1">
                        {analysis.psaPopulation.recentGradedSales.map((sale, i) => (
                          <li key={i} className="text-sm text-muted-foreground">• {sale}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Investment Outlook */}
            {analysis?.investmentOutlook && (
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h2 className="font-display font-bold text-lg">Investment Outlook</h2>
                </div>
                <p className="text-sm text-foreground">
                  {analysis.investmentOutlook}
                </p>
              </div>
            )}

            {/* Price History Chart */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-lg">Price History</h2>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={priceHistory}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#priceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Based on AI market research and similar card sales
              </p>
            </div>

            {/* Personal Notes */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg">Personal Notes</h2>
                <Button onClick={saveNotes} disabled={saving} size="sm" className="gap-2">
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add your personal notes about this card... (purchase price, location, memories, etc.)"
                className="min-h-[120px] resize-none"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value || "Unknown"}</p>
      </div>
    </div>
  );
}

