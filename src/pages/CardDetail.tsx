import { useEffect, useState, useCallback } from "react";

const safeFixed = (val: unknown, digits = 2): string => {
  const num = typeof val === 'number' ? val : Number(val);
  return isNaN(num) ? '—' : num.toFixed(digits);
};
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Save,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Star,
  Tag,
  DollarSign,
  BarChart3,
  ShoppingCart,
  Award,
  CheckCircle,
  XCircle,
  Calculator,
  RefreshCw,
  Share2,
} from "lucide-react";
import SEO from "@/components/SEO";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";
import PreGradingAnalysis from "@/components/PreGradingAnalysis";
import EcosystemBadge from "@/components/EcosystemBadge";
import AuthentiSealVerify from "@/components/AuthentiSealVerify";
import AIDisclaimer from "@/components/AIDisclaimer";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import DefectMapOverlay from "@/components/DefectMapOverlay";

type Card = Tables<"cards">;

const getSignedImageUrl = async (imageUrlOrPath: string) => {
  // New format: DB stores file path like "userId/filename.png"
  if (!imageUrlOrPath.startsWith("http")) {
    const { data } = await supabase.storage.from("card-images").createSignedUrl(imageUrlOrPath, 3600);
    return data?.signedUrl || imageUrlOrPath;
  }

  // Legacy format: DB may store an (expired) signed URL or public URL
  const match = imageUrlOrPath.match(/card-images\/(.+?)(\?|$)/);
  if (match?.[1]) {
    const { data } = await supabase.storage.from("card-images").createSignedUrl(match[1], 3600);
    return data?.signedUrl || imageUrlOrPath;
  }

  return imageUrlOrPath;
};


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

interface GraderValues {
  estimatedGrade?: number;
  valueAtGrade?: number;
  valueAtPSA10?: number;
  valueAtPSA9?: number;
  valueAtPSA8?: number;
  valueAtBGS10?: number;
  valueAtBGS9_5?: number;
  valueAtBGS9?: number;
  valueAtCGC10?: number;
  valueAtCGC9_5?: number;
  valueAtCGC9?: number;
  valueAtSGC10?: number;
  valueAtSGC9_5?: number;
  valueAtSGC9?: number;
  gradingCost?: number;
  turnaroundTime?: string;
  blackLabelPotential?: string;
}

interface GradedValueEstimates {
  currentGradeEstimate?: string;
  worthGrading?: boolean;
  worthGradingReason?: string;
  recommendedGrader?: "PSA" | "BGS" | "CGC" | "SGC";
  recommendedGraderReason?: string;
  psa?: GraderValues;
  bgs?: GraderValues;
  cgc?: GraderValues;
  sgc?: GraderValues;
}

interface PreGradingData {
  centering?: {
    score?: number;
    frontLeftRight?: string;
    frontTopBottom?: string;
    backLeftRight?: string;
    backTopBottom?: string;
    notes?: string;
    psa10Eligible?: boolean;
  };
  corners?: {
    score?: number;
    topLeft?: string;
    topRight?: string;
    bottomLeft?: string;
    bottomRight?: string;
    notes?: string;
  };
  edges?: {
    score?: number;
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
    notes?: string;
  };
  surface?: {
    score?: number;
    front?: string;
    back?: string;
    holoCondition?: string;
    notes?: string;
  };
  overallScore?: number;
  predictedGrades?: {
    psa?: number;
    bgs?: number;
    cgc?: number;
    sgc?: number;
  };
  bgsSubgrades?: {
    centering?: number;
    corners?: number;
    edges?: number;
    surface?: number;
  };
  gradingRecommendation?: string;
}

interface AIAnalysis {
  cardName?: string;
  cardSet?: string;
  cardYear?: string;
  edition?: string;
  rarity?: string;
  cardNumber?: string;
  parallelVariant?: string;
  conditionGrade?: string;
  conditionNotes?: string;
  preGradingAnalysis?: PreGradingData;
  specialFeatures?: string[];
  estimatedValueLow?: number;
  estimatedValueHigh?: number;
  valueCurrency?: string;
  ebayRecentSales?: EbayData;
  tcgplayerPrice?: TCGPlayerData;
  psaPopulation?: PSAData;
  gradedValueEstimates?: GradedValueEstimates;
  priceFactors?: string[];
  valueTrend?: "rising" | "stable" | "falling" | "unknown";
  trendReason?: string;
  confidence?: "high" | "medium" | "low";
  confidenceReason?: string;
  investmentOutlook?: string;
  additionalNotes?: string;
  dataSource?: string;
  verificationNote?: string;
}

// Generate mock price history as fallback
const generatePriceHistory = (valueLow: number, valueHigh: number) => {
  const avgValue = (valueLow + valueHigh) / 2;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentMonth = new Date().getMonth();
  
  return months.slice(0, currentMonth + 1).map((month) => ({
    month,
    price: Math.round(avgValue * (0.85 + Math.random() * 0.3) * 100) / 100,
    source: "simulated" as string,
  }));
};

interface PriceHistoryPoint {
  month: string;
  price: number;
  source: string;
  ebay_sold?: number;
  ebay_active?: number;
  tcgplayer?: number;
  blended?: number;
}

export default function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<Card | null>(null);
  const [cardImageUrl, setCardImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [hasRealPriceData, setHasRealPriceData] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  const loadPriceHistory = useCallback(async (cardId: string, low: number | null, high: number | null) => {
    const { data: priceData } = await supabase
      .from("price_history")
      .select("*")
      .eq("card_id", cardId)
      .order("recorded_at", { ascending: true });

    if (priceData && priceData.length > 0) {
      setHasRealPriceData(true);
      const points: PriceHistoryPoint[] = priceData
        .filter((p: any) => p.source === "blended" || p.source === "ebay_sold")
        .map((p: any) => {
          const d = new Date(p.recorded_at);
          return {
            month: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            price: Number(p.median_price) || 0,
            source: p.source,
          };
        });
      if (points.length > 0) {
        setPriceHistory(points);
        return;
      }
    }
    setPriceHistory(generatePriceHistory(low || 10, high || 50));
  }, []);

  useEffect(() => {
    const fetchCard = async () => {
      if (!id) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      const { data, error } = await supabase
        .from("cards").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();

      if (error || !data) {
        toast.error("Card not found");
        navigate("/collection");
        return;
      }

      setCard(data);
      await loadPriceHistory(data.id, data.estimated_value_low, data.estimated_value_high);
      const signed = await getSignedImageUrl(data.image_url);
      setCardImageUrl(signed);
      setLoading(false);
    };

    fetchCard();
  }, [id, navigate, loadPriceHistory]);

  // Subscribe to realtime updates while analysis is in progress; fall back to polling.
  useEffect(() => {
    if (!id || !card) return;
    const status = (card as any).analysis_status;
    if (status !== "analyzing" && status !== "pending") return;

    let cancelled = false;

    const refetch = async () => {
      if (cancelled) return;
      const { data } = await supabase.from("cards").select("*").eq("id", id).maybeSingle();
      if (!data || cancelled) return;
      setCard(data);
      if ((data as any).analysis_status === "complete") {
        await loadPriceHistory(data.id, data.estimated_value_low, data.estimated_value_high);
        toast.success("AI analysis complete!");
      } else if ((data as any).analysis_status === "failed") {
        toast.error("AI analysis failed — you can retry from the re-scan button.");
      }
    };

    const channel = supabase
      .channel(`card-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cards", filter: `id=eq.${id}` }, () => {
        refetch();
      })
      .subscribe();

    const pollId = window.setInterval(refetch, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [id, card, loadPriceHistory]);


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

  // Check if free daily rescan is available (last scan > 24h ago)
  const isFreeRescanAvailable = useCallback(() => {
    if (!card) return false;
    const lastScanned = (card as any).last_scanned_at;
    if (!lastScanned) return true; // Never scanned = free
    const lastScanTime = new Date(lastScanned).getTime();
    return Date.now() - lastScanTime > 86400000; // 24 hours
  }, [card]);

  const rescanPrices = async () => {
    if (!card || !id) return;
    setRescanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to re-scan prices");
        return;
      }
      const { data, error } = await supabase.functions.invoke("collectai-price", {
        body: {
          cardName: card.card_name || "",
          cardSet: card.card_set || "",
          cardYear: card.card_year || "",
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;

      // Insert new price history rows
      if (data?.extractedMarketData?.sources) {
        const user = session.user;
        const priceRows: any[] = [];
        for (const src of data.extractedMarketData.sources) {
          priceRows.push({
            card_id: id,
            user_id: user.id,
            source: src.source,
            median_price: src.median,
            low_price: src.low,
            high_price: src.high,
            price_count: src.count,
            raw_prices: src.prices,
          });
        }
        if (data.extractedMarketData.blended) {
          priceRows.push({
            card_id: id,
            user_id: user.id,
            source: "blended",
            median_price: data.extractedMarketData.blended.median,
            low_price: data.extractedMarketData.blended.low,
            high_price: data.extractedMarketData.blended.high,
            price_count: 0,
            raw_prices: [],
          });
        }
        if (priceRows.length > 0) {
          await supabase.from("price_history").insert(priceRows);
        }

        // === FIX: Update card values in DB ===
        const blended = data.extractedMarketData.blended;
        const newLow = blended?.low ?? card.estimated_value_low;
        const newHigh = blended?.high ?? card.estimated_value_high;
        const updatedAnalysis = {
          ...(card.ai_analysis as any || {}),
          estimatedValueLow: newLow,
          estimatedValueHigh: newHigh,
          noMarketData: false,
          dataSource: "Real eBay + TCGPlayer data (re-scan update)",
          lastRescanData: {
            blended: blended || null,
            sources: data.extractedMarketData.sources?.map((s: any) => ({ source: s.source, median: s.median, count: s.count })) || [],
            rescanDate: new Date().toISOString(),
          },
        };

        const { error: updateError } = await supabase
          .from("cards")
          .update({
            estimated_value_low: newLow,
            estimated_value_high: newHigh,
            ai_analysis: updatedAnalysis,
            last_scanned_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (updateError) {
          console.error("Failed to update card values:", updateError);
        } else {
          // Update local state immediately
          setCard((prev) => prev ? {
            ...prev,
            estimated_value_low: newLow,
            estimated_value_high: newHigh,
            ai_analysis: updatedAnalysis,
            last_scanned_at: new Date().toISOString(),
          } as Card : prev);
        }

        // Refresh price history display
        const { data: priceData } = await supabase
          .from("price_history")
          .select("*")
          .eq("card_id", id)
          .order("recorded_at", { ascending: true });

        if (priceData && priceData.length > 0) {
          setHasRealPriceData(true);
          const points: PriceHistoryPoint[] = priceData
            .filter((p: any) => p.source === "blended" || p.source === "ebay_sold")
            .map((p: any) => {
              const d = new Date(p.recorded_at);
              return {
                month: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                price: Number(p.median_price) || 0,
                source: p.source,
              };
            });
          if (points.length > 0) setPriceHistory(points);
        }
        toast.success("Prices updated with fresh market data!");
      } else {
        // Even with no new market data, update last_scanned_at
        await supabase.from("cards").update({ last_scanned_at: new Date().toISOString() }).eq("id", id);
        setCard((prev) => prev ? { ...prev, last_scanned_at: new Date().toISOString() } as Card : prev);
        toast.error("No market data found for this card");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to re-scan prices");
    } finally {
      setRescanning(false);
    }
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
      <SEO
        title={`${card.card_name ?? "Card"} – Grade & Value | CollectAI`}
        description={`${card.card_name ?? "This card"}${card.condition_grade ? ` graded ${card.condition_grade}` : ""}. View AI analysis, estimated market value, and grading breakdown on CollectAI.`}
        path={`/card/${card.id}`}
        ogType="product"
        noIndex
      />
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/collection")} aria-label="Go back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display font-bold text-xl truncate flex-1">{card.card_name || "Card Details"}</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              // Set card as public and copy share URL
              await supabase.from("cards").update({ is_public: true }).eq("id", card.id);
              const url = `${window.location.origin}/card/share/${card.id}`;
              navigator.clipboard.writeText(url);
              toast.success("Share link copied!");
            }}
          >
            <Share2 className="w-4 h-4 mr-1" /> Share
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {((card as any).analysis_status === "analyzing" || (card as any).analysis_status === "pending") && (
          <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-primary animate-spin shrink-0" />
            <div className="flex-1">
              <p className="font-display font-semibold text-sm">AI analysis in progress…</p>
              <p className="text-xs text-muted-foreground">Pulling live market prices and grading details. This page updates automatically — feel free to keep using the app.</p>
            </div>
          </div>
        )}
        {(card as any).analysis_status === "failed" && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-display font-semibold text-sm">AI analysis failed</p>
              <p className="text-xs text-muted-foreground">{(card as any).analysis_error || "Something went wrong while pulling market data."}</p>
            </div>
            <Button size="sm" variant="outline" onClick={rescanPrices} disabled={rescanning}>
              {rescanning ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: Card Image + Grading Value Sections (on desktop) */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-4 overflow-hidden">
              <DefectMapOverlay
                imageUrl={cardImageUrl || card.image_url}
                alt={card.card_name ? `${card.card_name} trading card` : "Trading card"}
                defects={Array.isArray((analysis as any)?.defects) ? (analysis as any).defects : []}
              />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="gradient-primary rounded-xl p-4">
                <p className="text-sm text-white/80">Estimated Value</p>
                <p className="text-2xl font-display font-bold text-white">
                  ${safeFixed(avgValue)}
                </p>
                <p className="text-xs text-white/70">
                  ${safeFixed(card.estimated_value_low)} - ${safeFixed(card.estimated_value_high)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Condition</p>
                <p className="text-xl font-display font-bold text-foreground">
                  {card.condition_grade || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">AI Assessed</p>
                {(card as any).last_scanned_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    Last scanned: {new Date((card as any).last_scanned_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>
            </div>

            {/* Re-Scan Button */}
            <Button
              onClick={rescanPrices}
              disabled={rescanning}
              className="w-full gradient-primary hover:opacity-90 text-white"
            >
              <RefreshCw className={`w-4 h-4 ${rescanning ? 'animate-spin' : ''}`} />
              {rescanning ? 'Re-Scanning...' : isFreeRescanAvailable() ? '🆓 Free Daily Re-Scan' : 'Re-Scan & Update Prices'}
            </Button>

            {/* List on Marketplace */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate(`/marketplace/list/${card.id}`)}
            >
              List on Marketplace
            </Button>

            {/* No Market Data Warning */}
            {analysis && (analysis as any).noMarketData && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Values estimated without live market data</p>
                  <p className="text-xs text-muted-foreground mt-1">Actual prices may differ significantly. Try re-scanning to check for updated pricing.</p>
                  {(analysis as any).valuationWarning && (
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">{(analysis as any).valuationWarning}</p>
                  )}
                </div>
              </div>
            )}

            {/* Data Source & Confidence Badge */}
            {analysis && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Pricing Confidence</span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    analysis.confidence === "high"
                      ? "bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/25"
                      : analysis.confidence === "medium"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                      : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/25"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      analysis.confidence === "high" ? "bg-green-500" : analysis.confidence === "medium" ? "bg-amber-500" : "bg-red-500"
                    }`} />
                    {analysis.confidence === "high" ? "High" : analysis.confidence === "medium" ? "Medium" : "Low"} Confidence
                  </span>
                </div>

                {analysis.dataSource && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Data Source</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{analysis.dataSource}</p>
                    </div>
                  </div>
                )}

                {analysis.confidenceReason && (
                  <p className="text-xs text-muted-foreground">{analysis.confidenceReason}</p>
                )}

                {analysis.verificationNote && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">AI Verification</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{analysis.verificationNote}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Graded Value Estimates - Desktop only under photo */}
            <div className="hidden lg:block space-y-6">
              {analysis?.gradedValueEstimates && (
                <div className="bg-card border border-border rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-amber-500" />
                    <h2 className="font-display font-bold text-lg">Estimated Value After Grading</h2>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Worth Grading Assessment */}
                    <div className={`flex items-start gap-3 p-4 rounded-xl ${
                      analysis.gradedValueEstimates.worthGrading 
                        ? "bg-green-500/10 border border-green-500/20" 
                        : "bg-yellow-500/10 border border-yellow-500/20"
                    }`}>
                      {analysis.gradedValueEstimates.worthGrading ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                      )}
                      <div>
                        <p className={`font-medium ${
                          analysis.gradedValueEstimates.worthGrading ? "text-green-500" : "text-yellow-500"
                        }`}>
                          {analysis.gradedValueEstimates.worthGrading ? "Worth Grading" : "Consider Carefully"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {analysis.gradedValueEstimates.worthGradingReason}
                        </p>
                      </div>
                    </div>

                    {/* Recommended Grader */}
                    {analysis.gradedValueEstimates.recommendedGrader && (
                      <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl">
                        <p className="text-sm text-muted-foreground">Recommended Grader</p>
                        <p className="text-xl font-bold text-primary">{analysis.gradedValueEstimates.recommendedGrader}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {analysis.gradedValueEstimates.recommendedGraderReason}
                        </p>
                      </div>
                    )}

                    {/* Current Grade Estimate */}
                    {analysis.gradedValueEstimates.currentGradeEstimate && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Expected Grade: </span>
                        {analysis.gradedValueEstimates.currentGradeEstimate}
                      </p>
                    )}

                    {/* Grader Cards Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* PSA */}
                      {analysis.gradedValueEstimates.psa && (
                        <GraderCard
                          name="PSA"
                          color="red"
                          grader={analysis.gradedValueEstimates.psa}
                          grades={[
                            { label: "PSA 10", value: analysis.gradedValueEstimates.psa.valueAtPSA10 },
                            { label: "PSA 9", value: analysis.gradedValueEstimates.psa.valueAtPSA9 },
                            { label: "PSA 8", value: analysis.gradedValueEstimates.psa.valueAtPSA8 },
                          ]}
                        />
                      )}

                      {/* BGS */}
                      {analysis.gradedValueEstimates.bgs && (
                        <GraderCard
                          name="BGS"
                          color="blue"
                          grader={analysis.gradedValueEstimates.bgs}
                          grades={[
                            { label: "BGS 10", value: analysis.gradedValueEstimates.bgs.valueAtBGS10 },
                            { label: "BGS 9.5", value: analysis.gradedValueEstimates.bgs.valueAtBGS9_5 },
                            { label: "BGS 9", value: analysis.gradedValueEstimates.bgs.valueAtBGS9 },
                          ]}
                          extra={analysis.gradedValueEstimates.bgs.blackLabelPotential}
                        />
                      )}

                      {/* CGC */}
                      {analysis.gradedValueEstimates.cgc && (
                        <GraderCard
                          name="CGC"
                          color="yellow"
                          grader={analysis.gradedValueEstimates.cgc}
                          grades={[
                            { label: "CGC 10", value: analysis.gradedValueEstimates.cgc.valueAtCGC10 },
                            { label: "CGC 9.5", value: analysis.gradedValueEstimates.cgc.valueAtCGC9_5 },
                            { label: "CGC 9", value: analysis.gradedValueEstimates.cgc.valueAtCGC9 },
                          ]}
                        />
                      )}

                      {/* SGC */}
                      {analysis.gradedValueEstimates.sgc && (
                        <GraderCard
                          name="SGC"
                          color="green"
                          grader={analysis.gradedValueEstimates.sgc}
                          grades={[
                            { label: "SGC 10", value: analysis.gradedValueEstimates.sgc.valueAtSGC10 },
                            { label: "SGC 9.5", value: analysis.gradedValueEstimates.sgc.valueAtSGC9_5 },
                            { label: "SGC 9", value: analysis.gradedValueEstimates.sgc.valueAtSGC9 },
                          ]}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Grading ROI Calculator - Desktop */}
              {analysis?.gradedValueEstimates && (
                <GradingROICalculator 
                  rawValue={avgValue}
                  gradedEstimates={analysis.gradedValueEstimates}
                />
              )}

              {/* Investment Outlook - Desktop */}
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

              {/* Price History Chart - Desktop */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <h2 className="font-display font-bold text-lg">Price History</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      hasRealPriceData
                        ? "bg-green-500/15 text-green-600 dark:text-green-400"
                        : "text-muted-foreground bg-muted"
                    }`}>
                      {hasRealPriceData ? "Real Data" : "Simulated"}
                    </span>
                    <Button variant="ghost" size="sm" onClick={rescanPrices} disabled={rescanning} className="h-7 px-2">
                      <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={priceHistory}>
                      <defs>
                        <linearGradient id="priceGradientDesktop" x1="0" y1="0" x2="0" y2="1">
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
                        fill="url(#priceGradientDesktop)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {hasRealPriceData
                    ? "Based on real eBay & TCGPlayer market data • Re-scan to add new data points"
                    : "Based on AI market research • Scan again to build real price history"}
                </p>
              </div>

              {/* AuthentiSeal Verification + Create Certificate - Desktop */}
              <AuthentiSealVerify cardData={{
                name: card.card_name || undefined,
                category: card.category || undefined,
                set: card.card_set || undefined,
                year: card.card_year || undefined,
                condition: card.condition_grade || undefined,
                valueLow: card.estimated_value_low || undefined,
                valueHigh: card.estimated_value_high || undefined,
              }} cardId={id} />

              {/* Ecosystem Badge - Desktop */}
              <div className="flex justify-center">
                <EcosystemBadge type="authentiseal" variant="inline" />
              </div>

              {/* Personal Notes - Desktop */}
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

          {/* Right: Details */}
          <div className="space-y-6">
            {/* Pre-Grading Analysis - Like CardGrader.AI and Card Boss */}
            {analysis?.preGradingAnalysis && (
              <PreGradingAnalysis data={analysis.preGradingAnalysis} />
            )}

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
                        ${safeFixed(analysis.ebayRecentSales.lowPrice)}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="text-xs text-primary">Average</p>
                      <p className="text-lg font-bold text-primary">
                        ${safeFixed(analysis.ebayRecentSales.averagePrice)}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">High</p>
                      <p className="text-lg font-bold text-foreground">
                        ${safeFixed(analysis.ebayRecentSales.highPrice)}
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
                        ${safeFixed(analysis.tcgplayerPrice.lowPrice)}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Mid</p>
                      <p className="text-base font-bold text-foreground">
                        ${safeFixed(analysis.tcgplayerPrice.midPrice)}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                      <p className="text-xs text-orange-500">Market</p>
                      <p className="text-base font-bold text-orange-500">
                        ${safeFixed(analysis.tcgplayerPrice.marketPrice)}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">High</p>
                      <p className="text-base font-bold text-foreground">
                        ${safeFixed(analysis.tcgplayerPrice.highPrice)}
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

            {/* Mobile-only: Graded Value Estimates and sections below */}
            <div className="lg:hidden space-y-6">
              {/* Graded Value Estimates */}
              {analysis?.gradedValueEstimates && (
                <div className="bg-card border border-border rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-amber-500" />
                    <h2 className="font-display font-bold text-lg">Estimated Value After Grading</h2>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Worth Grading Assessment */}
                    <div className={`flex items-start gap-3 p-4 rounded-xl ${
                      analysis.gradedValueEstimates.worthGrading 
                        ? "bg-green-500/10 border border-green-500/20" 
                        : "bg-yellow-500/10 border border-yellow-500/20"
                    }`}>
                      {analysis.gradedValueEstimates.worthGrading ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                      )}
                      <div>
                        <p className={`font-medium ${
                          analysis.gradedValueEstimates.worthGrading ? "text-green-500" : "text-yellow-500"
                        }`}>
                          {analysis.gradedValueEstimates.worthGrading ? "Worth Grading" : "Consider Carefully"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {analysis.gradedValueEstimates.worthGradingReason}
                        </p>
                      </div>
                    </div>

                    {/* Recommended Grader */}
                    {analysis.gradedValueEstimates.recommendedGrader && (
                      <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl">
                        <p className="text-sm text-muted-foreground">Recommended Grader</p>
                        <p className="text-xl font-bold text-primary">{analysis.gradedValueEstimates.recommendedGrader}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {analysis.gradedValueEstimates.recommendedGraderReason}
                        </p>
                      </div>
                    )}

                    {/* Current Grade Estimate */}
                    {analysis.gradedValueEstimates.currentGradeEstimate && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Expected Grade: </span>
                        {analysis.gradedValueEstimates.currentGradeEstimate}
                      </p>
                    )}

                    {/* Grader Cards Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* PSA */}
                      {analysis.gradedValueEstimates.psa && (
                        <GraderCard
                          name="PSA"
                          color="red"
                          grader={analysis.gradedValueEstimates.psa}
                          grades={[
                            { label: "PSA 10", value: analysis.gradedValueEstimates.psa.valueAtPSA10 },
                            { label: "PSA 9", value: analysis.gradedValueEstimates.psa.valueAtPSA9 },
                            { label: "PSA 8", value: analysis.gradedValueEstimates.psa.valueAtPSA8 },
                          ]}
                        />
                      )}

                      {/* BGS */}
                      {analysis.gradedValueEstimates.bgs && (
                        <GraderCard
                          name="BGS"
                          color="blue"
                          grader={analysis.gradedValueEstimates.bgs}
                          grades={[
                            { label: "BGS 10", value: analysis.gradedValueEstimates.bgs.valueAtBGS10 },
                            { label: "BGS 9.5", value: analysis.gradedValueEstimates.bgs.valueAtBGS9_5 },
                            { label: "BGS 9", value: analysis.gradedValueEstimates.bgs.valueAtBGS9 },
                          ]}
                          extra={analysis.gradedValueEstimates.bgs.blackLabelPotential}
                        />
                      )}

                      {/* CGC */}
                      {analysis.gradedValueEstimates.cgc && (
                        <GraderCard
                          name="CGC"
                          color="yellow"
                          grader={analysis.gradedValueEstimates.cgc}
                          grades={[
                            { label: "CGC 10", value: analysis.gradedValueEstimates.cgc.valueAtCGC10 },
                            { label: "CGC 9.5", value: analysis.gradedValueEstimates.cgc.valueAtCGC9_5 },
                            { label: "CGC 9", value: analysis.gradedValueEstimates.cgc.valueAtCGC9 },
                          ]}
                        />
                      )}

                      {/* SGC */}
                      {analysis.gradedValueEstimates.sgc && (
                        <GraderCard
                          name="SGC"
                          color="green"
                          grader={analysis.gradedValueEstimates.sgc}
                          grades={[
                            { label: "SGC 10", value: analysis.gradedValueEstimates.sgc.valueAtSGC10 },
                            { label: "SGC 9.5", value: analysis.gradedValueEstimates.sgc.valueAtSGC9_5 },
                            { label: "SGC 9", value: analysis.gradedValueEstimates.sgc.valueAtSGC9 },
                          ]}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Grading ROI Calculator */}
              {analysis?.gradedValueEstimates && (
                <GradingROICalculator 
                  rawValue={avgValue}
                  gradedEstimates={analysis.gradedValueEstimates}
                />
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
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <h2 className="font-display font-bold text-lg">Price History</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      hasRealPriceData
                        ? "bg-green-500/15 text-green-600 dark:text-green-400"
                        : "text-muted-foreground bg-muted"
                    }`}>
                      {hasRealPriceData ? "Real Data" : "Simulated"}
                    </span>
                    <Button variant="ghost" size="sm" onClick={rescanPrices} disabled={rescanning} className="h-7 px-2">
                      <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={priceHistory}>
                      <defs>
                        <linearGradient id="priceGradientMobile" x1="0" y1="0" x2="0" y2="1">
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
                        fill="url(#priceGradientMobile)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {hasRealPriceData
                    ? "Based on real eBay & TCGPlayer market data • Re-scan to add new data points"
                    : "Based on AI market research • Scan again to build real price history"}
                </p>
              </div>

              {/* AuthentiSeal Verification + Create Certificate - Mobile */}
              <AuthentiSealVerify cardData={{
                name: card.card_name || undefined,
                category: card.category || undefined,
                set: card.card_set || undefined,
                year: card.card_year || undefined,
                condition: card.condition_grade || undefined,
                valueLow: card.estimated_value_low || undefined,
                valueHigh: card.estimated_value_high || undefined,
              }} cardId={id} />

              {/* Ecosystem Badge - Mobile */}
              <div className="flex justify-center">
                <EcosystemBadge type="authentiseal" variant="inline" />
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
        </div>
      </main>
      <div className="container mx-auto px-4 pb-4">
        <AIDisclaimer />
      </div>
      <Footer />
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

interface GraderCardProps {
  name: string;
  color: "red" | "blue" | "yellow" | "green";
  grader: GraderValues;
  grades: { label: string; value?: number }[];
  extra?: string;
}

function GraderCard({ name, color, grader, grades, extra }: GraderCardProps) {
  const colorClasses = {
    red: "bg-red-500/10 border-red-500/20 text-red-500",
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-500",
    yellow: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500",
    green: "bg-green-500/10 border-green-500/20 text-green-500",
  };

  return (
    <div className={`p-4 rounded-xl border ${colorClasses[color].split(" ").slice(0, 2).join(" ")}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`font-bold text-lg ${colorClasses[color].split(" ")[2]}`}>{name}</span>
        {grader.estimatedGrade && (
          <span className="text-xs text-muted-foreground">Est. Grade: {grader.estimatedGrade}</span>
        )}
      </div>
      
      <div className="space-y-2">
        {grades.map((grade) => (
          <div key={grade.label} className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{grade.label}</span>
            <span className="font-medium text-foreground">
              {grade.value ? `$${grade.value.toLocaleString()}` : "—"}
            </span>
          </div>
        ))}
      </div>

      {grader.valueAtGrade && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">At Est. Grade</span>
            <span className={`font-bold ${colorClasses[color].split(" ")[2]}`}>
              ${grader.valueAtGrade.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {grader.gradingCost && (
        <div className="mt-2 flex justify-between items-center text-xs">
          <span className="text-muted-foreground">Grading Cost</span>
          <span className="text-foreground">${grader.gradingCost}</span>
        </div>
      )}

      {grader.turnaroundTime && (
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">Turnaround</span>
          <span className="text-foreground">{grader.turnaroundTime}</span>
        </div>
      )}

      {extra && (
        <p className="mt-2 text-xs text-muted-foreground italic">{extra}</p>
      )}
    </div>
  );
}

interface ROIData {
  grader: string;
  color: string;
  gradingCost: number;
  valueAtGrade: number;
  profit: number;
  roi: number;
}

function GradingROICalculator({ 
  rawValue, 
  gradedEstimates 
}: { 
  rawValue: number; 
  gradedEstimates: GradedValueEstimates;
}) {
  const calculateROI = (): ROIData[] => {
    const results: ROIData[] = [];
    
    const graders = [
      { key: 'psa', name: 'PSA', color: 'red' },
      { key: 'bgs', name: 'BGS', color: 'blue' },
      { key: 'cgc', name: 'CGC', color: 'yellow' },
      { key: 'sgc', name: 'SGC', color: 'green' },
    ] as const;

    graders.forEach(({ key, name, color }) => {
      const grader = gradedEstimates[key];
      if (grader?.valueAtGrade && grader.gradingCost) {
        const gradingCost = grader.gradingCost;
        const valueAtGrade = grader.valueAtGrade;
        const profit = valueAtGrade - rawValue - gradingCost;
        const roi = ((profit) / (rawValue + gradingCost)) * 100;
        
        results.push({
          grader: name,
          color,
          gradingCost,
          valueAtGrade,
          profit,
          roi,
        });
      }
    });

    return results.sort((a, b) => b.roi - a.roi);
  };

  const roiData = calculateROI();
  const bestOption = roiData[0];

  if (roiData.length === 0) return null;

  const getColorClasses = (color: string, isPositive: boolean) => {
    const colors: Record<string, { bg: string; border: string; text: string }> = {
      red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-500' },
      blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-500' },
      yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-500' },
      green: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-500' },
    };
    return colors[color] || colors.green;
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-emerald-500" />
        <h2 className="font-display font-bold text-lg">Grading ROI Calculator</h2>
      </div>

      {/* Summary */}
      <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
        <p className="text-sm text-muted-foreground">Current Raw Value</p>
        <p className="text-2xl font-bold text-foreground">${safeFixed(rawValue)}</p>
        {bestOption && bestOption.profit > 0 && (
          <p className="text-sm text-emerald-500 mt-2">
            Best ROI: <span className="font-bold">{bestOption.grader}</span> with {safeFixed(bestOption.roi, 0)}% return
          </p>
        )}
      </div>

      {/* ROI Comparison Table */}
      <div className="space-y-3">
        {roiData.map((data) => {
          const colors = getColorClasses(data.color, data.profit > 0);
          const isProfit = data.profit > 0;
          
          return (
            <div 
              key={data.grader}
              className={`p-4 rounded-xl border ${colors.bg} ${colors.border}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`font-bold text-lg ${colors.text}`}>{data.grader}</span>
                <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                  isProfit 
                    ? 'bg-green-500/20 text-green-500' 
                    : 'bg-red-500/20 text-red-500'
                }`}>
                  {isProfit ? '+' : ''}{safeFixed(data.roi, 0)}% ROI
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Grading Cost</p>
                  <p className="font-medium text-foreground">${data.gradingCost}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Graded Value</p>
                  <p className="font-medium text-foreground">${data.valueAtGrade.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Profit</p>
                  <p className={`font-bold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                    {isProfit ? '+' : ''}${safeFixed(data.profit)}
                  </p>
                </div>
              </div>

              {/* Profit Breakdown */}
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  ${data.valueAtGrade.toLocaleString()} (graded) - ${safeFixed(rawValue)} (raw) - ${data.gradingCost} (cost) = 
                  <span className={`font-medium ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                    {' '}{isProfit ? '+' : ''}${safeFixed(data.profit)}
                  </span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground mt-4 text-center">
        * ROI estimates based on AI analysis. Actual grades and values may vary.
      </p>
    </div>
  );
}
