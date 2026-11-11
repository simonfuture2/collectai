import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, QrCode, UserPlus, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Ev { id: string; name: string; city: string | null; state: string | null; start_date: string | null; url: string | null; notes: string | null; ref_code: string | null; checklist: Record<string, boolean> }
const CHECKS: [string, string][] = [["qr_flyers", "QR flyers printed"], ["demo_phone", "Demo phone charged"], ["vendor_cards", "Collect vendor cards"]];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
const BASE = "https://mycollectai.com";

function Flyer({ ev, onClose }: { ev: Ev | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!ev) return null;
  const url = `${BASE}/price-check?ref=${ev.ref_code}`;
  const print = () => { const w = window.open("", "_blank"); if (!w || !ref.current) return; w.document.write(`<html><head><title>${ev.name}</title></head><body style="font-family:sans-serif;text-align:center;padding:40px">${ref.current.innerHTML}</body></html>`); w.document.close(); w.print(); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>QR flyer · {ev.name}</DialogTitle></DialogHeader>
        <div ref={ref} className="text-center space-y-3 py-2">
          <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>What's your card worth?</h2>
          <p style={{ margin: 0 }}>Scan for a free price check — takes seconds.</p>
          <div style={{ display: "inline-block", background: "white", padding: 12 }}><QRCodeSVG value={url} size={220} /></div>
          <p style={{ margin: 0, fontWeight: 600 }}>MyCollectAI · {ev.name}</p>
          <p style={{ margin: 0, fontSize: 12 }}>{url.replace("https://", "")}</p>
        </div>
        <Button onClick={print}><Printer className="h-4 w-4 mr-2" />Print</Button>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsSection() {
  const [rows, setRows] = useState<Ev[]>([]);
  const [f, setF] = useState({ name: "", city: "", state: "", start_date: "", url: "", notes: "" });
  const [flyer, setFlyer] = useState<Ev | null>(null);
  const [vendorFor, setVendorFor] = useState<Ev | null>(null);
  const [vendor, setVendor] = useState({ name: "", email: "", website: "", phone: "" });
  const load = () => supabase.from("agent_events").select("*").gte("start_date", new Date(Date.now() - 864e5 * 3).toISOString().slice(0, 10)).order("start_date").then(({ data }) => setRows((data ?? []) as Ev[]));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!f.name.trim()) return;
    const ref_code = `show_${slug(f.name)}_${(f.start_date || "").replace(/-/g, "").slice(2, 8)}`.slice(0, 60);
    const { error } = await supabase.from("agent_events").insert({ ...f, start_date: f.start_date || null, ref_code });
    if (error) return toast.error(error.message);
    setF({ name: "", city: "", state: "", start_date: "", url: "", notes: "" }); load();
  };
  const toggle = async (ev: Ev, k: string, v: boolean) => {
    const checklist = { ...ev.checklist, [k]: v };
    setRows((r) => r.map((x) => (x.id === ev.id ? { ...x, checklist } : x)));
    await supabase.from("agent_events").update({ checklist }).eq("id", ev.id);
  };
  const addVendor = async () => {
    if (!vendorFor || !vendor.name.trim()) return;
    // Vendor gave us their card in person — consent to email is not assumed; they go to the cold lane.
    const { error } = await supabase.from("agent_leads").insert({
      platform: "event", lead_type: "card_shop", source: "event", event_id: vendorFor.id, tags: ["event", vendorFor.ref_code ?? "show"],
      name: vendor.name.trim(), business_name: vendor.name.trim(), email: vendor.email.trim() || null, website: vendor.website.trim() || null, phone: vendor.phone.trim() || null,
      city: vendorFor.city, state: vendorFor.state, enrich_status: vendor.website.trim() ? "pending" : "none", notes: `Met at ${vendorFor.name}`,
    });
    if (error) return toast.error(error.message);
    toast.success("Vendor added"); setVendor({ name: "", email: "", website: "", phone: "" });
  };

  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle className="text-base">Add a show</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          {(["name", "city", "state", "start_date", "url", "notes"] as const).map((k) => (
            <div key={k}><Label className="text-xs capitalize">{k.replace("_", " ")}</Label><Input type={k === "start_date" ? "date" : "text"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>))}
          <div className="md:col-span-3"><Button onClick={add}><Plus className="h-4 w-4 mr-2" />Add show</Button></div>
        </CardContent></Card>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming shows yet.</p> : rows.map((ev) => (
        <Card key={ev.id}><CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="font-semibold">{ev.name}</p><p className="text-sm text-muted-foreground">{[ev.start_date, ev.city, ev.state].filter(Boolean).join(" · ")}{ev.url && <> · <a className="underline" href={ev.url} target="_blank" rel="noreferrer">site</a></>}</p></div>
            <Badge variant="outline">ref {ev.ref_code}</Badge>
          </div>
          <div className="flex flex-wrap gap-4">{CHECKS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={!!ev.checklist?.[k]} onCheckedChange={(c) => toggle(ev, k, !!c)} />{l}</label>))}</div>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setFlyer(ev)}><QrCode className="h-4 w-4 mr-2" />QR flyer</Button>
            <Button size="sm" variant="outline" onClick={() => setVendorFor(ev)}><UserPlus className="h-4 w-4 mr-2" />Add vendor met</Button></div>
          {vendorFor?.id === ev.id && (
            <div className="grid gap-2 md:grid-cols-4">{(["name", "email", "website", "phone"] as const).map((k) => <Input key={k} placeholder={k} value={vendor[k]} onChange={(e) => setVendor({ ...vendor, [k]: e.target.value })} />)}
              <Button size="sm" onClick={addVendor}>Save vendor</Button></div>)}
        </CardContent></Card>
      ))}
      <Flyer ev={flyer} onClose={() => setFlyer(null)} />
    </div>
  );
}
