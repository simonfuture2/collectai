import { Coins, Crown, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface CreditBalanceProps {
  credits: number;
  isPro: boolean;
  loading: boolean;
  compact?: boolean;
}

export default function CreditBalance({ credits, isPro, loading, compact = false }: CreditBalanceProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </div>
    );
  }

  if (isPro) {
    return (
      <Link to="/pricing">
        <Badge className="bg-gradient-to-r from-primary to-secondary text-primary-foreground border-0 gap-1">
          <Crown className="w-3 h-3" />
          {compact ? "Pro" : "Pro Plan"}
        </Badge>
      </Link>
    );
  }

  return (
    <Link to="/pricing" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
      <Badge variant="outline" className="gap-1 border-primary/30">
        <Coins className="w-3 h-3 text-primary" />
        <span className="font-semibold">{credits}</span>
        {!compact && <span className="text-muted-foreground">credits</span>}
      </Badge>
    </Link>
  );
}
