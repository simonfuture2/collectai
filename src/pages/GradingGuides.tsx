import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";
import { GRADING_GUIDES } from "@/lib/gradingGuides";

const GradingGuides = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title="Grading Guides – PSA, BGS, CGC, SGC & TAG | MyCollectAI"
        description="Plain-English guides to the major trading card grading companies. Learn how each scale works and which service fits your cards."
        path="/grading"
      />

      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon" aria-label="Go back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-display font-bold flex-1">Grading Guides</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-5xl flex-1">
        <div className="max-w-2xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 mb-5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">Learn</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-4">
            <span className="text-gradient-primary">Grading Guides</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Every grading company uses a different scale, philosophy, and turnaround time — and the
            slab on your card can swing its value by hundreds of dollars. These plain-English guides
            break down how each major service works so you can submit smarter.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {GRADING_GUIDES.map((guide) => {
            const isLive = guide.status === "live";
            return (
              <Link
                key={guide.slug}
                to={`/grading/${guide.slug}`}
                className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
              >
                <GlassCard hover="lift" className="h-full flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-lg font-display font-bold text-foreground">
                      {guide.name}
                    </h3>
                    {guide.partnerBadge && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 whitespace-nowrap">
                        MyCollectAi × {guide.name}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-5">
                    {guide.blurb}
                  </p>

                  <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
                    {isLive ? (
                      <span className="text-sm font-semibold text-primary inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all">
                        Read the guide
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Guide coming soon
                      </span>
                    )}
                  </div>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default GradingGuides;
