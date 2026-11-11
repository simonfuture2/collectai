import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Mail, MessageSquare, Phone, StickyNote, Send, UserCheck, Ban, ListOrdered } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STAGES } from "@/lib/adminSections";
import { gmailReplyUrl } from "@/lib/agentReplies";

type Lead = Database["public"]["Tables"]["agent_leads"]["Row"];
interface Account {
  user_id: string; email: string | null; display_name: string | null; signed_up_at: string | null; signup_ref: string | null;
  plan: string; credits: number; scans: number; price_checks: number; last_active: string | null;
  purchases: { id: string; amount: number; type: string; description: string | null; created_at: string }[];
}
interface Item { id: string; kind: string; text: string | null; meta?: Record<string, unknown> | null; at: string }

const nice = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const blank = (s?: string | null) => (s && s.trim() ? s.trim() : null);
const when = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");

function iconFor(kind: string) {
  if (kind.includes("reply")) return MessageSquare;
  if (kind.includes("call")) return Phone;
  if (kind.includes("note")) return StickyNote;
  if (kind.startsWith("sequence")) return ListOrdered;
  if (kind.includes("signed_up")) return UserCheck;
  if (kind.includes("cancel") || kind.includes("failed")) return Ban;
  if (kind.includes("sms")) return Send;
  return Mail;
}

/** One view for a lead and/or an app account. Pass a leadId, a userId, or both. */
export default function PersonDrawer({ leadId, userId, onClose, onSaved }: {
  leadId?: string | null; userId?: string | null; onClose: () => void; onSaved?: () => void;
}) {
  const open = !!(leadId || userId);
  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState<Lead | null>(null);
  const [v, setV] = useState<Partial<Lead>>({});
  const [account, setAccount] = useState<Account | null>(null);
  const [timeline, setTimeline] = useState<Item[]>([]);
  const [suppressed, setSuppressed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [tagText, setTagText] = useState("");

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-data", { body: { action: "get_person", leadId, targetUserId: userId } });
    if (!error && data) {
      setLead(data.lead); setV(data.lead ?? {}); setAccount(data.account); setTimeline(data.timeline ?? []); setSuppressed(!!data.suppressed);
    } else if (leadId) {
      // Agent-only admins: lead + its activity, no account details.
      const [{ data: l }, { data: acts }] = await Promise.all([
        supabase.from("agent_leads").select("*").eq("id", leadId).maybeSingle(),
        supabase.from("agent_activities").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
      ]);
      setLead(l); setV(l ?? {}); setAccount(null);
      setTimeline((acts ?? []).map((a) => ({ id: a.id, kind: a.type, text: a.body, meta: a.meta as Record<string, unknown>, at: a.created_at })));
    }
    setLoading(false);
  }, [open, leadId, userId]);
  useEffect(() => { load(); }, [load]);

  const save = async (patch: Partial<Lead> = {}) => {
    if (!lead) return;
    const p = { ...v, ...patch };
    setBusy(true);
    const { error } = await supabase.from("agent_leads").update({
      name: blank(p.name), business_name: blank(p.business_name), email: blank(p.email), phone: blank(p.phone),
      website: blank(p.website), city: blank(p.city), state: blank(p.state), country: blank(p.country) ?? "US",
      notes: blank(p.notes), stage: p.stage, owner_id: p.owner_id ?? null, tags: p.tags ?? [],
      consent_email: !!p.consent_email, consent_sms: !!p.consent_sms, consent_source: blank(p.consent_source),
      do_not_contact: !!p.do_not_contact, next_action: blank(p.next_action), next_action_at: p.next_action_at || null,
      fit_score: p.fit_score ?? null,
    }).eq("id", lead.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setV(p); toast.success("Saved"); onSaved?.(); load();
  };

  const assignToMe = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) save({ owner_id: user.id });
  };

  const addNote = async () => {
    if (!lead || !note.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("agent_activities").insert({ lead_id: lead.id, type: noteType, body: note.trim(), rep_id: user?.id ?? null });
    if (error) { toast.error(error.message); return; }
    setNote(""); load();
  };

  const title = v.business_name || v.name || account?.display_name || v.email || account?.email || "Person";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle className="pr-6">{title}</SheetTitle></SheetHeader>
        {loading && !lead && !account ? <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-muted-foreground" /> : (
          <div className="mt-4 space-y-6">
            <div className="flex flex-wrap gap-2">
              {lead && <Badge>{nice(v.stage ?? "new")}</Badge>}
              {account && <Badge variant="secondary">{account.plan === "pro" ? "Pro" : "Free"} account</Badge>}
              {lead?.source && <Badge variant="outline">From {nice(lead.source)}</Badge>}
              {suppressed && <Badge variant="destructive">Unsubscribed</Badge>}
              {(v.tags ?? []).map((t) => <Badge key={t} variant="outline">#{t}</Badge>)}
            </div>

            {account && (
              <section className="rounded-xl border border-border p-4 space-y-2 text-sm">
                <h3 className="font-semibold">App account</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Email</span><span className="truncate">{account.email ?? "—"}</span>
                  <span className="text-muted-foreground">Plan</span><span>{account.plan}</span>
                  <span className="text-muted-foreground">Credits</span><span>{account.credits}</span>
                  <span className="text-muted-foreground">Scans saved</span><span>{account.scans}</span>
                  <span className="text-muted-foreground">Price checks</span><span>{account.price_checks}</span>
                  <span className="text-muted-foreground">Came from</span><span>{account.signup_ref || "direct"}</span>
                  <span className="text-muted-foreground">Signed up</span><span>{when(account.signed_up_at)}</span>
                  <span className="text-muted-foreground">Last active</span><span>{when(account.last_active)}</span>
                </div>
                <div>
                  <p className="text-muted-foreground mt-2">Purchases</p>
                  {account.purchases.length === 0 ? <p>None yet</p> : account.purchases.map((p) => (
                    <p key={p.id}>{new Date(p.created_at).toLocaleDateString()} · {nice(p.type)} · {p.description ?? `${p.amount} credits`}</p>
                  ))}
                </div>
              </section>
            )}

            {lead ? (
              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Stage</Label>
                    <Select value={v.stage ?? "new"} onValueChange={(x) => save({ stage: x })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LEAD_STAGES.map((s) => <SelectItem key={s} value={s}>{nice(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Owner</Label>
                    <Button variant="outline" className="w-full" onClick={assignToMe} disabled={busy}>{v.owner_id ? "Assigned · reassign to me" : "Assign to me"}</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Name</Label><Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Business</Label><Input value={v.business_name ?? ""} onChange={(e) => setV({ ...v, business_name: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Email</Label><Input value={v.email ?? ""} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Phone</Label><Input value={v.phone ?? ""} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
                  <div className="space-y-1"><Label>City</Label><Input value={v.city ?? ""} onChange={(e) => setV({ ...v, city: e.target.value })} /></div>
                  <div className="space-y-1"><Label>State</Label><Input value={v.state ?? ""} onChange={(e) => setV({ ...v, state: e.target.value })} /></div>
                  <div className="space-y-1 col-span-2"><Label>Website</Label><Input value={v.website ?? ""} onChange={(e) => setV({ ...v, website: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Next action</Label><Input value={v.next_action ?? ""} onChange={(e) => setV({ ...v, next_action: e.target.value })} placeholder="e.g. Call Tuesday" /></div>
                  <div className="space-y-1"><Label>Due</Label><Input type="date" value={(v.next_action_at ?? "").slice(0, 10)} onChange={(e) => setV({ ...v, next_action_at: e.target.value || null })} /></div>
                </div>
                <div className="space-y-1"><Label>Tags</Label>
                  <div className="flex gap-2">
                    <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Add a tag and press Enter"
                      onKeyDown={(e) => { if (e.key === "Enter" && tagText.trim()) { e.preventDefault(); setV({ ...v, tags: [...new Set([...(v.tags ?? []), tagText.trim().toLowerCase()])] }); setTagText(""); } }} />
                    {(v.tags ?? []).length > 0 && <Button variant="ghost" onClick={() => setV({ ...v, tags: [] })}>Clear</Button>}
                  </div>
                </div>
                <div className="space-y-1"><Label>Notes</Label><Textarea rows={3} value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
                <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span>Agreed to emails</span><Switch checked={!!v.consent_email} onCheckedChange={(c) => setV({ ...v, consent_email: c })} /></div>
                  <div className="flex items-center justify-between"><span>Agreed to texts</span><Switch checked={!!v.consent_sms} onCheckedChange={(c) => setV({ ...v, consent_sms: c })} /></div>
                  {v.consent_source && <p className="text-xs text-muted-foreground">Consent from: {nice(v.consent_source)}</p>}
                  <div className="flex items-center justify-between text-destructive"><span>Do not contact</span><Switch checked={!!v.do_not_contact} onCheckedChange={(c) => save({ do_not_contact: c, stage: c ? "do_not_contact" : "new" })} /></div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={busy} onClick={() => save()}>Save changes</Button>
                  {v.email && <Button variant="outline" asChild><a href={gmailReplyUrl(v.email)} target="_blank" rel="noopener noreferrer">Email <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button>}
                </div>
              </section>
            ) : <p className="text-sm text-muted-foreground">No outreach history for this person.</p>}

            {lead && (
              <section className="space-y-3">
                <h3 className="font-semibold">Timeline</h3>
                <div className="flex gap-2">
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="note">Note</SelectItem><SelectItem value="call">Call</SelectItem></SelectContent>
                  </Select>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" onKeyDown={(e) => e.key === "Enter" && addNote()} />
                  <Button onClick={addNote} disabled={!note.trim()}>Add</Button>
                </div>
                {timeline.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
                  <ol className="space-y-3 border-l border-border pl-4">
                    {timeline.map((t) => { const I = iconFor(t.kind); return (
                      <li key={`${t.kind}-${t.id}`} className="relative text-sm">
                        <I className="absolute -left-[26px] top-0.5 h-4 w-4 rounded-full bg-background text-primary" />
                        <div className="flex justify-between gap-2"><span className="font-medium">{nice(t.kind)}{t.meta?.intent ? ` · ${nice(String(t.meta.intent))}` : ""}</span>
                          <time className="text-xs text-muted-foreground shrink-0">{when(t.at)}</time></div>
                        {t.text && <p className="text-muted-foreground whitespace-pre-wrap break-words line-clamp-4">{t.text}</p>}
                      </li>); })}
                  </ol>
                )}
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
