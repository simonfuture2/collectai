import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FIRST_CUSTOMERS_GOAL } from "@/lib/partnerShops";

/** Partner checklist on a lead that has (or is becoming) a partner shop. */
export default function PartnerShopPanel({ leadId, stage }: { leadId: string; stage: string }) {
  const [shop, setShop] = useState<any | null | undefined>(undefined);
  const [extra, setExtra] = useState<{ staff: number; total: number }>({ staff: 0, total: 0 });
  const load = async () => {
    const { data } = await supabase.from("partner_shops").select("*").eq("lead_id", leadId).maybeSingle();
    setShop(data ?? null);
    if (data) {
      const [st, s] = await Promise.all([
        supabase.from("partner_shop_staff").select("id", { count: "exact", head: true }).eq("shop_id", data.id).eq("role", "staff"),
        supabase.rpc("partner_stats", { _shop: data.id, _since: new Date(0).toISOString() }),
      ]);
      setExtra({ staff: st.count ?? 0, total: (s.data as any)?.signups_total ?? 0 });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId, stage]);
  if (shop === undefined) return null;
  if (!shop) {
    if (!["partner_onboarding", "active_partner", "meeting_booked", "replied"].includes(stage)) return null;
    return (
      <div className="rounded-xl border border-border p-3">
        <Button size="sm" variant="outline" onClick={async () => { const { error } = await supabase.rpc("partner_create_from_lead", { _lead_id: leadId }); if (error) toast.error(error.message); else { toast.success("Partner shop created"); load(); } }}>
          <Store className="mr-1 h-4 w-4" />Create partner shop
        </Button>
      </div>
    );
  }
  const items = [
    ["Page approved by owner", !!shop.owner_approved_at],
    ["Kit printed", !!shop.checklist?.kit_printed],
    ["Staff signed up", extra.staff > 0],
    [`First ${FIRST_CUSTOMERS_GOAL} customer sign-ups (${extra.total})`, extra.total >= FIRST_CUSTOMERS_GOAL],
  ] as const;
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Store className="h-4 w-4" />{shop.name} <span className="text-xs font-normal text-muted-foreground">({shop.status})</span></p>
        <Button asChild size="sm" variant="ghost"><a href={`/partner?shop=${shop.id}`}>Dashboard <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button>
      </div>
      <p className="text-xs text-muted-foreground">mycollectai.com/s/{shop.slug} · code {shop.partner_code}</p>
      <ul className="space-y-1 text-sm">
        {items.map(([l, d]) => <li key={l} className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${d ? "text-primary" : "text-muted-foreground/40"}`} />{l}</li>)}
      </ul>
    </div>
  );
}
