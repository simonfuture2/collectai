import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BETA_OFFER } from "@/lib/stripe-config";

const CUTOFF = new Date("2026-09-30T23:59:59Z");
const DISMISS_KEY = "beta-promo-dismissed";

export default function BetaPromoBanner() {
  const [dismissed, setDismissed] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (Date.now() > CUTOFF.getTime()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* storage unavailable — still show the banner */
    }
    setDismissed(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (dismissed) return null;

  return (
    <div className="relative border-b border-amber-500/40 bg-amber-500/10">
      <div className="container mx-auto px-4 py-2.5 pr-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm">
        <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="font-semibold">Beta Founder offer</span>
        <span className="text-muted-foreground">
          — Free for {BETA_OFFER.trial_days} days of full Pro access, then lock in ${BETA_OFFER.price}/mo (50% off) for {BETA_OFFER.months} months.
          Offer ends September 30, 2026.
        </span>
        <Link
          to={signedIn ? "/pricing" : "/auth"}
          className="font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap"
        >
          Claim your spot →
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss beta offer"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
