import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** True when the signed-in user may use Price Check (switch on, beta tester, or admin). */
export function usePriceCheckAccess(enabled = true) {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { if (!cancelled) { setAllowed(false); setLoading(false); } return; }
      const { data, error } = await supabase.rpc("can_use_price_check", { _uid: session.user.id });
      if (!cancelled) { setAllowed(!error && data === true); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [enabled]);
  return { allowed, loading };
}
