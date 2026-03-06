import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Check, Mail, Sparkles, Camera, Star, Users, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ThemeToggle from "@/components/ThemeToggle";
import HeroBackground from "@/components/HeroBackground";
import Footer from "@/components/Footer";
import collectaiLogo from "@/assets/collectai-logo.png";

const cheatSheetTopics = [
  "PSA & BGS grade scale (1–10) explained",
  "4 condition factors: Centering, Edges, Corners, Surface",
  "Photo tips for accurate self-grading",
  "Value ranges by condition tier",
  "When to send for professional grading",
];

const testimonials = [
  { name: "Jake M.", text: "This cheat sheet saved me from sending a card that wasn't worth grading. Saved $50+!", stars: 5 },
  { name: "Sarah L.", text: "Finally understand what PSA grades actually mean. Super clear and easy to follow.", stars: 5 },
  { name: "Marcus T.", text: "I use this every time I pull a card from a pack. Essential for any collector.", stars: 5 },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const FreeGuide = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = "Free Card Grading Cheat Sheet – CollectAI";
    // Default to light theme if no preference stored
    if (!localStorage.getItem("theme")) {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("lead-magnet", {
        body: { email: email.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSent(true);
      toast.success("Check your inbox! The cheat sheet is on its way.");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal Header */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2">
          <img src={collectaiLogo} alt="CollectAI Logo" className="w-10 h-10 rounded-lg" />
          <span className="text-2xl font-display font-bold text-gradient-primary">CollectAI</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">Pricing</Link>
          <Link to="/how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">How It Works</Link>
          <ThemeToggle />
          <Link to="/auth" className="hidden sm:inline-flex">
            <Button variant="outline" className="border-primary/50 hover:bg-primary/10">Sign In</Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 pb-16 relative">
        {/* Hero Section */}
        <div className="relative">
          <HeroBackground />
          <motion.section
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="relative z-10 max-w-5xl mx-auto pt-8 pb-16"
          >
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <motion.div variants={fadeUp}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                <BookOpen className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">FREE DOWNLOAD</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold mb-4 leading-tight">
                Grade Cards Like a{" "}
                <span className="text-gradient-primary">Pro</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-6 max-w-lg">
                Get the one-page cheat sheet that 10,000+ collectors use to accurately grade their cards before sending them for professional evaluation.
              </p>

              <div className="flex items-center gap-4 mb-8">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-primary" />
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">10,000+</strong> collectors already downloaded
                </p>
              </div>
            </motion.div>

            {/* Right: Email Capture Card */}
            <motion.div variants={fadeUp}>
              <div className="rounded-2xl border-2 border-primary/30 bg-card p-8 md:p-10 shadow-lg">
                {sent ? (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                      <Mail className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-display font-bold mb-3">Check Your Inbox!</h2>
                    <p className="text-muted-foreground mb-6">
                      We've sent the Grading Cheat Sheet to your email. If you don't see it, check your spam folder.
                    </p>
                    <Link to="/auth">
                      <Button className="gradient-primary">
                        <Camera className="mr-2 w-4 h-4" />
                        Try CollectAI Free
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl font-display font-bold mb-2">
                      Get Your Free Cheat Sheet
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                      Instant delivery to your inbox. No spam, unsubscribe anytime.
                    </p>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="h-14 text-base"
                      />
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full gradient-primary h-14 text-lg"
                      >
                        {loading ? (
                          "Sending..."
                        ) : (
                          <>
                            <Sparkles className="mr-2 w-5 h-5" />
                            Send Me the Cheat Sheet
                          </>
                        )}
                      </Button>
                    </form>
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                      By submitting, you agree to receive this guide and occasional updates from CollectAI.
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* What's Inside */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-4xl mx-auto py-16"
        >
          <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-display font-bold text-center mb-10">
            What's Inside the{" "}
            <span className="text-gradient-primary">Cheat Sheet</span>
          </motion.h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {cheatSheetTopics.map((topic, i) => (
              <motion.div
                key={topic}
                variants={fadeUp}
                className="flex items-start gap-3 p-5 rounded-xl bg-card border border-border"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                <span className="text-foreground font-medium">{topic}</span>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Testimonials */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-4xl mx-auto py-16"
        >
          <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-display font-bold text-center mb-10">
            Collectors <span className="text-gradient-primary">Love It</span>
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <motion.div
                key={t.name}
                variants={fadeUp}
                className="p-6 rounded-2xl bg-card border border-border"
              >
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mb-4">"{t.text}"</p>
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Bottom CTA */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          className="max-w-2xl mx-auto py-16 text-center"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Ready to Know Your Cards' <span className="text-gradient-primary">True Value</span>?
          </h2>
          <p className="text-muted-foreground mb-8">
            CollectAI instantly identifies, grades, and prices any trading card with AI.
          </p>
          <Link to="/auth">
            <Button size="lg" className="gradient-primary text-lg px-10 py-7 rounded-xl glow-purple hover-lift">
              <Camera className="mr-2 w-6 h-6" />
              Try CollectAI Free
            </Button>
          </Link>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
};

export default FreeGuide;
