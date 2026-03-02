import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Camera, Sparkles, TrendingUp, Wallet, Crown, Check, Shield } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Footer from "@/components/Footer";
import HeroBackground from "@/components/HeroBackground";
import ScanDemo from "@/components/ScanDemo";
import QuickScanChallenge from "@/components/QuickScanChallenge";
import AuthentiSealVerify from "@/components/AuthentiSealVerify";
import LeadMagnet from "@/components/LeadMagnet";
import collectaiLogo from "@/assets/collectai-logo.png";

const Landing = () => {
  useEffect(() => { document.title = "CollectAI – AI Card Grading & Value Scanner"; }, []);
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center relative z-10">
        <Link to="/" className="flex items-center gap-2">
          <img src={collectaiLogo} alt="CollectAI Logo" className="w-10 h-10 rounded-lg" />
          <span className="text-2xl font-display font-bold text-gradient-primary">CollectAI</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link to="/how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">How It Works</Link>
          <Link to="/partners" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">Partners</Link>
          <ThemeToggle />
          <Link to="/auth">
            <Button variant="outline" className="border-primary/50 hover:bg-primary/10">Sign In</Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 relative">
        {/* Hero — Action First */}
        <div className="relative">
          <HeroBackground />
          <div className="relative z-10 py-8 grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            {/* Left: Copy + CTA */}
            <div className="text-center md:text-left">
              <h1 className="text-5xl md:text-7xl font-display font-bold mb-4 leading-tight">
                <span className="text-gradient-primary">Scan.</span>{" "}
                <span className="text-gradient-primary">Grade.</span>{" "}
                <span className="text-gradient-primary">Value.</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-md">
                Snap a photo of any trading card — get AI identification, condition grade, and market value in seconds.
              </p>

              <Link to="/auth">
                <Button size="lg" className="gradient-primary text-lg px-10 py-7 rounded-xl glow-purple hover-lift">
                  <Camera className="mr-2 w-6 h-6" />
                  Scan Your Card Now
                </Button>
              </Link>

              {/* Social proof directly under CTA */}
              <div className="flex flex-wrap gap-6 mt-8 justify-center md:justify-start">
                {[
                  { value: "50K+", label: "Cards Scanned" },
                  { value: "10K+", label: "Collectors" },
                  { value: "98%", label: "Accuracy" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <p className="text-2xl font-display font-bold text-gradient-primary">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Scan Demo */}
            <div className="flex justify-center">
              <ScanDemo />
            </div>
          </div>
        </div>

        {/* Quick Scan Challenge — Lead Gen */}
        <QuickScanChallenge />

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

        {/* Lead Magnet */}
        <LeadMagnet />

        {/* Verify Certificate — Utility Section */}
        <div className="mt-24 max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-collectai-green/10 border border-collectai-green/30 mb-6">
            <Shield className="w-4 h-4 text-collectai-green" />
            <span className="text-sm text-collectai-green font-medium">On-Chain Verification</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-3">
            Verify Any <span className="text-gradient-primary">Certificate</span>
          </h2>
          <p className="text-muted-foreground mb-8">
            Look up any AuthentiSeal certificate instantly. Blockchain-backed proof of authenticity.
          </p>
          <AuthentiSealVerify verifyOnly className="text-left" />
        </div>

        {/* AI Disclosure — Google Play Compliance */}
        <div className="mt-16 max-w-2xl mx-auto text-center p-6 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-display font-semibold text-muted-foreground uppercase tracking-wider mb-2">About AI Estimates</h3>
          <p className="text-sm text-muted-foreground">
            CollectAI uses artificial intelligence to provide estimated card grades and valuations. These are <strong className="text-foreground">not professional appraisals, certified grades, or financial advice</strong>. AI features are continuously improving and currently in beta. For high-value cards, we recommend professional grading services.
          </p>
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
