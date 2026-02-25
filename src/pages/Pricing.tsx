import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Crown, Coins, Sparkles, Loader2, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { STRIPE_CONFIG } from "@/lib/stripe-config";
import { useCredits } from "@/hooks/use-credits";
import CreditBalance from "@/components/CreditBalance";
import { useToast } from "@/hooks/use-toast";

const Pricing = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const { credits, isPro, loading: creditsLoading } = useCredits();
  const { toast } = useToast();

  const handleCheckout = async (priceId: string, mode: string) => {
    setLoading(priceId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId, mode },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoading("portal");
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const proFeatures = [
    "Unlimited AI Card Scans",
    "Portfolio Analytics Dashboard",
    "AuthentiSeal Certificates",
    "Pre-Grading Analysis",
    "Priority Support",
    "No credit limits",
  ];

  const freeFeatures = [
    "3 Free Scans to Start",
    "Basic Card Identification",
    "Collection Management",
    "Market Value Estimates",
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <h1 className="text-xl font-display font-bold">Pricing</h1>
          </div>
          <CreditBalance credits={credits} isPro={isPro} loading={creditsLoading} />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-display font-bold mb-4">
            Choose Your <span className="text-gradient-primary">Plan</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Start free with 3 scans, buy credits as you go, or go Pro for unlimited access.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Free Tier */}
          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col">
            <h3 className="text-xl font-display font-bold mb-1">Free</h3>
            <p className="text-3xl font-display font-bold mb-1">$0</p>
            <p className="text-sm text-muted-foreground mb-6">Get started for free</p>
            <ul className="space-y-3 mb-8 flex-1">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/auth">
              <Button variant="outline" className="w-full">Sign Up Free</Button>
            </Link>
          </div>

          {/* Pro Tier */}
          <div className="rounded-2xl border-2 border-primary bg-card p-6 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">
              BEST VALUE
            </div>
            <h3 className="text-xl font-display font-bold mb-1 flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" /> Pro
            </h3>
            <p className="text-3xl font-display font-bold mb-1">$9.99<span className="text-base font-normal text-muted-foreground">/mo</span></p>
            <p className="text-sm text-muted-foreground mb-6">Unlimited everything</p>
            <ul className="space-y-3 mb-8 flex-1">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {isPro ? (
              <Button variant="outline" onClick={handleManageSubscription} disabled={loading === "portal"} className="w-full">
                {loading === "portal" ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Settings className="mr-2 w-4 h-4" />}
                Manage Subscription
              </Button>
            ) : (
              <Button
                onClick={() => handleCheckout(STRIPE_CONFIG.pro.price_id, "subscription")}
                disabled={loading !== null}
                className="w-full gradient-primary"
              >
                {loading === STRIPE_CONFIG.pro.price_id ? (
                  <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 w-4 h-4" />
                )}
                Subscribe to Pro
              </Button>
            )}
          </div>

          {/* Credit Packs */}
          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col">
            <h3 className="text-xl font-display font-bold mb-1 flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" /> Credits
            </h3>
            <p className="text-sm text-muted-foreground mb-6">Pay as you go</p>
            <div className="space-y-3 flex-1">
              {[STRIPE_CONFIG.credits_10, STRIPE_CONFIG.credits_50, STRIPE_CONFIG.credits_100].map((pack) => (
                <Button
                  key={pack.price_id}
                  variant="outline"
                  onClick={() => handleCheckout(pack.price_id, "payment")}
                  disabled={loading !== null}
                  className="w-full justify-between"
                >
                  <span>{pack.credits} Credits</span>
                  <span className="font-bold">
                    {loading === pack.price_id ? <Loader2 className="w-4 h-4 animate-spin" /> : `$${pack.price}`}
                  </span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">1 credit = 1 AI scan</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Pricing;
