import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Coins, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { STRIPE_CONFIG } from "@/lib/stripe-config";
import { useToast } from "@/hooks/use-toast";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
}

export default function UpgradeModal({ open, onOpenChange, feature = "this feature" }: UpgradeModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCheckout = async (priceId: string, mode: string) => {
    setLoading(priceId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId, mode },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="w-5 h-5 text-primary" />
            Upgrade to Continue
          </DialogTitle>
          <DialogDescription>
            You need credits or a Pro subscription to use {feature}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {/* Pro subscription */}
          <Button
            onClick={() => handleCheckout(STRIPE_CONFIG.pro.price_id, "subscription")}
            disabled={loading !== null}
            className="w-full justify-between gradient-primary py-6"
          >
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4" />
              <span>Go Pro — Unlimited Everything</span>
            </div>
            <span className="font-bold">
              {loading === STRIPE_CONFIG.pro.price_id ? <Loader2 className="w-4 h-4 animate-spin" /> : "$14.99/mo"}
            </span>
          </Button>

          <div className="text-center text-xs text-muted-foreground">or buy credits</div>

          {/* Credit packs */}
          {[STRIPE_CONFIG.credits_10, STRIPE_CONFIG.credits_50, STRIPE_CONFIG.credits_100].map((pack) => (
            <Button
              key={pack.price_id}
              variant="outline"
              onClick={() => handleCheckout(pack.price_id, "payment")}
              disabled={loading !== null}
              className="w-full justify-between"
            >
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" />
                <span>{pack.name}</span>
              </div>
              <span className="font-semibold">
                {loading === pack.price_id ? <Loader2 className="w-4 h-4 animate-spin" /> : `$${pack.price}`}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
