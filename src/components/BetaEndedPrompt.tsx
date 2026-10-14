import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/use-credits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Beta reminders (7 / 1 days left) and the "beta ended — subscribe to keep your collection" prompt. */
const BetaEndedPrompt = ({ showDialog = true, className = "" }: { showDialog?: boolean; className?: string }) => {
  const navigate = useNavigate();
  const { loading, subscribed, plan, betaEndsAt, betaActive, betaDaysLeft, betaEligible } = useCredits();
  const [userId, setUserId] = useState<string | null>(null);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(false);

  const isPaid = subscribed || plan === "pro";
  const expired = !loading && !isPaid && !!betaEndsAt && !betaActive;
  const reminder = !loading && !isPaid && betaActive && (betaDaysLeft <= 1 || betaDaysLeft === 7);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId || !(expired || reminder)) return;
    supabase.from("cards").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("scan_purpose", "collection")
      .then(({ count }) => setCardCount(count ?? 0));
    const key = expired ? `mca-beta-ended-seen-${userId}` : `mca-beta-remind-${betaDaysLeft <= 1 ? 1 : 7}-${userId}`;
    if (showDialog && !localStorage.getItem(key)) { setOpen(true); localStorage.setItem(key, "1"); }
  }, [userId, expired, reminder, betaDaysLeft, showDialog]);

  if (!expired && !reminder) return null;

  const title = expired
    ? "Your free beta has ended"
    : `Your beta ends in ${betaDaysLeft <= 1 ? "1 day" : "7 days"}`;
  const body = `Subscribe to keep your collection${cardCount ? ` of ${cardCount} card${cardCount === 1 ? "" : "s"}` : ""} and unlimited scans.`;
  const price = betaEligible ? " Founder price: $6.99/month for 12 months." : "";
  const go = () => { setOpen(false); navigate("/pricing"); };

  return (
    <>
      {expired && !bannerHidden && (
        <div className={`mb-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-card p-3 text-sm ${className}`}>
          <Crown className="w-4 h-4 text-primary shrink-0" />
          <span className="flex-1">{title}. {body}</span>
          <Button size="sm" className="gradient-primary text-primary-foreground" onClick={go}>Subscribe</Button>
          <button type="button" aria-label="Hide" onClick={() => setBannerHidden(true)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{body}{price}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Not now</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={go}>Subscribe</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BetaEndedPrompt;
