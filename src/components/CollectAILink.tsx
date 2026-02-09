import { Sparkles, TrendingUp, Camera, ExternalLink } from "lucide-react";

type LinkAction = "grade" | "price" | "identify";

interface CollectAILinkProps {
  action: LinkAction;
  className?: string;
  compact?: boolean;
}

const config: Record<LinkAction, { icon: typeof Sparkles; label: string; desc: string; href: string }> = {
  grade: {
    icon: Sparkles,
    label: "AI Grading",
    desc: "Get professional-level condition grading",
    href: "https://collectai.lovable.app/scan",
  },
  price: {
    icon: TrendingUp,
    label: "Market Pricing",
    desc: "Real-time market value estimates",
    href: "https://collectai.lovable.app/scan",
  },
  identify: {
    icon: Camera,
    label: "Image Recognition",
    desc: "Instant card identification from photos",
    href: "https://collectai.lovable.app/scan",
  },
};

const CollectAILink = ({ action, className = "", compact = false }: CollectAILinkProps) => {
  const { icon: Icon, label, desc, href } = config[action];

  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`group inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors ${className}`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="font-medium">{label}</span>
        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/30 hover:bg-primary/5 transition-all duration-300 ${className}`}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
    </a>
  );
};

export default CollectAILink;
