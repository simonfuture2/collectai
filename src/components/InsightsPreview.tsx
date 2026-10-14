import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ScanSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DealChip } from "@/components/DealChip";

/** Compact dashboard card with the last 3 insight scans. Hidden when there are none. */
export default function InsightsPreview() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase
        .from("cards")
        .select("id, card_name, estimated_value_low, estimated_value_high, asking_price")
        .eq("user_id", session.user.id)
        .eq("scan_purpose", "insight")
        .order("created_at", { ascending: false })
        .limit(3);
      setRows(data || []);
    })();
  }, []);
  if (!rows.length) return null;
  return (
    <section className="mb-8 rounded-2xl border border-secondary/30 bg-secondary/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 font-display font-bold text-secondary"><ScanSearch className="w-4 h-4" />Insights</h2>
        <Link to="/insights" className="text-sm font-medium text-secondary hover:underline">See all</Link>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((c) => {
          const lo = Number(c.estimated_value_low || 0), hi = Number(c.estimated_value_high || 0);
          return (
            <li key={c.id}>
              <Link to={`/scan/reveal/${c.id}`} className="flex items-center gap-2 py-2">
                <span className="flex-1 truncate text-sm font-medium">{c.card_name || "Identifying…"}</span>
                <span className="text-sm font-numeric text-muted-foreground">{lo && hi ? `$${lo.toFixed(0)}–$${hi.toFixed(0)}` : "—"}</span>
                {c.asking_price != null && lo > 0 && hi > 0 && <DealChip asking={c.asking_price} low={lo} high={hi} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
