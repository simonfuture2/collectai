import { Shield, Sparkles, ExternalLink } from "lucide-react";

type BadgeType = "authentiseal" | "collectai";
type BadgeVariant = "inline" | "card";

interface EcosystemBadgeProps {
  type: BadgeType;
  variant?: BadgeVariant;
  className?: string;
}

const EcosystemBadge = ({ type, variant = "inline", className = "" }: EcosystemBadgeProps) => {
  if (type === "authentiseal" && variant === "inline") {
    return (
      <a
        href="https://authentiseal.lovable.app"
        target="_blank"
        rel="noopener noreferrer"
        className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all duration-300 ${className}`}
      >
        <Shield className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs font-medium text-emerald-400">Powered by AuthentiSeal</span>
        <ExternalLink className="w-3 h-3 text-emerald-500/50 group-hover:text-emerald-500 transition-colors" />
      </a>
    );
  }

  if (type === "authentiseal" && variant === "card") {
    return (
      <a
        href="https://authentiseal.lovable.app"
        target="_blank"
        rel="noopener noreferrer"
        className={`group block p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all duration-300 ${className}`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Shield className="w-5 h-5 text-emerald-500" />
          <span className="text-sm font-semibold text-emerald-400">AuthentiSeal</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Certificate of Authenticity verification powered by AuthentiSeal
        </p>
      </a>
    );
  }

  if (type === "collectai" && variant === "inline") {
    return (
      <a
        href="https://collectai.lovable.app"
        target="_blank"
        rel="noopener noreferrer"
        className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all duration-300 ${className}`}
      >
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium text-primary">Grade with CollectAI</span>
        <ExternalLink className="w-3 h-3 text-primary/50 group-hover:text-primary transition-colors" />
      </a>
    );
  }

  // collectai card variant
  return (
    <a
      href="https://collectai.lovable.app"
      target="_blank"
      rel="noopener noreferrer"
      className={`group block p-4 rounded-xl bg-primary/5 border border-primary/15 hover:bg-primary/10 hover:border-primary/30 transition-all duration-300 ${className}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Sparkles className="w-5 h-5 text-primary" />
        <span className="text-sm font-semibold text-primary">CollectAI</span>
      </div>
      <p className="text-xs text-muted-foreground">
        AI-powered card grading, identification, and market pricing
      </p>
    </a>
  );
};

export default EcosystemBadge;
