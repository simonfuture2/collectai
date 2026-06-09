import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Check, Mail, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const cheatSheetTopics = [
  "PSA & BGS grade scale (1–10) explained",
  "4 condition factors: Centering, Edges, Corners, Surface",
  "Photo tips for accurate self-grading",
  "Value ranges by condition tier",
  "When to send for professional grading",
];

const LeadMagnet = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

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
    <div className="mt-24 max-w-4xl mx-auto">
      <div className="rounded-2xl border border-primary/30 bg-card overflow-hidden">
        <div className="grid md:grid-cols-2 gap-0">
          {/* Left: Preview */}
          <div className="p-8 md:p-10 bg-primary/5 border-b md:border-b-0 md:border-r border-primary/20">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">FREE GUIDE</span>
            </div>
            <h3 className="text-2xl md:text-3xl font-display font-bold mb-2">
              The Collector's Card Grading{" "}
              <span className="text-gradient-primary">Cheat Sheet</span>
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              Everything you need to grade cards like a pro — in one page.
            </p>
            <ul className="space-y-2.5">
              {cheatSheetTopics.map((topic) => (
                <li key={topic} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-foreground">{topic}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Email Capture */}
          <div className="p-8 md:p-10 flex flex-col justify-center">
            {sent ? (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-7 h-7 text-primary" />
                </div>
                <h4 className="text-xl font-display font-bold mb-2">Check Your Inbox!</h4>
                <p className="text-sm text-muted-foreground">
                  We've sent the Grading Cheat Sheet to your email. If you don't see it, check your spam folder.
                </p>
              </div>
            ) : (
              <>
                <h4 className="text-xl font-display font-bold mb-2">
                  Get it free — instantly
                </h4>
                <p className="text-sm text-muted-foreground mb-6">
                  Enter your email and we'll send the cheat sheet straight to your inbox. No spam, ever.
                </p>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12"
                  />
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full gradient-primary h-12 text-base"
                  >
                    {loading ? (
                      "Sending..."
                    ) : (
                      <>
                        <Sparkles className="mr-2 w-4 h-4" />
                        Send Me the Cheat Sheet
                      </>
                    )}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  By submitting, you agree to receive this guide and occasional updates from MyCollectAI.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadMagnet;
