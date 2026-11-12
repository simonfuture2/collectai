import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, PlayCircle, Lock, ArrowRight, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import collectaiLogo from "@/assets/collectai-logo.png";
import { trackAgentEvent } from "@/lib/agentRef";
import { GRADING_WEBINAR } from "@/lib/webinar";

const POINTS = [
  "How graders look at centering, corners, edges and surface",
  "Which cards are worth sending in, and which aren't",
  "How to check a card yourself before you pay a grading fee",
  "How to use a photo scan to get a likely grade in seconds",
];

const isUnlocked = () => { try { return localStorage.getItem(GRADING_WEBINAR.unlockKey) === "1"; } catch { return false; } };

export default function GradingWebinar() {
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const marks = useRef({ play: false, half: false });

  useEffect(() => { void trackAgentEvent("webinar_view"); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (!consent) { toast.error("Tick the box so we can email you the replay."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("lead-magnet", {
        body: { email: email.trim(), firstName: firstName.trim(), guide: "webinar_grading", consent: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      try { localStorage.setItem(GRADING_WEBINAR.unlockKey, "1"); } catch { /* private mode */ }
      void trackAgentEvent("webinar_signup");
      setUnlocked(true);
      toast.success("You're in! We also emailed you the replay link.");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  const onTime = (v: HTMLVideoElement) => {
    if (!marks.current.half && v.duration && v.currentTime / v.duration >= 0.5) { marks.current.half = true; void trackAgentEvent("webinar_half"); }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Free Card Grading Webinar – MyCollectAI"
        description="Watch our free card grading webinar: what graders look for, which cards are worth grading, and how to check a card yourself first."
        path="/webinar/grading"
      />
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2">
          <img src={collectaiLogo} alt="MyCollectAI Logo" className="w-10 h-10 rounded-lg" />
          <span className="text-2xl font-display font-bold text-gradient-primary">MyCollectAI</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="container mx-auto px-4 pb-16 grid lg:grid-cols-2 gap-10 items-start max-w-6xl">
        <section className="space-y-6 lg:pt-6">
          <span className="inline-block text-xs font-semibold uppercase tracking-wider text-primary">Free webinar</span>
          <h1 className="text-4xl md:text-5xl font-display font-bold leading-tight">Should you grade that card? Learn it in one session.</h1>
          <p className="text-lg text-muted-foreground">A plain-English walkthrough of how card grading works and how to decide before you spend money on it.</p>
          <ul className="space-y-3">
            {POINTS.map(p => (
              <li key={p} className="flex gap-3"><Check className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span>{p}</span></li>
            ))}
          </ul>

          {!unlocked && (
            <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold text-lg">Watch it now, free</h2>
              <Input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={60} />
              <Input type="email" required placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} maxLength={255} />
              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} className="mt-0.5" />
                <span>Email me the replay and occasional collecting tips. Unsubscribe any time.</span>
              </label>
              <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground">
                {loading ? "Unlocking…" : "Unlock the webinar"} <PlayCircle className="w-4 h-4 ml-2" />
              </Button>
            </form>
          )}
        </section>

        <section className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden border border-border bg-muted aspect-[9/16] w-full max-w-sm mx-auto">
            {unlocked && GRADING_WEBINAR.url ? (
              <video
                src={GRADING_WEBINAR.url}
                poster={GRADING_WEBINAR.poster ?? undefined}
                controls playsInline preload="metadata"
                className="w-full h-full object-contain bg-foreground"
                onPlay={() => { if (!marks.current.play) { marks.current.play = true; void trackAgentEvent("webinar_play"); } }}
                onTimeUpdate={e => onTime(e.currentTarget)}
                onEnded={() => void trackAgentEvent("webinar_complete")}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
                {GRADING_WEBINAR.poster && <img src={GRADING_WEBINAR.poster} alt="" className="absolute inset-0 w-full h-full object-cover blur-md opacity-60" />}
                <div className="relative flex flex-col items-center gap-2">
                  {unlocked ? <PlayCircle className="w-12 h-12 text-primary" /> : <Lock className="w-12 h-12 text-primary" />}
                  <p className="font-medium">{unlocked ? "The webinar is being uploaded. We'll email you the moment it's ready." : "Enter your email to start watching"}</p>
                </div>
              </div>
            )}
          </div>

          {unlocked && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Link to="/scan?ref=webinar" onClick={() => void trackAgentEvent("webinar_scan_click")}>
                <Button className="w-full gradient-primary text-primary-foreground">Scan your first card free <ArrowRight className="w-4 h-4 ml-2" /></Button>
              </Link>
              <Link to="/free-guide?guide=grading">
                <Button variant="outline" className="w-full"><BookOpen className="w-4 h-4 mr-2" /> Get the grading cheat sheet</Button>
              </Link>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
