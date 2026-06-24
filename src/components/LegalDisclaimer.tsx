import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import OutboundLink from "@/components/OutboundLink";

interface LegalDisclaimerProps {
  /** Optional override for the body copy. Defaults to the no-affiliation notice. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Small, legible, persistent legal disclaimer block. Used on /grading and every
 * grading sub-page to make the no-affiliation relationship explicit.
 */
const LegalDisclaimer = ({ children, className }: LegalDisclaimerProps) => (
  <aside
    role="note"
    aria-label="Legal disclaimer"
    className={cn(
      "rounded-xl border border-border-subtle bg-muted/30 p-4 flex gap-3",
      className,
    )}
  >
    <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
    <p className="text-xs text-muted-foreground leading-relaxed">
      {children ?? (
        <>
          <strong className="text-foreground">Disclaimer:</strong> MyCollectAi is an independent
          tool and is <strong className="text-foreground">not affiliated with, endorsed by, or
          sponsored by</strong> PSA, Beckett (BGS), CGC, SGC, TAG Grading, or any other grading
          company. All company names, logos, and trademarks belong to their respective owners and
          are referenced for informational purposes only. Pricing, service tiers, turnaround
          times, submission requirements, and shipping instructions are set by each grading
          company and change frequently — always confirm the current details on the company's
          official site (e.g.{" "}
          <OutboundLink href="https://taggrading.com" className="text-xs">
            taggrading.com
          </OutboundLink>
          ) before submitting. Pre-grade estimates and valuations from MyCollectAi are
          informational only and do not guarantee a final grade, authenticity determination, or
          sale price.
        </>
      )}
    </p>
  </aside>
);

export default LegalDisclaimer;
