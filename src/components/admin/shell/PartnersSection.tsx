import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import PersonDrawer from "./PersonDrawer";

type Lead = Database["public"]["Tables"]["agent_leads"]["Row"];
const nice = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function PartnersSection() {
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("agent_leads").select("*").is("merged_into", null)
      .or("source.eq.partner_form,stage.in.(partner_onboarding,active_partner),partner_code.not.is.null")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Shops and creators from the partner form, or moved to a partner stage.</p>
      {rows.length === 0 ? <p className="text-muted-foreground">No partners yet.</p> : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {rows.map((l) => (
            <button key={l.id} onClick={() => setOpen(l.id)} className="w-full p-3 text-left hover:bg-muted/50 flex justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{l.business_name || l.name || l.email}</p>
                <p className="text-xs text-muted-foreground truncate">{l.email}{l.partner_code ? ` · ${l.partner_code}` : ""}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">{nice(l.stage)}</Badge>
            </button>
          ))}
        </div>
      )}
      <PersonDrawer leadId={open} onClose={() => setOpen(null)} onSaved={load} />
    </div>
  );
}
