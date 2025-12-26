import { Sparkles } from "lucide-react";

interface PoweredByW3AIProps {
  className?: string;
}

const PoweredByW3AI = ({ className = "" }: PoweredByW3AIProps) => {
  return (
    <a
      href="https://w3mct.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-all duration-300 ${className}`}
    >
      <span className="opacity-70 group-hover:opacity-100 transition-opacity">Powered by</span>
      <span className="flex items-center gap-1 font-medium bg-gradient-to-r from-collectai-purple to-collectai-blue bg-clip-text text-transparent group-hover:opacity-100 opacity-80 transition-opacity">
        <Sparkles className="h-3 w-3 text-collectai-purple/70 group-hover:text-collectai-purple transition-colors" />
        W3AI
      </span>
    </a>
  );
};

export default PoweredByW3AI;
