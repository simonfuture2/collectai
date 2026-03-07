import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, UserPlus, Mail, MessageSquare, Tag, ChevronDown, ChevronRight, Clock, StickyNote } from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  status: string;
  partner_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  lead_id: string;
  type: string;
  content: string | null;
  created_at: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string;
}

const STATUS_OPTIONS = ["new", "contacted", "interested", "converted", "lost"] as const;

const statusColor: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-600 border-blue-200",
  contacted: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  interested: "bg-purple-500/10 text-purple-600 border-purple-200",
  converted: "bg-green-500/10 text-green-600 border-green-200",
  lost: "bg-red-500/10 text-red-600 border-red-200",
};

const LeadsTab = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [activities, setActivities] = useState<Record<string, Activity[]>>({});

  // Dialogs
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; leadId: string; leadName: string }>({ open: false, leadId: "", leadName: "" });
  const [smsDialog, setSmsDialog] = useState<{ open: boolean; leadId: string; leadName: string }>({ open: false, leadId: "", leadName: "" });
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; leadId: string }>({ open: false, leadId: "" });
  const [addLeadDialog, setAddLeadDialog] = useState(false);
  const [emailForm, setEmailForm] = useState({ subject: "", body: "" });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [smsForm, setSmsForm] = useState({ body: "" });
  const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState<string>("");
  const [noteContent, setNoteContent] = useState("");
  const [newLead, setNewLead] = useState({ name: "", email: "", phone: "", company: "", notes: "" });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const [leadsRes, templatesRes] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("campaign_templates").select("id, name, subject, body").eq("channel", "email" as any).order("name"),
    ]);
    if (!leadsRes.error && leadsRes.data) setLeads(leadsRes.data as Lead[]);
    if (!templatesRes.error && templatesRes.data) setEmailTemplates(templatesRes.data as EmailTemplate[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const fetchActivities = async (leadId: string) => {
    const { data } = await supabase.from("lead_activities").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(20);
    if (data) setActivities((prev) => ({ ...prev, [leadId]: data as Activity[] }));
  };

  const toggleExpand = (leadId: string) => {
    if (expandedLead === leadId) {
      setExpandedLead(null);
    } else {
      setExpandedLead(leadId);
      if (!activities[leadId]) fetchActivities(leadId);
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    const { error } = await supabase.from("leads").update({ status: newStatus as any }).eq("id", leadId);
    if (error) { toast.error("Failed to update status"); return; }

    await supabase.from("lead_activities").insert({
      lead_id: leadId, type: "status_change", content: `Status changed to ${newStatus}`,
    });

    toast.success(`Status updated to ${newStatus}`);
    fetchLeads();
    fetchActivities(leadId);
  };

  const handleSendEmail = async () => {
    if (!emailForm.subject || !emailForm.body) { toast.error("Subject and body required"); return; }
    setActionLoading(true);
    const { error } = await supabase.functions.invoke("campaign-outreach", {
      body: { action: "send_email", lead_id: emailDialog.leadId, ...emailForm },
    });
    setActionLoading(false);
    if (error) { toast.error("Failed to send email"); return; }
    toast.success("Email sent!");
    setEmailDialog({ open: false, leadId: "", leadName: "" });
    setEmailForm({ subject: "", body: "" });
    if (expandedLead === emailDialog.leadId) fetchActivities(emailDialog.leadId);
  };

  const handleSendSMS = async () => {
    if (!smsForm.body) { toast.error("Message required"); return; }
    setActionLoading(true);
    const { error } = await supabase.functions.invoke("campaign-outreach", {
      body: { action: "send_sms", lead_id: smsDialog.leadId, ...smsForm },
    });
    setActionLoading(false);
    if (error) { toast.error("Failed to send SMS"); return; }
    toast.success("SMS sent!");
    setSmsDialog({ open: false, leadId: "", leadName: "" });
    setSmsForm({ body: "" });
    if (expandedLead === smsDialog.leadId) fetchActivities(smsDialog.leadId);
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    await supabase.from("lead_activities").insert({
      lead_id: noteDialog.leadId, type: "note", content: noteContent.trim(),
    });
    toast.success("Note added");
    setNoteDialog({ open: false, leadId: "" });
    setNoteContent("");
    fetchActivities(noteDialog.leadId);
  };

  const handleGenerateCode = async (leadId: string) => {
    setActionLoading(true);
    const { data, error } = await supabase.functions.invoke("campaign-outreach", {
      body: { action: "generate_partner_code", lead_id: leadId },
    });
    setActionLoading(false);
    if (error) { toast.error("Failed to generate code"); return; }
    toast.success(`Partner code: ${data.partner_code}`);
    fetchLeads();
    if (expandedLead === leadId) fetchActivities(leadId);
  };

  const handleAddLead = async () => {
    if (!newLead.name.trim()) { toast.error("Name is required"); return; }
    setActionLoading(true);
    const { error } = await supabase.from("leads").insert({
      name: newLead.name.trim(), email: newLead.email.trim() || null,
      phone: newLead.phone.trim() || null, company: newLead.company.trim() || null,
      notes: newLead.notes.trim() || null, source: "manual", status: "new",
    });
    setActionLoading(false);
    if (error) { toast.error("Failed to add lead"); return; }
    toast.success("Lead added");
    setAddLeadDialog(false);
    setNewLead({ name: "", email: "", phone: "", company: "", notes: "" });
    fetchLeads();
  };

  const filtered = leads.filter((l) => {
    const matchesSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) || l.company?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> Leads ({leads.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button size="sm" onClick={() => setAddLeadDialog(true)}><UserPlus className="w-4 h-4 mr-1" /> Add Lead</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No leads found</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((lead) => (
                <Collapsible key={lead.id} open={expandedLead === lead.id} onOpenChange={() => toggleExpand(lead.id)}>
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          {expandedLead === lead.id ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{lead.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{lead.email || "No email"} {lead.company && `• ${lead.company}`}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {lead.partner_code && <Badge variant="outline" className="text-xs">{lead.partner_code}</Badge>}
                          <Badge className={`text-xs capitalize ${statusColor[lead.status] || ""}`}>{lead.status}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t px-4 py-3 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Select value={lead.status} onValueChange={(v) => handleStatusChange(lead.id, v)}>
                            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize text-xs">{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {lead.email && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEmailDialog({ open: true, leadId: lead.id, leadName: lead.name })}>
                              <Mail className="w-3 h-3 mr-1" /> Email
                            </Button>
                          )}
                          {lead.phone && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSmsDialog({ open: true, leadId: lead.id, leadName: lead.name })}>
                              <MessageSquare className="w-3 h-3 mr-1" /> SMS
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setNoteDialog({ open: true, leadId: lead.id })}>
                            <StickyNote className="w-3 h-3 mr-1" /> Note
                          </Button>
                          {!lead.partner_code && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleGenerateCode(lead.id)} disabled={actionLoading}>
                              <Tag className="w-3 h-3 mr-1" /> Generate Code
                            </Button>
                          )}
                        </div>
                        {lead.notes && <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">{lead.notes}</p>}

                        {/* Activity Timeline */}
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Activity</p>
                          {activities[lead.id]?.length ? (
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {activities[lead.id].map((a) => (
                                <div key={a.id} className="flex items-start gap-2 text-xs p-1.5 rounded bg-muted/30">
                                  <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{a.type.replace("_", " ")}</Badge>
                                  <span className="text-muted-foreground truncate flex-1">{a.content || "—"}</span>
                                  <span className="text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No activity yet</p>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Dialog */}
      <Dialog open={emailDialog.open} onOpenChange={(o) => { if (!o) { setEmailDialog({ ...emailDialog, open: false }); setSelectedTemplateId(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Email to {emailDialog.leadName}</DialogTitle>
            <DialogDescription>Select a template or write a custom email. Placeholders: {"{{name}}"}, {"{{email}}"}, {"{{company}}"}, {"{{partner_code}}"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Template</Label>
              <Select value={selectedTemplateId} onValueChange={(v) => {
                setSelectedTemplateId(v);
                if (v === "custom") {
                  setEmailForm({ subject: "", body: "" });
                } else {
                  const tmpl = emailTemplates.find((t) => t.id === v);
                  if (tmpl) setEmailForm({ subject: tmpl.subject || "", body: tmpl.body });
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">✏️ Custom Email</SelectItem>
                  {emailTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Subject</Label><Input value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} placeholder="Email subject" /></div>
            <div><Label>Body (HTML)</Label><Textarea value={emailForm.body} onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })} rows={6} placeholder="<p>Hi {{name}},...</p>" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEmailDialog({ ...emailDialog, open: false }); setSelectedTemplateId(""); }}>Cancel</Button>
            <Button onClick={handleSendEmail} disabled={actionLoading}>{actionLoading ? "Sending..." : "Send Email"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Dialog */}
      <Dialog open={smsDialog.open} onOpenChange={(o) => !o && setSmsDialog({ ...smsDialog, open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send SMS to {smsDialog.leadName}</DialogTitle>
            <DialogDescription>Placeholders: {"{{name}}"}, {"{{company}}"}, {"{{partner_code}}"}</DialogDescription>
          </DialogHeader>
          <div><Label>Message</Label><Textarea value={smsForm.body} onChange={(e) => setSmsForm({ body: e.target.value })} rows={4} placeholder="Hi {{name}}, ..." /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsDialog({ ...smsDialog, open: false })}>Cancel</Button>
            <Button onClick={handleSendSMS} disabled={actionLoading}>{actionLoading ? "Sending..." : "Send SMS"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={noteDialog.open} onOpenChange={(o) => !o && setNoteDialog({ ...noteDialog, open: false })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
          <Textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={4} placeholder="Enter note..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog({ ...noteDialog, open: false })}>Cancel</Button>
            <Button onClick={handleAddNote}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Lead Dialog */}
      <Dialog open={addLeadDialog} onOpenChange={setAddLeadDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Lead Manually</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} placeholder="Full name" /></div>
            <div><Label>Email</Label><Input type="email" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} placeholder="email@example.com" /></div>
            <div><Label>Phone</Label><Input value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} placeholder="+1 555 000 0000" /></div>
            <div><Label>Company</Label><Input value={newLead.company} onChange={(e) => setNewLead({ ...newLead, company: e.target.value })} placeholder="Company name" /></div>
            <div><Label>Notes</Label><Textarea value={newLead.notes} onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLeadDialog(false)}>Cancel</Button>
            <Button onClick={handleAddLead} disabled={actionLoading}>{actionLoading ? "Adding..." : "Add Lead"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LeadsTab;
