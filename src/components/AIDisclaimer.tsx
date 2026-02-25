import { Info } from "lucide-react";

interface AIDisclaimerProps {
  className?: string;
}

const AIDisclaimer = ({ className = "" }: AIDisclaimerProps) => {
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground ${className}`}>
      <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <p>
        Values shown are AI-generated estimates and should not be treated as professional appraisals or financial advice.
      </p>
    </div>
  );
};

export default AIDisclaimer;
