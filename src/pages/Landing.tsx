import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Sparkles, TrendingUp, Wallet, Crown, Check, Loader2 } from "lucide-react";
import PoweredByW3AI from "@/components/PoweredByW3AI";
import ThemeToggle from "@/components/ThemeToggle";
import EcosystemBadge from "@/components/EcosystemBadge";
import CollectAILink from "@/components/CollectAILink";
import Footer from "@/components/Footer";
import HeroBackground from "@/components/HeroBackground";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Landing = () => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    // Check if logo already exists
    const { data } = supabase.storage
      .from("generated-assets")
      .getPublicUrl("collectai-logo.png");
    
    const img = new Image();
    img.onload = () => setLogoUrl(data.publicUrl);
    img.onerror = () => setLogoUrl(null);
    img.src = data.publicUrl;
  }, []);

  const generateAsset = async (type: "logo" | "hero") => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-assets", {
        body: { type },
      });
      if (error) throw error;
      if (data?.url) {
        if (type === "logo") {
          setLogoUrl(data.url + "?t=" + Date.now());
        }
        toast.success(`${type === "logo" ? "Logo" : "Hero image"} generated!`);
        if (type === "hero") window.location.reload();
      }
    } catch (e: any) {
      console.error(e);
      toast.error(`Failed to generate ${type}: ${e.message || "Unknown error"}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center relative z-10">
        {logoUrl ? (
          <Link to="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="CollectAI Logo" className="w-10 h-10 rounded-lg" />
            <span className="text-2xl font-display font-bold text-gradient-primary">CollectAI</span>
          </Link>
        ) : (
          <h1 className="text-2xl font-display font-bold text-gradient-primary">CollectAI</h1>
        )}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/auth">
            <Button variant="outline" className="border-primary/50 hover:bg-primary/10">Sign In</Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16 relative">
        {/* Hero with animated background */}
        <div className="relative">
          <HeroBackground />
          <div className="text-center max-w-4xl mx-auto relative z-10 py-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-8">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary">AI-Powered Card Analysis</span>
            </div>
            
            <h2 className="text-5xl md:text-7xl font-display font-bold mb-6">
              Know Your Cards'
              <span className="text-gradient-primary block">True Value</span>
            </h2>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Snap a photo of any trading card and instantly get AI-powered identification, 
              condition grading, and real-time market values.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/auth">
                <Button size="lg" className="gradient-primary text-lg px-8 py-6 rounded-xl glow-purple hover-lift">
                  <Camera className="mr-2 w-5 h-5" />
                  Start Scanning Free
                </Button>
              </Link>
            </div>

            {/* Admin: Generate assets buttons (only shown when no logo) */}
            {!logoUrl && (
              <div className="mt-8 flex gap-3 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateAsset("logo")}
                  disabled={generating}
                  className="text-xs"
                >
                  {generating ? <Loader2 className="mr-1 w-3 h-3 animate-spin" /> : <Sparkles className="mr-1 w-3 h-3" />}
                  Generate Logo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateAsset("hero")}
                  disabled={generating}
                  className="text-xs"
                >
                  {generating ? <Loader2 className="mr-1 w-3 h-3 animate-spin" /> : <Sparkles className="mr-1 w-3 h-3" />}
                  Generate Hero Image
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-24">
          {[
            { icon: Camera, title: "Instant ID", desc: "Snap a photo and get card name, set, year, and rarity in seconds", color: "text-primary" },
            { icon: TrendingUp, title: "Live Pricing", desc: "Real-time values from eBay, TCGPlayer, and PSA population data", color: "text-secondary" },
            { icon: Wallet, title: "Track Value", desc: "Build your collection and watch your total portfolio grow", color: "text-accent" },
          ].map((f, i) => (
            <div key={i} className="p-8 rounded-2xl bg-card border border-border hover-lift">
              <f.icon className={`w-12 h-12 ${f.color} mb-4`} />
              <h3 className="text-xl font-display font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Social Proof */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-center">
          {[
            { value: "50K+", label: "Cards Scanned" },
            { value: "10K+", label: "Collectors" },
            { value: "98%", label: "Accuracy Rate" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-display font-bold text-gradient-primary">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Pricing Section */}
        <div className="mt-24 text-center">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">
            Simple <span className="text-gradient-primary">Pricing</span>
          </h2>
          <p className="text-muted-foreground mb-10 max-w-lg mx-auto">
            Start free with 3 scans. Go Pro for unlimited access to everything.
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="p-8 rounded-2xl bg-card border border-border text-left">
              <h3 className="text-xl font-display font-bold mb-2">Free</h3>
              <p className="text-3xl font-display font-bold mb-4">$0</p>
              <ul className="space-y-2 mb-6 text-sm">
                {["3 Free AI Scans", "Basic Card ID", "Collection Management"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" />{f}</li>
                ))}
              </ul>
              <Link to="/auth">
                <Button variant="outline" className="w-full">Start Free</Button>
              </Link>
            </div>

            <div className="p-8 rounded-2xl bg-card border-2 border-primary text-left relative">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">
                BEST VALUE
              </div>
              <h3 className="text-xl font-display font-bold mb-2 flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" /> Pro
              </h3>
              <p className="text-3xl font-display font-bold mb-4">$14.99<span className="text-base font-normal text-muted-foreground">/mo</span></p>
              <ul className="space-y-2 mb-6 text-sm">
                {["Unlimited AI Scans", "Portfolio Analytics", "AuthentiSeal Certificates", "Pre-Grading Analysis"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" />{f}</li>
                ))}
              </ul>
              <Link to="/auth">
                <Button className="w-full gradient-primary">
                  <Sparkles className="mr-2 w-4 h-4" /> Go Pro
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Landing;
