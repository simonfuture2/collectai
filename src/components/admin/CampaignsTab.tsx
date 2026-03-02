import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Megaphone, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  created_at: string;
}

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  sent_count: number;
  created_at: string;
}

const CampaignsTab = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Template dialog
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [tForm, setTForm] = useState({ name: "", channel: "email" as string, subject: "", body: "" });

  // Bulk send dialog
  const [bulkDialog, setBulkDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [tRes, cRes, lRes] = await Promise.all([
      supabase.from("campaign_templates").select("*").order("created_at", { ascending: false }),
      supabase.from("outreach_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("leads").select("id, name, email, phone, status").order("name"),
    ]);
    if (tRes.data) setTemplates(tRes.data as Template[]);
    if (cRes.data) setCampaigns(cRes.data as Campaign[]);
    if (lRes.data) setLeads(lRes.data as Lead[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveTemplate = async () => {
    if (!tForm.name || !tForm.body) { toast.error("Name and body required"); return; }
    setActionLoading(true);
    if (editTemplate) {
      const { error } = await supabase.from("campaign_templates").update({
        name: tForm.name, channel: tForm.channel as any, subject: tForm.subject || null, body: tForm.body,
      }).eq("id", editTemplate.id);
      if (error) { toast.error("Failed to update"); setActionLoading(false); return; }
      toast.success("Template updated");
    } else {
      const { error } = await supabase.from("campaign_templates").insert({
        name: tForm.name, channel: tForm.channel as any, subject: tForm.subject || null, body: tForm.body,
      });
      if (error) { toast.error("Failed to create"); setActionLoading(false); return; }
      toast.success("Template created");
    }
    setActionLoading(false);
    setTemplateDialog(false);
    setEditTemplate(null);
    setTForm({ name: "", channel: "email", subject: "", body: "" });
    fetchData();
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await supabase.from("campaign_templates").delete().eq("id", id);
    toast.success("Template deleted");
    fetchData();
  };

  const openEditTemplate = (t: Template) => {
    setEditTemplate(t);
    setTForm({ name: t.name, channel: t.channel, subject: t.subject || "", body: t.body });
    setTemplateDialog(true);
  };

  const handleBulkSend = async () => {
    if (!selectedTemplate || selectedLeads.length === 0) { toast.error("Select a template and at least one lead"); return; }
    setActionLoading(true);
    const { data, error } = await supabase.functions.invoke("campaign-outreach", {
      body: { action: "bulk_send", template_id: selectedTemplate, lead_ids: selectedLeads, campaign_name: campaignName },
    });
    setActionLoading(false);
    if (error) { toast.error("Bulk send failed"); return; }
    toast.success(`Sent to ${data.sent_count} leads${data.errors?.length ? ` (${data.errors.length} failed)` : ""}`);
    setBulkDialog(false);
    setSelectedLeads([]);
    setCampaignName("");
    fetchData();
  };

  const toggleLead = (id: string) => {
    setSelectedLeads((prev) => prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]);
  };

  const selectableLeads = selectedTemplate
    ? leads.filter((l) => {
        const tmpl = templates.find((t) => t.id === selectedTemplate);
        return tmpl?.channel === "email" ? !!l.email : !!l.phone;
      })
    : leads;

  return (
    <div className="space-y-6">
      {/* Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5" /> Campaign Templates</CardTitle>
            <Button size="sm" onClick={() => { setEditTemplate(null); setTForm({ name: "", channel: "email", subject: "", body: "" }); setTemplateDialog(true); }}>
              <Plus className="w-4 h-4 mr-1" /> New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : templates.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No templates yet. Create one to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{t.channel}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm truncate max-w-[200px]">{t.subject || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEditTemplate(t)}>Edit</Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteTemplate(t.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bulk Send + Campaign History */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Send className="w-4 h-4" /> Bulk Send</CardTitle>
            <CardDescription>Send a campaign template to multiple leads at once.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setBulkDialog(true)} disabled={templates.length === 0}>
              <Send className="w-4 h-4 mr-2" /> Start Bulk Campaign
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Campaign History</CardTitle>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns sent yet.</p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                    <span className="font-medium">{c.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">{c.status}</Badge>
                      <span className="text-muted-foreground text-xs">{c.sent_count} sent</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Template Dialog */}
      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTemplate ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>Placeholders: {"{{name}}"}, {"{{email}}"}, {"{{company}}"}, {"{{partner_code}}"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder="Template name" /></div>
            <div>
              <Label>Channel</Label>
              <Select value={tForm.channel} onValueChange={(v) => setTForm({ ...tForm, channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tForm.channel === "email" && (
              <div><Label>Subject</Label><Input value={tForm.subject} onChange={(e) => setTForm({ ...tForm, subject: e.target.value })} placeholder="Email subject line" /></div>
            )}
            <div><Label>Body {tForm.channel === "email" ? "(HTML)" : ""}</Label><Textarea value={tForm.body} onChange={(e) => setTForm({ ...tForm, body: e.target.value })} rows={6} placeholder={tForm.channel === "email" ? "<p>Hi {{name}},...</p>" : "Hi {{name}}, ..."} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={actionLoading}>{actionLoading ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Send Dialog */}
      <Dialog open={bulkDialog} onOpenChange={setBulkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Campaign</DialogTitle>
            <DialogDescription>Select a template and choose leads to send to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Campaign Name</Label><Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. March Partner Outreach" /></div>
            <div>
              <Label>Template</Label>
              <Select value={selectedTemplate} onValueChange={(v) => { setSelectedTemplate(v); setSelectedLeads([]); }}>
                <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.channel})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedTemplate && (
              <div>
                <Label>Select Leads ({selectedLeads.length} selected)</Label>
                <div className="border rounded max-h-48 overflow-y-auto mt-1 divide-y">
                  {selectableLeads.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox checked={selectedLeads.includes(l.id)} onCheckedChange={() => toggleLead(l.id)} />
                      <span>{l.name}</span>
                      <span className="text-muted-foreground text-xs ml-auto">{l.email || l.phone}</span>
                    </label>
                  ))}
                </div>
                {selectableLeads.length > 0 && (
                  <Button variant="link" size="sm" className="text-xs p-0 h-auto mt-1" onClick={() => setSelectedLeads(selectableLeads.map((l) => l.id))}>
                    Select all ({selectableLeads.length})
                  </Button>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkSend} disabled={actionLoading || selectedLeads.length === 0}>
              {actionLoading ? "Sending..." : `Send to ${selectedLeads.length} leads`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CampaignsTab;
