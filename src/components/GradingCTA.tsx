import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

interface GradingCTAProps {
  partner?: boolean;
  /** Company name shown in the CTA. Defaults to "TAG". */
  company?: string;
  /** Official outbound URL for the grading company. */
  officialUrl?: string;
  /** Optional partner-specific copy/URL/code, used when partner=true. */
  partnerCta?: {
    headline?: string;
    body?: string;
    ctaLabel?: string;
    href?: string;
  };
}

/**
 * Swappable CTA block for grading guides.
 * - partner={false} (default): informational — links to MyCollectAi scan + the company's official site.
 * - partner={true}: shows the partner offer (placeholder until real partner deal is wired).
 */
const GradingCTA = ({
  partner = false,
  company = "TAG",
  officialUrl = "https://taggrading.com",
  partnerCta,
}: GradingCTAProps) => {
  if (partner) {
    const headline = partnerCta?.headline ?? `Submit to ${company} through MyCollectAi`;
    const body =
      partnerCta?.body ??
      `As an official ${company} partner, MyCollectAi members get streamlined submissions and exclusive perks.`;
    const ctaLabel = partnerCta?.ctaLabel ?? `Start a ${company} submission`;
    const href = partnerCta?.href ?? "/scan";

    return (
      <GlassCard className="bg-glass border-primary/30">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/30">
            MyCollectAi × {company}
          </span>
        </div>
        <h3 className="text-xl font-display font-bold mb-2">{headline}</h3>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{body}</p>
        <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined}>
          <Button className="gradient-primary text-white">
            {ctaLabel}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </a>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="bg-glass">
      <h3 className="text-xl font-display font-bold mb-2">Ready to grade your card?</h3>
      <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
        Start with a MyCollectAi scan to confirm the card is worth submitting, then send it
        straight to {company}.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link to="/scan" className="sm:flex-1">
          <Button className="w-full gradient-primary text-white">
            Scan a card with MyCollectAi
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
        <a
          href={officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="sm:flex-1"
        >
          <Button variant="outline" className="w-full">
            Visit {company} official site
            <ExternalLink className="w-4 h-4" />
          </Button>
        </a>
      </div>
    </GlassCard>
  );
};

export default GradingCTA;
