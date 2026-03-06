import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Camera, Sparkles, TrendingUp, Wallet, Crown, Check, Shield, Menu } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import Footer from "@/components/Footer";
import HeroBackground from "@/components/HeroBackground";
import ScanDemo from "@/components/ScanDemo";
import QuickScanChallenge from "@/components/QuickScanChallenge";
import AuthentiSealVerify from "@/components/AuthentiSealVerify";
import LeadMagnet from "@/components/LeadMagnet";
import collectaiLogo from "@/assets/collectai-logo.png";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

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
          <Link to="/faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">FAQ</Link>
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">Pricing</Link>
          <ThemeToggle />
          <Link to="/auth" className="hidden sm:inline-flex">
            <Button variant="outline" className="border-primary/50 hover:bg-primary/10">Sign In</Button>
          </Link>
          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild className="sm:hidden">
              <Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetTitle className="text-lg font-display font-bold text-gradient-primary">Menu</SheetTitle>
              <nav className="flex flex-col gap-4 mt-6">
                <Link to="/how-it-works" className="text-base text-foreground hover:text-primary transition-colors">How It Works</Link>
                <Link to="/partners" className="text-base text-foreground hover:text-primary transition-colors">Partners</Link>
                <Link to="/faq" className="text-base text-foreground hover:text-primary transition-colors">FAQ</Link>
                <Link to="/pricing" className="text-base text-foreground hover:text-primary transition-colors">Pricing</Link>
                <Link to="/auth">
                  <Button className="w-full gradient-primary">Sign In</Button>
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 relative">
        {/* Hero — Action First */}
        <div className="relative">
          <HeroBackground />
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="relative z-10 py-8 grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto"
          >
            {/* Left: Copy + CTA */}
            <motion.div variants={fadeUp} className="text-center md:text-left">
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
            </motion.div>

            {/* Right: Scan Demo */}
            <motion.div variants={fadeUp} className="flex justify-center">
              <ScanDemo />
            </motion.div>
          </motion.div>
        </div>

        {/* Quick Scan Challenge — Lead Gen */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp}>
          <QuickScanChallenge />
        </motion.div>

        {/* Features */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="grid md:grid-cols-3 gap-8 mt-24"
        >
          {[
            { icon: Camera, title: "Instant ID", desc: "Snap a photo and get card name, set, year, and rarity in seconds", color: "text-primary" },
            { icon: TrendingUp, title: "Live Pricing", desc: "Real-time values from eBay, TCGPlayer, and PSA population data", color: "text-secondary" },
            { icon: Wallet, title: "Track Value", desc: "Build your collection and watch your total portfolio grow", color: "text-accent" },
          ].map((f, i) => (
            <motion.div key={i} variants={fadeUp} className="p-8 rounded-2xl bg-card border border-border hover-lift">
              <f.icon className={`w-12 h-12 ${f.color} mb-4`} />
              <h3 className="text-xl font-display font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Lead Magnet */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp}>
          <LeadMagnet />
        </motion.div>

        {/* Verify Certificate — Utility Section */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeUp}
          className="mt-24 max-w-2xl mx-auto text-center"
        >
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
        </motion.div>

        {/* AI Disclosure — Google Play Compliance */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeUp}
          className="mt-16 max-w-2xl mx-auto text-center p-6 rounded-2xl bg-card border border-border"
        >
          <h3 className="text-sm font-display font-semibold text-muted-foreground uppercase tracking-wider mb-2">About AI Estimates</h3>
          <p className="text-sm text-muted-foreground">
            CollectAI uses artificial intelligence to provide estimated card grades and valuations. These are <strong className="text-foreground">not professional appraisals, certified grades, or financial advice</strong>. AI features are continuously improving and currently in beta. For high-value cards, we recommend professional grading services.
          </p>
        </motion.div>

        {/* Pricing Section */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="mt-24 text-center"
        >
          <motion.h2 variants={fadeUp} className="text-3xl md:text-5xl font-display font-bold mb-4">
            Simple <span className="text-gradient-primary">Pricing</span>
          </motion.h2>
          <motion.p variants={fadeUp} className="text-muted-foreground mb-10 max-w-lg mx-auto">
            Start free with 3 scans. Go Pro for unlimited access to everything.
          </motion.p>

          <motion.div variants={staggerContainer} className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <motion.div variants={fadeUp} className="p-8 rounded-2xl bg-card border border-border text-left">
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
            </motion.div>

            <motion.div variants={fadeUp} className="p-8 rounded-2xl bg-card border-2 border-primary text-left relative">
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
            </motion.div>
          </motion.div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default Landing;
