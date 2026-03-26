import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Users, Gift } from "lucide-react";
import { toast } from "sonner";

interface ReferralCardProps {
  userId: string;
}

const ReferralCard = ({ userId }: ReferralCardProps) => {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Get referral code from dedicated table
      const { data: codeRow } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("user_id", userId)
        .maybeSingle();

      if (codeRow?.code) {
        setReferralCode(codeRow.code);
      }

      // Count referrals
      const { count } = await supabase
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_id", userId);

      setReferralCount(count || 0);
      setLoading(false);
    };

    fetchData();
  }, [userId]);

  const referralLink = `${window.location.origin}/auth?ref=${referralCode}`;

  const copyCode = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied!");
  };

  const shareCode = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join CollectAI",
          text: "Scan and grade your trading cards with AI! Use my referral link to get started:",
          url: referralLink,
        });
      } catch {
        copyCode();
      }
    } else {
      copyCode();
    }
  };

  if (loading || !referralCode) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Gift className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display font-bold">Refer a Friend</h3>
          <p className="text-xs text-muted-foreground">Earn 3 free scans per referral</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 bg-muted rounded-lg px-4 py-2.5 font-mono text-sm text-foreground truncate">
          {referralCode}
        </div>
        <Button variant="outline" size="icon" onClick={copyCode}>
          <Copy className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={shareCode}>
          <Share2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="w-4 h-4" />
        <span>{referralCount} referral{referralCount !== 1 ? "s" : ""} • {referralCount * 3} credits earned</span>
      </div>
    </div>
  );
};

export default ReferralCard;
