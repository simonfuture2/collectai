import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Tpl = Database["public"]["Tables"]["email_templates"]["Row"];
export const LANE_LABEL: Record<string, string> = { cold: "Cold (inboxes)", opted_in: "Opted in (SendGrid)" };

export default function TemplatesSection() {
  const [rows, setRows] = useState<Tpl[] | null>(null);
  const [edit, setEdit] = useState<Partial<Tpl> | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("email_templates").select("*").order("updated_at", { ascending: false });
    setRows(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!edit?.name?.trim()) return toast.error("Give it a name");
    const row = { name: edit.name.trim(), lane: edit.lane ?? "cold", subject: edit.subject ?? "", body: edit.body ?? "", audience_note: edit.audience_note ?? null };
    const { error } = edit.id ? await supabase.from("email_templates").update(row).eq("id", edit.id) : await supabase.from("email_templates").insert(row);
    if (error) return toast.error(error.message);
    toast.success("Saved"); setEdit(null); load();
  };
  if (!rows) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-2">
        <Button onClick={() => setEdit({ lane: "cold", subject: "", body: "Hi {{first_name|there}},\n\n\n\n{{rep_name}}" })} className="gap-1"><Plus className="h-4 w-4" />New template</Button>
        <div className="divide-y divide-border rounded-xl border border-border">
          {rows.map((t) => (
            <button key={t.id} onClick={() => setEdit(t)} className={`w-full p-3 text-left hover:bg-muted/50 ${edit?.id === t.id ? "bg-muted/60" : ""}`}>
              <div className="flex justify-between gap-2"><span className="font-medium truncate">{t.name}</span><Badge variant={t.lane === "cold" ? "secondary" : "outline"} className="shrink-0">{LANE_LABEL[t.lane]}</Badge></div>
              <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
            </button>
          ))}
        </div>
      </div>
      {edit ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Name</Label><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Lane</Label>
              <Select value={edit.lane ?? "cold"} onValueChange={(v) => setEdit({ ...edit, lane: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cold">{LANE_LABEL.cold}</SelectItem><SelectItem value="opted_in">{LANE_LABEL.opted_in}</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Subject</Label><Input value={edit.subject ?? ""} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></div>
          <div className="space-y-1"><Label>Body (plain text)</Label><Textarea rows={16} className="font-mono text-sm" value={edit.body ?? ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">Merge fields: {"{{first_name|there}} {{business_name}} {{city}} {{ref_link}} {{rep_name}} {{unsubscribe_url}} {{mailing_address}}"}. Text after | is used when the field is empty. The footer with your address and an unsubscribe link is added automatically. Cold emails can have one link at most.</p>
          <div className="space-y-1"><Label>Audience note</Label><Input value={edit.audience_note ?? ""} onChange={(e) => setEdit({ ...edit, audience_note: e.target.value })} /></div>
          <div className="flex gap-2"><Button onClick={save}>Save</Button><Button variant="ghost" onClick={() => setEdit(null)}>Close</Button></div>
        </div>
      ) : <p className="text-muted-foreground">Pick a template to edit.</p>}
    </div>
  );
}
