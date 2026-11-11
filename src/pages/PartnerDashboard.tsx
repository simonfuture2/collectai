import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Download, ExternalLink, Loader2, QrCode, Store, Upload, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SEO from "@/components/SEO";
import { buyOffer, readShopMode, shopUrl, writeShopMode, FIRST_CUSTOMERS_GOAL } from "@/lib/partnerShops";
import { counterSignPdf, download, fileToDataUrl, qrDataUrl, tableTentPdf } from "@/lib/partnerKit";

type Shop = Database["public"]["Tables"]["partner_shops"]["Row"];
type Staff = Database["public"]["Tables"]["partner_shop_staff"]["Row"];
type Invite = Database["public"]["Tables"]["partner_staff_invites"]["Row"];
type Stats = { signups: number; signups_total: number; price_checks: number; paid_conversions: number; revenue_share_pct: number };

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };

export default function PartnerDashboard() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const loadShops = useCallback(async () => {
    await supabase.rpc("partner_claim_invites");
    const { data } = await supabase.from("partner_shops").select("*").order("name");
    setShops(data ?? []);
    setShopId((cur) => cur ?? new URLSearchParams(window.location.search).get("shop") ?? data?.[0]?.id ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate(`/auth?next=${encodeURIComponent("/partner")}`, { replace: true }); return; }
      setUserId(data.session.user.id);
      loadShops();
    });
  }, [navigate, loadShops]);

  if (!shops) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const shop = shops.find((s) => s.id === shopId) ?? null;
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Partner dashboard | MyCollectAI" description="Your MyCollectAI shop partner dashboard." path="/partner" noIndex />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="font-display text-lg font-bold text-gradient-primary">MyCollectAI</Link>
          {shops.length > 1 && (
            <Select value={shopId ?? ""} onValueChange={setShopId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Pick a shop" /></SelectTrigger>
              <SelectContent>{shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        {!shop ? (
          <div className="mx-auto max-w-md rounded-2xl border border-border p-6 text-center">
            <Store className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-3 font-display text-xl font-bold">No partner shop on this account</h1>
            <p className="mt-2 text-sm text-muted-foreground">Ask your shop owner to invite the email you signed in with, or apply to the partner program.</p>
            <Button asChild className="mt-4"><Link to="/partners">About the shop partner program</Link></Button>
          </div>
        ) : <ShopView key={shop.id} shop={shop} userId={userId!} onChanged={loadShops} />}
      </main>
    </div>
  );
}

function ShopView({ shop, userId, onChanged }: { shop: Shop; userId: string; onChanged: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [canRun, setCanRun] = useState(false);
  const [form, setForm] = useState({ name: shop.name, city: shop.city ?? "", state: shop.state ?? "", address: shop.address ?? "", website: shop.website ?? "", show_address: shop.show_address, show_website: shop.show_website, buy_offer_pct: Number(shop.buy_offer_pct) });
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "owner">("staff");
  const [shopMode, setShopModeState] = useState(() => readShopMode()?.shopId === shop.id);

  const me = staff.find((s) => s.user_id === userId);
  const isManager = canRun || me?.role === "owner" || shop.owner_user_id === userId;

  const load = useCallback(async () => {
    const [st, sf, inv, run] = await Promise.all([
      supabase.rpc("partner_stats", { _shop: shop.id, _since: monthStart() }),
      supabase.from("partner_shop_staff").select("*").eq("shop_id", shop.id).order("created_at"),
      supabase.from("partner_staff_invites").select("*").eq("shop_id", shop.id).is("accepted_at", null),
      supabase.rpc("can_run_shop", { _shop: shop.id }),
    ]);
    setStats((st.data as Stats) ?? null); setStaff(sf.data ?? []); setInvites(inv.data ?? []); setCanRun(!!run.data);
  }, [shop.id]);
  useEffect(() => { load(); }, [load]);

  const logoUrl = async () => {
    if (!shop.logo_path) return null;
    const { data } = await supabase.storage.from("partner-logos").createSignedUrl(shop.logo_path, 600);
    return data?.signedUrl ? fileToDataUrl(data.signedUrl) : null;
  };
  const kit = async (kind: "sign" | "tent" | "qr") => {
    setBusy(kind);
    try {
      if (kind === "qr") download(await qrDataUrl(shop.slug), `${shop.slug}-qr.png`);
      else {
        const args = { name: shop.name, slug: shop.slug, logoDataUrl: await logoUrl() };
        download(kind === "sign" ? await counterSignPdf(args) : await tableTentPdf(args), `${shop.slug}-${kind === "sign" ? "counter-sign" : "table-tent"}.pdf`);
      }
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };

  const save = async () => {
    setBusy("save");
    const { error } = await supabase.from("partner_shops").update({ ...form, city: form.city || null, state: form.state || null, address: form.address || null, website: form.website || null }).eq("id", shop.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Shop profile saved"); onChanged();
  };
  const uploadLogo = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) return toast.error("Logo must be under 5 MB");
    setBusy("logo");
    const path = `${shop.id}/logo-${Date.now()}.${(f.name.split(".").pop() || "png").toLowerCase()}`;
    const { error } = await supabase.storage.from("partner-logos").upload(path, f, { upsert: true, contentType: f.type });
    if (!error) await supabase.from("partner_shops").update({ logo_path: path }).eq("id", shop.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Logo updated"); onChanged();
  };
  const invite = async () => {
    const { data, error } = await supabase.rpc("partner_invite_staff", { _shop: shop.id, _email: inviteEmail, _role: inviteRole });
    if (error) return toast.error(error.message);
    toast.success((data as any)?.added ? "Added to your shop" : "Invite saved – they join when they sign in at mycollectai.com/partner");
    setInviteEmail(""); load();
  };
  const approve = async () => {
    const { error } = await supabase.rpc("partner_approve_page", { _shop: shop.id });
    if (error) return toast.error(error.message);
    toast.success("Page approved – your shop is live"); onChanged();
  };
  const toggleChecklist = async (key: string, v: boolean) => {
    await supabase.from("partner_shops").update({ checklist: { ...(shop.checklist as object), [key]: v } }).eq("id", shop.id);
    onChanged();
  };
  const setShopMode = (on: boolean) => {
    writeShopMode(on ? { shopId: shop.id, shopName: shop.name, pct: Number(shop.buy_offer_pct) } : null);
    setShopModeState(on);
  };

  const checklist = (shop.checklist ?? {}) as Record<string, boolean>;
  const items = useMemo(() => [
    { k: "page_approved", label: "Page approved by owner", done: !!shop.owner_approved_at },
    { k: "kit_printed", label: "Counter kit printed", done: !!checklist.kit_printed, manual: true },
    { k: "staff", label: "Staff signed up", done: staff.some((s) => s.role === "staff") },
    { k: "first10", label: `First ${FIRST_CUSTOMERS_GOAL} customer sign-ups`, done: (stats?.signups_total ?? 0) >= FIRST_CUSTOMERS_GOAL, note: `${stats?.signups_total ?? 0}/${FIRST_CUSTOMERS_GOAL}` },
  ], [shop, checklist, staff, stats]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{shop.name}</h1>
          <a href={`/s/${shop.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary">{shopUrl(shop.slug).replace("https://", "")}<ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={shop.status === "active" ? "default" : "secondary"}>{shop.status}</Badge>
          <Badge variant="outline">{shop.tier}</Badge>
        </div>
      </div>

      {shop.status === "onboarding" && isManager && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm">Look over your page, then approve it to go live. Staff get free Pro once the shop is live.</p>
          <Button onClick={approve}><CheckCircle2 className="mr-1 h-4 w-4" />Approve my page</Button>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">This month</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Customers signed up" value={stats?.signups} />
          <Stat label="Price checks they ran" value={stats?.price_checks} />
          {Number(stats?.revenue_share_pct) > 0 && <Stat label="Paid conversions" value={stats?.paid_conversions} />}
        </div>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold">Counter kit</h2>
        <p className="text-sm text-muted-foreground">Print the sign for your counter and the tent for your tables. The QR code opens your shop page.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => kit("sign")} disabled={!!busy}>{busy === "sign" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}Counter sign (PDF)</Button>
          <Button variant="outline" onClick={() => kit("tent")} disabled={!!busy}>{busy === "tent" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}Table tent (PDF)</Button>
          <Button variant="outline" onClick={() => kit("qr")} disabled={!!busy}><QrCode className="mr-1 h-4 w-4" />QR code (PNG)</Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Shop mode on this device</h2>
            <p className="text-sm text-muted-foreground">The live scanner opens in Insights (nothing goes into your own collection) and shows a buy offer at {Number(shop.buy_offer_pct)}% of market value – e.g. ${buyOffer(100, Number(shop.buy_offer_pct))} on a $100 card.</p>
          </div>
          <Switch checked={shopMode} onCheckedChange={setShopMode} aria-label="Shop mode" />
        </div>
        {shopMode && <Button asChild className="mt-3"><Link to="/scan/live">Open the scanner</Link></Button>}
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold">Getting started</h2>
        <ul className="mt-2 space-y-2">
          {items.map((i) => (
            <li key={i.k} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${i.done ? "text-primary" : "text-muted-foreground/40"}`} />{i.label}{i.note && <span className="text-muted-foreground">({i.note})</span>}</span>
              {i.manual && isManager && <Switch checked={i.done} onCheckedChange={(v) => toggleChecklist(i.k, v)} aria-label={i.label} />}
            </li>
          ))}
        </ul>
      </section>

      {isManager && (
        <>
          <section className="rounded-2xl border border-border p-4">
            <h2 className="mb-3 font-semibold">Shop profile</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Shop name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} />
              <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
              <div className="sm:col-span-2"><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.show_address} onCheckedChange={(v) => setForm({ ...form, show_address: v })} />Show address on my page</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.show_website} onCheckedChange={(v) => setForm({ ...form, show_website: v })} />Show website link on my page</label>
              <div><Label>Buy offer (% of market value)</Label><Input type="number" min={1} max={100} value={form.buy_offer_pct} onChange={(e) => setForm({ ...form, buy_offer_pct: Number(e.target.value) })} /></div>
              <div>
                <Label>Logo</Label>
                <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm">
                  {busy === "logo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{shop.logo_path ? "Replace logo" : "Upload logo"}
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                </label>
              </div>
            </div>
            <Button className="mt-4" onClick={save} disabled={busy === "save"}>Save profile</Button>
          </section>

          <section className="rounded-2xl border border-border p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4" />Staff</h2>
            <p className="text-sm text-muted-foreground">Staff create a free account with the email you add here, then open mycollectai.com/partner. They get Pro free while the shop is live.</p>
            <ul className="mt-3 divide-y divide-border text-sm">
              {staff.map((s) => <li key={s.id} className="flex justify-between py-2"><span className="font-mono text-xs">{s.user_id === userId ? "You" : s.user_id.slice(0, 8)}</span><Badge variant="secondary">{s.role}</Badge></li>)}
              {invites.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{i.email}</span><Badge variant="outline">invited</Badge></li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input className="max-w-xs" type="email" placeholder="staff@email.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              {canRun && (
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "staff" | "owner")}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="staff">Staff</SelectItem><SelectItem value="owner">Owner</SelectItem></SelectContent>
                </Select>
              )}
              <Button onClick={invite} disabled={!inviteEmail}><UserPlus className="mr-1 h-4 w-4" />Invite</Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl font-bold font-numeric">{value ?? "–"}</p></div>;
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><Label>{label}</Label><Input value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}
