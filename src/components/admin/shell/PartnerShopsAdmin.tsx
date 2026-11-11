import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Shop = Database["public"]["Tables"]["partner_shops"]["Row"];
type Report = { shop_id: string; name: string; partner_code: string; status: string; revenue_share_pct: number; signups: number; conversions: number; revenue_cents: number; owed_cents: number };
const usd = (c: number) => `$${(Number(c) / 100).toFixed(2)}`;
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function PartnerShopsAdmin() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [month, setMonth] = useState(monthKey());
  const [report, setReport] = useState<Report[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("partner_shops").select("*").order("created_at", { ascending: false });
    setShops(data ?? []);
  }, []);
  const loadReport = useCallback(async () => {
    const [y, m] = month.split("-").map(Number);
    const { data, error } = await supabase.rpc("partner_revenue_report", { _since: new Date(y, m - 1, 1).toISOString(), _until: new Date(y, m, 1).toISOString() });
    if (error) toast.error(error.message);
    setReport((data as Report[]) ?? []);
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadReport(); }, [loadReport]);

  const update = async (id: string, patch: Partial<Shop>) => {
    const { error } = await supabase.from("partner_shops").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    load(); loadReport();
  };

  if (!shops) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Partner shops</h3>
        <p className="text-sm text-muted-foreground">A shop is created when a lead moves to "Partner onboarding".</p>
        {shops.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No partner shops yet.</p> : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Shop</th><th className="p-2">Status</th><th className="p-2">Level</th><th className="p-2">Revenue share %</th><th className="p-2" /></tr></thead>
              <tbody>
                {shops.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="p-2"><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.partner_code} · /s/{s.slug}</p></td>
                    <td className="p-2">
                      <Select value={s.status} onValueChange={(v) => update(s.id, { status: v })}>
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{["onboarding", "active", "paused"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select value={s.tier} onValueChange={(v) => update(s.id, { tier: v })}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>{["listed", "partner", "featured"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2"><Input type="number" min={0} max={100} className="h-8 w-20" defaultValue={Number(s.revenue_share_pct)}
                      onBlur={(e) => Number(e.target.value) !== Number(s.revenue_share_pct) && update(s.id, { revenue_share_pct: Number(e.target.value) })} /></td>
                    <td className="p-2"><Button asChild size="sm" variant="ghost"><a href={`/partner?shop=${s.id}`}>Open <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Revenue share report</h3>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 w-40" />
        </div>
        <p className="text-sm text-muted-foreground">Payments from each shop's customers in their first 12 months. For reporting only – payouts happen outside the app.</p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Shop</th><th className="p-2">Sign-ups</th><th className="p-2">Conversions</th><th className="p-2">Revenue</th><th className="p-2">Share</th><th className="p-2">Owed</th></tr></thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.shop_id} className="border-t border-border">
                  <td className="p-2">{r.name}</td><td className="p-2">{r.signups}</td><td className="p-2">{r.conversions}</td>
                  <td className="p-2">{usd(r.revenue_cents)}</td><td className="p-2">{Number(r.revenue_share_pct)}%</td><td className="p-2 font-semibold">{usd(r.owed_cents)}</td>
                </tr>
              ))}
              {report.length === 0 && <tr><td colSpan={6} className="p-3 text-muted-foreground">Nothing this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
