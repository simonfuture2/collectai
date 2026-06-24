import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";
import GradingCTA from "@/components/GradingCTA";
import GradingStub from "@/components/GradingStub";
import OutboundLink from "@/components/OutboundLink";
import LegalDisclaimer from "@/components/LegalDisclaimer";
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
            {guide.slug === "tag" ? (
              <span className="text-gradient-primary">How to Grade Your Cards with TAG</span>
            ) : (
              <span className="text-gradient-primary">{guide.name}</span>
            )}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {guide.slug === "tag"
              ? "TAG (Technical Authentication & Grading) uses computer vision to grade every card on a transparent 1,000-point scale, with per-attribute subgrades you can verify online. This guide walks you through deciding whether your card is worth grading and how to submit it the right way."
              : guide.blurb}
          </p>
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


const TAG_OFFICIAL = "https://taggrading.com";
const TAG_SUBMIT = "https://taggrading.com/submit";
const TAG_PRICING = "https://taggrading.com/pricing";
const TAG_POPULATION = "https://my.taggrading.com/pop-report";
const TAG_FAQ = "https://taggrading.com/faq";
const TAG_VERIFY = "https://my.taggrading.com";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Pre-screen the card with MyCollectAi",
    body: "Scan it first. Our pre-grading analysis catches the same surface, edge, corner, and centering defects TAG's optics will, so you only pay to grade cards that have real upside.",
  },
  {
    title: "Compare graded vs. raw value",
    body: "Look at recent sales for the card in raw condition and at the grade you realistically expect. If the spread doesn't comfortably clear the submission fee plus shipping, it's not worth grading.",
  },
  {
    title: "Pick the right TAG service level",
    body: "TAG publishes tiers by declared value and turnaround. Choose the tier whose declared-value cap covers your card — under-declaring can void protection if the card is damaged in transit.",
  },
  {
    title: "Create your TAG account and start a submission",
    body: "Sign up on TAG's site, start a new submission, and enter each card's set, year, number, and player/character exactly as printed. Accurate data speeds up intake and shows up on your slab.",
  },
  {
    title: "Sleeve and protect every card",
    body: "Use a fresh penny sleeve inside a semi-rigid card saver (Card Saver I-style). Never tape the sleeve shut against the card. New scratches from gritty old sleeves are the #1 reason a 10 candidate comes back a 9.",
  },
  {
    title: "Pack and ship securely",
    body: "Sandwich your sleeved cards between rigid cardboard, tape the bundle, and ship in a bubble mailer or small box with tracking and insurance for the full declared value. Follow TAG's current shipping address and instructions exactly.",
  },
  {
    title: "Track, verify, and list",
    body: "Watch your submission move through receiving, grading, and shipping in your TAG dashboard. When it returns, verify the cert online, then add the graded result to your MyCollectAi collection to track its value over time.",
  },
];

const RESOURCES: { label: string; href: string; description: string }[] = [
  { label: "TAG Grading — official site", href: TAG_OFFICIAL, description: "Company overview and grading philosophy." },
  { label: "Start a submission", href: TAG_SUBMIT, description: "Create an account and submit cards online." },
  { label: "Pricing & service levels", href: TAG_PRICING, description: "Current tiers, fees, and turnaround times." },
  { label: "Population report", href: TAG_POPULATION, description: "Look up how many of a card TAG has graded at each level." },
  { label: "Verify a TAG cert", href: TAG_VERIFY, description: "Confirm authenticity and view full subgrades for any TAG slab." },
  { label: "TAG FAQ", href: TAG_FAQ, description: "Official answers on grading, shipping, and account questions." },
];

const TagGuide = () => (
  <article className="space-y-10 text-foreground">
    {/* 2 — Pre-submit callout */}
    <GlassCard className="bg-glass border-primary/30">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-display font-bold mb-1">
            Before you submit: is it worth grading?
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Grading fees, shipping, and insurance add up fast. Run the card through a MyCollectAi
            scan first to see its estimated raw value, projected graded value, and condition
            flags — so you only submit cards that pencil out.
          </p>
        </div>
        <Link to="/scan" className="shrink-0">
          <Button className="gradient-primary text-white">
            Scan &amp; value a card
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </GlassCard>

    {/* 3 — 7 steps */}
    <Section title="Step-by-step: submitting to TAG">
      <ol className="space-y-4">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-2xl border border-border-subtle bg-card/40 p-4"
          >
            <div className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 text-primary border border-primary/30 font-display font-bold">
              {i + 1}
            </div>
            <div>
              <h4 className="font-display font-semibold text-foreground mb-1">{step.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>

    {/* 4 — What TAG grades */}
    <Section title="What TAG grades">
      <p className="text-muted-foreground leading-relaxed mb-3">
        TAG focuses on trading cards — modern and vintage TCG (Pokémon, Magic, Yu-Gi-Oh!, Lorcana,
        and more) plus sports cards across major sports. Every card is scored on a 1,000-point
        scale with published subgrades for centering, corners, edges, and surface, all visible on
        the cert page for any buyer or collector to verify.
      </p>
      <OutboundLink href={TAG_OFFICIAL} className="text-sm font-semibold no-underline hover:underline">
        See the full list of what TAG grades
      </OutboundLink>
    </Section>

    {/* 5 — Helpful resources */}
    <Section title="Helpful TAG resources">
      <ul className="grid sm:grid-cols-2 gap-3">
        {RESOURCES.map((r) => (
          <li
            key={r.href}
            className="rounded-xl border border-border-subtle bg-card/40 p-4 hover:border-primary/40 hover:bg-card/60 transition-colors"
          >
            <OutboundLink
              href={r.href}
              className="font-display font-semibold no-underline hover:underline"
            >
              {r.label}
            </OutboundLink>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">{r.description}</p>
          </li>
        ))}
      </ul>
    </Section>

    {/* 6 — Swappable CTA */}
    <GradingCTA partner={false} company="TAG" officialUrl={TAG_OFFICIAL} />

    {/* 7 — Disclaimer */}
    <LegalDisclaimer>
      <strong className="text-foreground">Disclaimer:</strong> MyCollectAi is not affiliated
      with, endorsed by, or sponsored by TAG Grading. All trademarks and product names belong to
      their respective owners. Pricing, service tiers, turnaround times, submission requirements,
      and shipping instructions are set by TAG and change frequently — always confirm the current
      details on{" "}
      <OutboundLink href={TAG_OFFICIAL} className="text-xs">
        taggrading.com
      </OutboundLink>{" "}
      or{" "}
      <OutboundLink href="https://help.taggrading.com" className="text-xs">
        help.taggrading.com
      </OutboundLink>{" "}
      before submitting. Pre-grade estimates from MyCollectAi are informational only and do not
      guarantee a final grade or sale price.
    </LegalDisclaimer>
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
  <div className="space-y-10">
    <GlassCard className="text-center py-12">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
        <Clock className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-2xl font-display font-bold mb-2">Our {name} guide is in the works</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-6">
        We're putting together a deep, plain-English breakdown of how {name} grades cards, what
        their scale really means, and how to submit smarter. Check back soon.
      </p>
      <Link to="/grading">
        <Button variant="outline">
          <ArrowLeft className="w-4 h-4" />
          Back to all guides
        </Button>
      </Link>
    </GlassCard>
    <LegalDisclaimer />
  </div>
);

export default GradingGuide;
