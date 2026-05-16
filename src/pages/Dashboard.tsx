import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import collectaiLogo from "@/assets/collectai-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, LogOut, Wallet, TrendingUp, Layers, BarChart3, Crown, Shield, Trash2, Package } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import PortfolioAnalytics from "@/components/PortfolioAnalytics";
import PoweredByW3AI from "@/components/PoweredByW3AI";
import CreditBalance from "@/components/CreditBalance";
import UpgradeModal from "@/components/UpgradeModal";
import { useCredits } from "@/hooks/use-credits";
import { useAdmin } from "@/hooks/use-admin";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import ReferralCard from "@/components/ReferralCard";
import PublicCollectionToggle from "@/components/PublicCollectionToggle";
import ConnectedAccounts from "@/components/ConnectedAccounts";
import TransactionHistory from "@/components/TransactionHistory";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import AchievementsRow from "@/components/AchievementsRow";

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
    if (user) {
      supabase.from("cards")
        .select("id, card_name, card_set, rarity, estimated_value_low, estimated_value_high, created_at, special_features")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data) {
            setCards(data);
            const total = data.reduce((sum, c) => sum + ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2, 0);
            setStats({ totalCards: data.length, totalValue: total });
          }
          setLoading(false);
        });
    }
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <img src={collectaiLogo} alt="CollectAI Logo" className="w-10 h-10 rounded-lg" />
            <span className="text-2xl font-display font-bold text-gradient-primary">CollectAI</span>
          </Link>
          <div className="flex items-center gap-4">
            <CreditBalance credits={credits} isPro={isPro} loading={creditsLoading} />
            {isAdmin && (
              <Link to="/admin">
                <Button variant="outline" size="sm" className="gap-1">
                  <Shield className="w-4 h-4" /> Admin
                </Button>
              </Link>
            )}
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Log out"><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-display font-bold">Your Collection</h1>
          {cards.length > 0 && (
            <Button 
              variant={showAnalytics ? "default" : "outline"} 
              onClick={() => {
                if (!isPro && !showAnalytics) {
                  setShowUpgrade(true);
                  return;
                }
                setShowAnalytics(!showAnalytics);
              }}
              className={showAnalytics ? "gradient-primary" : ""}
            >
              <BarChart3 className="mr-2 w-4 h-4" />
              {showAnalytics ? "Hide Analytics" : "View Analytics"}
              {!isPro && <Crown className="ml-1 w-3 h-3 text-primary" />}
            </Button>
          )}
        </div>

        {loading ? (
          <>
            <div className="grid sm:grid-cols-3 gap-6 mb-10">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-6 flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-6 mb-10">
              {[
                { icon: Layers, label: "Total Cards", value: stats.totalCards, color: "text-primary" },
                { icon: Wallet, label: "Est. Value", value: `$${stats.totalValue.toFixed(0)}`, color: "text-secondary" },
                { icon: TrendingUp, label: "Avg Value", value: stats.totalCards > 0 ? `$${(stats.totalValue / stats.totalCards).toFixed(2)}` : "—", color: "text-accent" },
              ].map((s, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-6 flex items-center gap-4">
                  <s.icon className={`w-10 h-10 ${s.color}`} />
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-display font-bold">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {cards.length > 0 && <AchievementsRow cards={cards} />}

            {/* Portfolio Analytics Section */}
            {showAnalytics && cards.length > 0 && (
              <div className="mb-10">
                <PortfolioAnalytics cards={cards} />
              </div>
            )}

            <div className="flex flex-wrap gap-4 mb-10">
              <Link to="/scan">
                <Button className="gradient-primary glow-purple hover-lift"><Camera className="mr-2 w-5 h-5" />Scan New Card</Button>
              </Link>
              <Link to="/pack-rip">
                <Button variant="outline" className="hover-lift"><Package className="mr-2 w-5 h-5" />Pack Rip Mode</Button>
              </Link>
              <Link to="/collection">
                <Button variant="outline">View Full Collection</Button>
              </Link>
              <Link to="/marketplace">
                <Button variant="outline" className="hover-lift"><Wallet className="mr-2 w-5 h-5" />Marketplace</Button>
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
