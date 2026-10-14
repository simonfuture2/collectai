import { useEffect, useRef, useState } from "react";
import SEO from "@/components/SEO";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Camera, Sparkles, TrendingUp, Wallet, Crown, Check, Menu, ChevronDown, ScanLine, Search,
  DollarSign, Award, Microscope, LineChart, FolderOpen, Coins, Store,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Footer from "@/components/Footer";
import HeroBackground from "@/components/HeroBackground";
import ScanDemo, { type ScanDemoHandle } from "@/components/ScanDemo";
import BetaPromoBanner from "@/components/BetaPromoBanner";
import collectaiLogo from "@/assets/collectai-logo.png";
import charizardCard from "@/assets/scan-demo-charizard.jpeg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const } },
};
const staggerContainer = { hidden: {}, visible: { transition: { staggerChildren: 0.15 } } };
const inView = { initial: "hidden", whileInView: "visible", viewport: { once: true, margin: "-100px" } } as const;

const TCGS = ["Pokémon", "One Piece", "Magic: The Gathering", "Yu-Gi-Oh!", "Disney Lorcana", "Dragon Ball Super", "Digimon", "Flesh and Blood", "+ any TCG"];
const SPORTS = ["Baseball", "Basketball", "Football", "Hockey", "Soccer", "Racing", "UFC/MMA"];
const ALSO = ["Graded slabs (PSA · BGS · CGC · SGC · TAG)", "Sealed boxes & packs", "Japanese & international cards", "Other collectibles sold online"];

const FAQS = [
  { q: "Which cards can I scan?", a: "Every major trading card game, including Pokémon, One Piece, Magic: The Gathering, Yu-Gi-Oh! and Lorcana, plus baseball, basketball, football, hockey and soccer cards. Graded slabs and most collectibles that sell online work too." },
  { q: "Where do the prices come from?", a: "Recent sold listings from eBay, plus TCGplayer and PriceCharting market data. We show how many comps were used and how confident the estimate is." },
  { q: "Is the grade official?", a: "No. It's an SI pre-grade to help you decide whether to submit a card. Official grades come from PSA, BGS, CGC, SGC or TAG." },
  { q: "Do I need an account?", a: "Not to try it. The demo gives you 3 free scans a day. A free account saves your cards and gives you 3 full scans with graded values and trends." },
];

const azure = "hsl(200 90% 45%)";

const Landing = () => {
  const demoRef = useRef<ScanDemoHandle>(null);
  const demoWrapRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [pastHero, setPastHero] = useState(false);
  const [demoVisible, setDemoVisible] = useState(true);

  useEffect(() => {
    const hero = heroRef.current, demo = demoWrapRef.current;
    if (!hero || !demo) return;
    const o1 = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0));
    const o2 = new IntersectionObserver(([e]) => setDemoVisible(e.isIntersecting));
    o1.observe(hero); o2.observe(demo);
    return () => { o1.disconnect(); o2.disconnect(); };
  }, []);

  const tryScan = () => {
    demoWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    demoRef.current?.openPicker();
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="MyCollectAI – SI Card Scanner for Pokémon, One Piece, Sports Cards & More"
        description="Scan any trading card – Pokémon, One Piece, Magic, Yu-Gi-Oh!, Lorcana or sports – and get the card, condition and value from real sold comps in seconds. Try it free."
        path="/"
        jsonLd={[
          { "@context": "https://schema.org", "@type": "WebSite", name: "MyCollectAI", url: "https://mycollectai.com/" },
          {
            "@context": "https://schema.org", "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]}
      />
      <BetaPromoBanner />

      <header className="container mx-auto px-4 py-6 flex justify-between items-center relative z-10">
        <Link to="/" className="flex items-center gap-2">
          <img src={collectaiLogo} alt="MyCollectAI Logo" width={40} height={40} className="w-10 h-10 rounded-lg" />
          <span className="text-2xl font-display font-bold text-gradient-primary">MyCollectAI</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="hidden sm:inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none">
              Resources <ChevronDown className="w-3.5 h-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Learn</DropdownMenuLabel>
              <DropdownMenuItem asChild><Link to="/grading">Grading Guides</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/how-it-works">How It Works</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/faq">FAQ</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/verify">Verify a certificate</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link to="/partners" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden lg:inline">Partners</Link>
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">Pricing</Link>
          <Link to="/marketplace" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden lg:inline">Marketplace</Link>
          <ThemeToggle />
          <Link to="/auth" className="hidden sm:inline-flex">
            <Button variant="outline" className="border-primary/50 hover:bg-primary/10">Sign In</Button>
          </Link>
          <Link to="/auth?mode=signup" className="hidden sm:inline-flex">
            <Button className="gradient-primary">Sign up free</Button>
          </Link>
          <Sheet>
            <SheetTrigger asChild className="sm:hidden">
              <Button variant="ghost" size="icon" aria-label="Open menu"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetTitle className="text-lg font-display font-bold text-gradient-primary">Menu</SheetTitle>
              <nav className="flex flex-col gap-4 mt-6">
                <Link to="/auth?mode=signup"><Button className="w-full gradient-primary">Sign up free</Button></Link>
                <Link to="/grading" className="text-base text-foreground hover:text-primary transition-colors">Grading Guides</Link>
                <Link to="/how-it-works" className="text-base text-foreground hover:text-primary transition-colors">How It Works</Link>
                <Link to="/verify" className="text-base text-foreground hover:text-primary transition-colors">Verify a certificate</Link>
                <Link to="/partners" className="text-base text-foreground hover:text-primary transition-colors">Partners</Link>
                <Link to="/faq" className="text-base text-foreground hover:text-primary transition-colors">FAQ</Link>
                <Link to="/pricing" className="text-base text-foreground hover:text-primary transition-colors">Pricing</Link>
                <Link to="/marketplace" className="text-base text-foreground hover:text-primary transition-colors">Marketplace</Link>
                <Link to="/auth"><Button variant="outline" className="w-full">Sign In</Button></Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 relative">
        {/* Hero */}
        <div className="relative" ref={heroRef}>
          <HeroBackground />
          <motion.div initial="hidden" animate="visible" variants={staggerContainer}
            className="relative z-10 py-8 grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            <motion.div variants={fadeUp} className="text-center md:text-left">
              <p className="text-xs sm:text-sm font-medium tracking-wide text-muted-foreground mb-4">
                Pokémon · One Piece · Magic · Yu-Gi-Oh! · Sports · and more
              </p>
              <h1 className="text-4xl md:text-6xl font-display font-bold mb-4 leading-tight">
                Snap any card. <span className="text-gradient-primary">Know what it's worth.</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto md:mx-0">
                MyCollectAI identifies every major TCG, sports cards and graded slabs, then prices them from real sold listings – raw and graded – in seconds.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <Button size="lg" onClick={tryScan} className="gradient-primary text-lg px-8 py-7 rounded-xl glow-purple hover-lift">
                  <Camera className="mr-2 w-6 h-6" /> Try a free scan
                </Button>
                <Link to="/auth?mode=signup">
                  <Button size="lg" variant="outline" className="w-full text-lg px-8 py-7 rounded-xl border-primary/50">
                    Create free account
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">No sign-up needed to try · 3 free demo scans a day</p>
            </motion.div>
            <motion.div variants={fadeUp} className="flex justify-center w-full" ref={demoWrapRef}>
              <ScanDemo ref={demoRef} />
            </motion.div>
          </motion.div>
        </div>

        {/* Categories */}
        <motion.section {...inView} variants={fadeUp} className="mt-20 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-display font-bold text-center mb-10">
            Every TCG. <span className="text-gradient-primary">Every sport.</span>
          </h2>
          <ChipRow label="Trading card games">
            {TCGS.map((t) => (
              <span key={t} className="shrink-0 relative rounded-full border-2 border-primary/60 bg-card px-5 py-2.5 text-base font-display font-semibold text-collectai-purple">
                {t}
                {t === "One Piece" && (
                  <span className="ml-2 rounded-full gradient-primary text-primary-foreground text-[10px] px-2 py-0.5 align-middle">New</span>
                )}
              </span>
            ))}
          </ChipRow>
          <ChipRow label="Sports cards">
            {SPORTS.map((t) => (
              <span key={t} className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium">{t}</span>
            ))}
          </ChipRow>
          <ChipRow label="Also scans">
            {ALSO.map((t) => (
              <span key={t} className="shrink-0 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">{t}</span>
            ))}
          </ChipRow>
          <div className="mt-4 flex justify-center">
            <span className="rounded-full border border-secondary/40 bg-secondary/10 px-4 py-2 text-sm font-semibold text-secondary">Sealed packs &amp; boxes → see the top chase cards</span>
          </div>
          <p className="text-center text-muted-foreground mt-6">If it sells on eBay or TCGplayer, we can price it.</p>
        </motion.section>

        {/* How it works */}
        <motion.section {...inView} variants={staggerContainer} className="mt-24 max-w-5xl mx-auto">
          <motion.h2 variants={fadeUp} className="text-3xl md:text-5xl font-display font-bold text-center mb-10">
            How it <span className="text-gradient-primary">works</span>
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: ScanLine, t: "Snap the front (and back)", d: "Raw card or slab. Phone photo is fine." },
              { icon: Search, t: "SI identifies the exact card", d: "Set, number, year, parallel and variant – not just the name." },
              { icon: DollarSign, t: "Get the real price", d: "Priced from recent sold listings, with a raw value and graded values for PSA 9 and PSA 10." },
            ].map((s, i) => (
              <motion.div key={s.t} variants={fadeUp} className="p-6 rounded-2xl bg-card border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-9 h-9 rounded-full gradient-primary text-primary-foreground font-display font-bold flex items-center justify-center">{i + 1}</span>
                  <s.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-display font-semibold mb-1">{s.t}</h3>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* What you get */}
        <motion.section {...inView} variants={fadeUp} className="mt-24 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-display font-bold text-center mb-10">
            What you get from <span className="text-gradient-primary">every scan</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="mx-auto w-full max-w-xs aspect-[3/4] rounded-2xl overflow-hidden border-2 border-border shadow-xl">
              <img src={charizardCard} alt="Example scan result of a Charizard card" loading="lazy" className="w-full h-full object-cover" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: TrendingUp, t: "Value from sold comps", d: "A price range with a confidence score, based on what the card actually sold for." },
                { icon: Award, t: "Should you grade it?", d: "See what it's worth graded and whether grading fees pay off." },
                { icon: Microscope, t: "Condition check", d: "SI pre-grade with centering, corners, edges and surface, and the flaws that limit the grade." },
                { icon: LineChart, t: "Price trend", d: "30- and 90-day movement so you know when to sell or hold." },
              ].map((f) => (
                <div key={f.t} className="p-5 rounded-2xl bg-card border border-border">
                  <f.icon className="w-6 h-6 text-primary mb-2" />
                  <h3 className="font-display font-semibold mb-1">{f.t}</h3>
                  <p className="text-sm text-muted-foreground">{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Card Show Mode */}
        <motion.section {...inView} variants={fadeUp}
          className="mt-24 max-w-4xl mx-auto rounded-3xl border-2 p-8 md:p-12 text-center bg-card"
          style={{ borderColor: `hsl(200 90% 45% / 0.5)` }}>
          <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold mb-4 text-primary-foreground" style={{ background: azure }}>
            Card Show Mode
          </span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">At a show? Price-check before you buy.</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            Scan a card on the dealer's table, enter the asking price, and see instantly if it's a deal. Nothing gets added to your collection unless you want it.
          </p>
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Example</p>
            <div className="inline-flex flex-wrap justify-center gap-2 text-sm">
              <span className="rounded-full border border-border bg-background px-3 py-1.5">Asking $120</span>
              <span className="rounded-full border border-border bg-background px-3 py-1.5">Market $135–$160</span>
              <span className="rounded-full px-3 py-1.5 font-semibold bg-collectai-green/15 text-collectai-green border border-collectai-green/30">18% below market</span>
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-4 mb-2">Example</p>
            <span className="inline-block rounded-full border border-border bg-background px-3 py-1.5 text-sm">Scanned: One Piece booster box · Top chase shown</span>
          </div>
          <Link to={`/auth?mode=signup&next=${encodeURIComponent("/scan?mode=insight")}`}>
            <Button size="lg" className="rounded-xl text-primary-foreground hover:opacity-90" style={{ background: azure }}>
              Try Card Show Mode
            </Button>
          </Link>
        </motion.section>

        {/* Track collection */}
        <motion.section {...inView} variants={staggerContainer} className="mt-24 max-w-5xl mx-auto">
          <motion.h2 variants={fadeUp} className="text-3xl md:text-5xl font-display font-bold text-center mb-10">
            Track your <span className="text-gradient-primary">whole collection</span>
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Wallet, t: "Portfolio value", d: "Your total collection value, updated as the market moves. Real sold prices from eBay, TCGplayer and PriceCharting." },
              { icon: FolderOpen, t: "Folders & showcase", d: "Organize binders and share a public showcase link." },
              { icon: Coins, t: "Sell with stablecoins", d: "List cards on the marketplace and get paid in USDC." },
            ].map((f) => (
              <motion.div key={f.t} variants={fadeUp} className="p-6 rounded-2xl bg-card border border-border hover-lift">
                <f.icon className="w-8 h-8 text-primary mb-3" />
                <h3 className="text-lg font-display font-semibold mb-1">{f.t}</h3>
                <p className="text-sm text-muted-foreground">{f.d}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* FAQ */}
        <motion.section {...inView} variants={fadeUp} className="mt-24 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-8">Questions</h2>
          <Accordion type="single" collapsible className="rounded-2xl bg-card border border-border px-6">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`f${i}`} className={i === FAQS.length - 1 ? "border-b-0" : ""}>
                <AccordionTrigger className="text-left font-display">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.section>

        {/* Pricing */}
        <motion.div {...inView} variants={staggerContainer} className="mt-24 text-center">
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
                {["3 full SI scans", "Card ID, condition and value", "Collection tracking"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" />{f}</li>
                ))}
              </ul>
              <Link to="/auth?mode=signup"><Button variant="outline" className="w-full">Start Free</Button></Link>
            </motion.div>
            <motion.div variants={fadeUp} className="p-8 rounded-2xl bg-card border-2 border-primary text-left relative">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">BEST VALUE</div>
              <h3 className="text-xl font-display font-bold mb-2 flex items-center gap-2"><Crown className="w-5 h-5 text-primary" /> Pro</h3>
              <p className="text-3xl font-display font-bold mb-4">$14.99<span className="text-base font-normal text-muted-foreground">/mo</span></p>
              <ul className="space-y-2 mb-6 text-sm">
                {["Unlimited SI Scans", "Portfolio Analytics", "AuthentiSeal Certificates", "Pre-Grading Analysis"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" />{f}</li>
                ))}
              </ul>
              <Link to="/auth"><Button className="w-full gradient-primary"><Sparkles className="mr-2 w-4 h-4" /> Go Pro</Button></Link>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Final CTA */}
        <motion.section {...inView} variants={fadeUp} className="mt-24 max-w-4xl mx-auto rounded-3xl gradient-primary p-10 md:p-14 text-center">
          <h2 className="text-3xl md:text-5xl font-display font-bold text-primary-foreground mb-6">What's in your binder worth?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" onClick={tryScan} className="bg-background text-foreground hover:bg-background/90 rounded-xl px-8 py-6 text-lg">
              <Camera className="mr-2 w-5 h-5" /> Try a free scan
            </Button>
            <Link to="/auth?mode=signup" className="text-primary-foreground underline underline-offset-4 font-medium">Create free account</Link>
          </div>
        </motion.section>

        {/* SI disclosure (compact) */}
        <div className="mt-12 max-w-2xl mx-auto text-center text-xs text-muted-foreground px-4">
          <strong className="text-foreground">About SI estimates:</strong> MyCollectAI uses super intelligence to provide estimated card grades and valuations. These are <strong className="text-foreground">not professional appraisals, certified grades, or financial advice</strong>. SI features are continuously improving and currently in beta. For high-value cards, we recommend professional grading services.
        </div>
      </main>

      <Footer />

      {/* Mobile sticky CTA */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 p-3 bg-background/90 backdrop-blur border-t border-border transition-transform duration-300 ${
          pastHero && !demoVisible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        aria-hidden={!(pastHero && !demoVisible)}
      >
        <Button onClick={tryScan} className="w-full gradient-primary py-6 text-base rounded-xl">
          <Camera className="mr-2 w-5 h-5" /> Try a free scan
        </Button>
      </div>
    </div>
  );
};

const ChipRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-6">
    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 text-center md:text-left">{label}</p>
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible scrollbar-none">
      {children}
    </div>
  </div>
);

export default Landing;
