import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Count of the user's insight scans; `days` limits to recent ones. */
export function useInsightCount(days?: number, enabled = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      let q = supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id)
        .eq("scan_purpose", "insight");
      if (days) q = q.gte("created_at", new Date(Date.now() - days * 86400000).toISOString());
      const { count: c } = await q;
      if (!cancelled) setCount(c ?? 0);
    })();
    return () => { cancelled = true; };
  }, [days, enabled]);
  return count;
}
