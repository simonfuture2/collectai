import { Link } from "react-router-dom";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import LegalDisclaimer from "@/components/LegalDisclaimer";

interface GradingStubProps {
  /** Company name (e.g. "PSA", "Beckett (BGS)"). */
  company: string;
  /** Short neutral description shown under the heading. */
  description?: string;
}

/**
 * Shared "Guide coming soon" stub used by /grading/psa, /grading/bgs,
 * /grading/cgc, and /grading/sgc. Shows the company name, a neutral one-line
 * description, a persistent legal disclaimer, and a link back to the hub.
 */
const GradingStub = ({ company, description }: GradingStubProps) => (
  <div className="space-y-10">
    <GlassCard className="text-center py-12">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
        <Clock className="w-6 h-6 text-primary" />
      </div>
      <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">
        <span className="text-gradient-primary">{company}</span>
      </h2>
      <p className="text-muted-foreground max-w-md mx-auto mb-6">
        {description ??
          `A plain-English guide to how ${company} grades cards, what their scale means, and how to submit cards the right way.`}
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm mb-6">
        <Clock className="w-4 h-4" />
        Guide coming soon
      </div>
      <div className="flex justify-center">
        <Link to="/grading">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4" />
            Back to all grading guides
          </Button>
        </Link>
      </div>
    </GlassCard>

    <LegalDisclaimer />
  </div>
);

export default GradingStub;
