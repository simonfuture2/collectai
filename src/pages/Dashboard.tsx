import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate, Link } from "react-router-dom";
import collectaiLogo from "@/assets/collectai-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, LogOut, Wallet, TrendingUp, Layers, BarChart3, Crown, Shield, Trash2, Package } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import CreditBalance from "@/components/CreditBalance";
import UpgradeModal from "@/components/UpgradeModal";
import { useCredits } from "@/hooks/use-credits";
import { useAdmin } from "@/hooks/use-admin";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import PublicCollectionToggle from "@/components/PublicCollectionToggle";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import AchievementsRow from "@/components/AchievementsRow";
import PortfolioHero from "@/components/PortfolioHero";
import SEO from "@/components/SEO";

const PortfolioAnalytics = lazy(() => import("@/components/PortfolioAnalytics"));
const ReferralCard = lazy(() => import("@/components/ReferralCard"));
const ConnectedAccounts = lazy(() => import("@/components/ConnectedAccounts"));
const TransactionHistory = lazy(() => import("@/components/TransactionHistory"));

interface Card {
  id: string;
  card_name: string | null;
  card_set: string | null;
  rarity: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  created_at: string;
  special_features?: string[] | null;
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalCards: 0, totalValue: 0 });
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const navigate = useNavigate();
  const { credits, isPro, loading: creditsLoading } = useCredits();
  const { isAdmin } = useAdmin();
  usePushNotifications();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
    if (!user) return;

    let cancelled = false;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (!cancelled) {
        setLoadError("Your collection is taking longer than expected to load.");
        setLoading(false);
      }
    }, 12_000);

    const loadCards = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase.from("cards")
          .select("id, card_name, card_set, rarity, estimated_value_low, estimated_value_high, created_at, special_features")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal);

        if (error) throw error;
        if (cancelled) return;

        const safeCards = data ?? [];
        setCards(safeCards);
        const total = safeCards.reduce((sum, c) => sum + ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2, 0);
        setStats({ totalCards: safeCards.length, totalValue: total });
      } catch (err) {
        if (cancelled) return;
        if (timedOut) return;
        console.error("Failed to load dashboard cards:", err);
        setLoadError("Your collection could not be loaded right now.");
        setCards([]);
        setStats({ totalCards: 0, totalValue: 0 });
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    };

    loadCards();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Your Collection Dashboard – MyCollectAI"
        description="Manage your graded card collection, track total value, view recent scans, and access AuthentiSeal certificates."
        path="/dashboard"
      />
      <header className="border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex justify-between items-center gap-2">
          <Link to="/" className="flex items-center gap-2 min-w-0 shrink-0">
            <img src={collectaiLogo} alt="MyCollectAI Logo" className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg shrink-0" />
            <span className="hidden sm:inline text-2xl font-display font-bold text-gradient-primary truncate">MyCollectAI</span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-4 flex-wrap justify-end">
            <CreditBalance credits={credits} isPro={isPro} loading={creditsLoading} compact />
            {isAdmin && (
              <Link to="/admin">
                <Button variant="outline" size="sm" className="gap-1 px-2 sm:px-3">
                  <Shield className="w-4 h-4" /> <span className="hidden sm:inline">Admin</span>
                </Button>
              </Link>
            )}
            <span className="text-sm text-muted-foreground hidden md:block">{user?.email}</span>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Log out"><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="flex items-center justify-between gap-2 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-display font-bold">Your Collection</h1>
          {cards.length > 0 && (
            <Button
              size="sm"
              variant={showAnalytics ? "default" : "outline"}
              onClick={() => {
                if (!isPro && !showAnalytics) {
                  setShowUpgrade(true);
                  return;
                }
                setShowAnalytics(!showAnalytics);
              }}
              className={`${showAnalytics ? "gradient-primary" : ""} shrink-0`}
            >
              <BarChart3 className="sm:mr-2 w-4 h-4" />
              <span className="hidden sm:inline">{showAnalytics ? "Hide Analytics" : "View Analytics"}</span>
              <span className="sm:hidden ml-1.5">{showAnalytics ? "Hide" : "Analytics"}</span>
              {!isPro && <Crown className="ml-1 w-3 h-3 text-primary" />}
            </Button>
          )}
        </div>

        {loading ? (
          <PortfolioHero cards={[]} loading />
        ) : (
          <>
            {loadError && (
              <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {loadError}
              </div>
            )}

            <div className="mb-8 sm:mb-10">
              <PortfolioHero cards={cards} />
            </div>


            {cards.length > 0 && <AchievementsRow cards={cards} />}

            {/* Portfolio Analytics Section */}
            {showAnalytics && cards.length > 0 && (
              <div className="mb-10">
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <PortfolioAnalytics cards={cards} />
                </Suspense>
              </div>
            )}

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-4 mb-10">
              <Link to="/scan" className="contents sm:block">
                <Button className="gradient-primary glow-purple hover-lift w-full sm:w-auto"><Camera className="mr-2 w-5 h-5" />Scan<span className="hidden sm:inline">&nbsp;New Card</span></Button>
              </Link>
              <Link to="/pack-rip" className="contents sm:block">
                <Button variant="outline" className="hover-lift w-full sm:w-auto"><Package className="mr-2 w-5 h-5" />Pack Rip<span className="hidden sm:inline">&nbsp;Mode</span></Button>
              </Link>
              <Link to="/collection" className="contents sm:block">
                <Button variant="outline" className="w-full sm:w-auto"><span className="sm:hidden">Collection</span><span className="hidden sm:inline">View Full Collection</span></Button>
              </Link>
              <Link to="/marketplace" className="contents sm:block">
                <Button variant="outline" className="hover-lift w-full sm:w-auto"><Wallet className="mr-2 w-5 h-5" />Marketplace</Button>
              </Link>
            </div>

            {stats.totalCards === 0 && (
              <div className="text-center py-16 bg-card border border-border rounded-2xl">
                <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-display font-semibold mb-2">No cards yet</h3>
                <p className="text-muted-foreground mb-6">Scan your first card to start building your collection!</p>
                <Link to="/scan"><Button className="gradient-primary">Scan Your First Card</Button></Link>
              </div>
            )}

            {/* Growth Features */}
            {user && (
              <>
                <Suspense fallback={null}>
                  <div className="grid sm:grid-cols-2 gap-6 mt-10">
                    <ReferralCard userId={user.id} />
                    <PublicCollectionToggle userId={user.id} />
                  </div>
                  <div className="mt-6">
                    <ConnectedAccounts />
                  </div>
                  <div className="mt-6">
                    <TransactionHistory />
                  </div>
                </Suspense>
                <div className="mt-6 border-t border-border pt-6">
                  <Link to="/delete-account">
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2">
                      <Trash2 className="w-4 h-4" />
                      Delete Account
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </>
        )}
      </main>

      <Footer />

      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} feature="Portfolio Analytics" />
    </div>
  );
};

export default Dashboard;
