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
import { Progress } from "@/components/ui/progress";
import { Megaphone, Plus, Send, Trash2, Mail, Clock, CheckCircle2 } from "lucide-react";
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

interface DripItem {
  id: string;
  lead_id: string;
  step: number;
  subject: string;
  scheduled_for: string;
  sent: boolean;
  sent_at: string | null;
  lead_name?: string;
  lead_email?: string;
}

const CampaignsTab = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Drip campaign state
  const [dripItems, setDripItems] = useState<DripItem[]>([]);
  const [dripStats, setDripStats] = useState({ total: 0, sent: 0, pending: 0, uniqueLeads: 0 });
  const [dripLoading, setDripLoading] = useState(true);

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

  const fetchDripData = useCallback(async () => {
    setDripLoading(true);
    const { data, error } = await (supabase as any)
      .from("drip_campaign_queue")
      .select("*")
      .order("scheduled_for", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Drip fetch error:", error);
      setDripLoading(false);
      return;
    }

    const items = data || [];
    const sentCount = items.filter((i: any) => i.sent).length;
    const pendingCount = items.filter((i: any) => !i.sent).length;
    const uniqueLeads = new Set(items.map((i: any) => i.lead_id)).size;

    // Enrich with lead info
    if (items.length > 0) {
      const leadIds = [...new Set(items.map((i: any) => i.lead_id))];
      const { data: leadsData } = await supabase
        .from("leads")
        .select("id, name, email")
        .in("id", leadIds as string[]);

      const leadMap = new Map((leadsData || []).map((l: any) => [l.id, l]));
      items.forEach((item: any) => {
        const lead = leadMap.get(item.lead_id);
        item.lead_name = lead?.name || "Unknown";
        item.lead_email = lead?.email || "—";
      });
    }

    setDripItems(items);
    setDripStats({ total: items.length, sent: sentCount, pending: pendingCount, uniqueLeads });
    setDripLoading(false);
  }, []);

  useEffect(() => { fetchData(); fetchDripData(); }, [fetchData, fetchDripData]);

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

  const handleCancelDripForLead = async (leadId: string) => {
    if (!confirm("Cancel all pending drip emails for this lead?")) return;
    const { error } = await (supabase as any)
      .from("drip_campaign_queue")
      .delete()
      .eq("lead_id", leadId)
      .eq("sent", false);
    if (error) { toast.error("Failed to cancel"); return; }
    toast.success("Pending drip emails cancelled");
    fetchDripData();
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

  // Group drip items by lead for display
  const dripByLead = dripItems.reduce<Record<string, DripItem[]>>((acc, item) => {
    if (!acc[item.lead_id]) acc[item.lead_id] = [];
    acc[item.lead_id].push(item);
    return acc;
  }, {});

  const progressPercent = dripStats.total > 0 ? Math.round((dripStats.sent / dripStats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Drip Campaign Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Drip Campaign</CardTitle>
            <Badge variant="outline" className="text-xs">9-Email Sequence</Badge>
          </div>
          <CardDescription>Automated email sequence for leads who download the free guide. Sends on days 1, 3, 4, 6, 8, 10, 11, 13, 15.</CardDescription>
        </CardHeader>
        <CardContent>
          {dripLoading ? (
            <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{dripStats.uniqueLeads}</p>
                  <p className="text-xs text-muted-foreground">Leads in Sequence</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{dripStats.sent}</p>
                  <p className="text-xs text-muted-foreground">Emails Sent</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{dripStats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{progressPercent}%</p>
                  <p className="text-xs text-muted-foreground">Complete</p>
                </div>
              </div>

              <Progress value={progressPercent} className="h-2" />

              {/* Recent drip activity by lead */}
              {Object.keys(dripByLead).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No leads in drip sequence yet. They'll appear after someone downloads the free guide.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {Object.entries(dripByLead).slice(0, 20).map(([leadId, items]) => {
                    const sentSteps = items.filter((i) => i.sent).length;
                    const totalSteps = items.length;
                    const leadName = items[0]?.lead_name || "Unknown";
                    const leadEmail = items[0]?.lead_email || "—";
                    return (
                      <div key={leadId} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{leadName}</p>
                          <p className="text-xs text-muted-foreground truncate">{leadEmail}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            <span>{sentSteps}/{totalSteps}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{totalSteps - sentSteps} left</span>
                          </div>
                          {totalSteps - sentSteps > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => handleCancelDripForLead(leadId)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
