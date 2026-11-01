import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "pc_access";
const cached = (): boolean | null => {
  try { const v = sessionStorage.getItem(KEY); return v === null ? null : v === "1"; } catch { return null; }
};

/** True when the signed-in user may use Price Check (switch on, beta tester, or admin). Cached per tab session. */
export function usePriceCheckAccess(enabled = true) {
  const initial = cached();
  const [allowed, setAllowed] = useState(initial ?? false);
  const [loading, setLoading] = useState(initial === null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } if (!cancelled) { setAllowed(false); setLoading(false); } return; }
      const { data, error } = await supabase.rpc("can_use_price_check", { _uid: session.user.id });
      const ok = !error && data === true;
      if (!error) try { sessionStorage.setItem(KEY, ok ? "1" : "0"); } catch { /* ignore */ }
      if (!cancelled) { setAllowed(ok); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [enabled]);
  return { allowed, loading };
}
