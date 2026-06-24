import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, Sparkles, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";
import GradingCTA from "@/components/GradingCTA";
import { getGuideBySlug } from "@/lib/gradingGuides";

const GradingGuide = () => {
  const { slug } = useParams<{ slug: string }>();
  const guide = slug ? getGuideBySlug(slug) : undefined;

  if (!guide) {
    return <Navigate to="/grading" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title={`${guide.name} Grading Guide | MyCollectAI`}
        description={guide.blurb}
        path={`/grading/${guide.slug}`}
      />

      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/grading">
            <Button variant="ghost" size="icon" aria-label="Back to guides">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-display font-bold flex-1 truncate">{guide.name}</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-3xl flex-1">
        <div className="mb-8">
          <Link
            to="/grading"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All grading guides
          </Link>
          <div className="flex items-center gap-2 mb-3">
            {guide.partnerBadge && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/30">
                MyCollectAi × {guide.name}
              </span>
            )}
            {guide.status === "live" ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-collectai-green/15 text-collectai-green border border-collectai-green/30 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Live guide
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> Coming soon
              </span>
            )}
          </div>
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-3">
            <span className="text-gradient-primary">{guide.name}</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">{guide.blurb}</p>
        </div>

        {guide.status === "live" && guide.slug === "tag" ? (
          <TagGuide />
        ) : (
          <ComingSoonStub name={guide.name} />
        )}
      </main>

      <Footer />
    </div>
  );
};

/* ───────────────────────── TAG guide ───────────────────────── */

const TagGuide = () => (
  <article className="space-y-10 text-foreground">
    <Section title="What makes TAG different">
      <p className="text-muted-foreground leading-relaxed">
        TAG (Technical Authentication & Grading) is a fully automated, computer-vision-based grading
        service. Instead of a single human grader assigning a final number, TAG runs every card
        through a calibrated optical rig and grades on a <strong className="text-foreground">1,000-point scale</strong> — then
        publishes the underlying subgrades so anyone can see exactly why the card landed where it did.
      </p>
    </Section>

    <Section title="The 1,000-point scale">
      <p className="text-muted-foreground leading-relaxed mb-4">
        TAG maps its 1,000-point score back to the traditional 1–10 scale so it's easy to compare
        against PSA, BGS, CGC, and SGC.
      </p>
      <div className="rounded-xl border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-4 py-3 font-display font-semibold">TAG score</th>
              <th className="px-4 py-3 font-display font-semibold">Traditional grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {[
              ["1000", "Gem Mint 10 / Pristine"],
              ["950 – 999", "Gem Mint 10"],
              ["900 – 949", "Mint 9"],
              ["800 – 899", "NM-Mint 8"],
              ["700 – 799", "Near Mint 7"],
              ["500 – 699", "Excellent 5 – 6"],
              ["1 – 499", "VG / Good and below"],
            ].map(([range, label]) => (
              <tr key={range}>
                <td className="px-4 py-2.5 font-mono text-primary">{range}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>

    <Section title="What TAG actually measures">
      <ul className="space-y-3">
        {[
          ["Centering", "Front and back, measured to a fraction of a millimeter."],
          ["Corners", "All four scored independently using high-resolution edge detection."],
          ["Edges", "Whitening, chipping, and roughness scored per side."],
          ["Surface", "Print lines, scratches, dimples, and holo scuffs flagged pixel-by-pixel."],
        ].map(([k, v]) => (
          <li key={k} className="flex gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground">{k}.</strong>{" "}
              <span className="text-muted-foreground">{v}</span>
            </div>
          </li>
        ))}
      </ul>
    </Section>

    <Section title="Tips for a stronger TAG submission">
      <ol className="space-y-3 text-muted-foreground list-decimal pl-5">
        <li>
          <strong className="text-foreground">Pre-screen with MyCollectAi.</strong> Run the card
          through a scan first — our pre-grading analysis flags the same defects TAG's optics will
          catch, so you only submit cards worth the fee.
        </li>
        <li>
          <strong className="text-foreground">Ship in a fresh sleeve + semi-rigid.</strong> Avoid
          old penny sleeves that may have grit; new surface scratches are the most common reason a
          near-perfect card drops a grade.
        </li>
        <li>
          <strong className="text-foreground">Match centering to your eye check.</strong> If TAG's
          machine sees worse centering than you do under sleeve glare, the card probably isn't a 10
          candidate.
        </li>
      </ol>
    </Section>

    <Section title="Who TAG is best for">
      <p className="text-muted-foreground leading-relaxed">
        Collectors who want maximum transparency, modern TCG submitters chasing pristine
        designations, and anyone tired of the "why did this get a 9 instead of a 10?" black box.
        Less ideal if your buyers strictly want a PSA label for resale.
      </p>
    </Section>

    <GlassCard className="bg-glass">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-display font-bold mb-1">Not sure if it's worth grading?</h3>
          <p className="text-sm text-muted-foreground">
            Scan it with MyCollectAi and get an instant pre-grade estimate.
          </p>
        </div>
        <Link to="/scan">
          <Button className="gradient-primary">
            Scan a card
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </GlassCard>
  </article>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h3 className="text-xl md:text-2xl font-display font-bold mb-3">{title}</h3>
    {children}
  </section>
);

/* ───────────────────────── Coming soon stub ───────────────────────── */

const ComingSoonStub = ({ name }: { name: string }) => (
  <GlassCard className="text-center py-12">
    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
      <Clock className="w-6 h-6 text-primary" />
    </div>
    <h3 className="text-2xl font-display font-bold mb-2">Our {name} guide is in the works</h3>
    <p className="text-muted-foreground max-w-md mx-auto mb-6">
      We're putting together a deep, plain-English breakdown of how {name} grades cards, what their
      scale really means, and how to submit smarter. Check back soon.
    </p>
    <Link to="/grading">
      <Button variant="outline">
        <ArrowLeft className="w-4 h-4" />
        Back to all guides
      </Button>
    </Link>
  </GlassCard>
);

export default GradingGuide;
