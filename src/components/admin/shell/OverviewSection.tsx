import LeadRunCard from "./LeadRunCard";
import DeliverabilityBanner from "./DeliverabilityBanner";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Overview {
  emails_sent: number; email_capacity: number; replies_waiting: number; interested_today: number; meetings_booked: number;
  new_leads: number; new_signups: number; outreach_signups: number; pro_upgrades: number; credit_purchases: number;
  drafts_pending: number; failed_sends: number; failed_emails_24h: number; last_email_error: string | null; suppressed_total: number;
  week: { day: string; sent: number; replies: number; signups: number }[];
}

export default function OverviewSection({ go }: { go: (section: string) => void }) {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cold, setCold] = useState<{ capacity: number; used: number; inboxes: number } | null>(null);
  useEffect(() => {
    supabase.rpc("cold_capacity_today").then(({ data }) => setCold(data as unknown as { capacity: number; used: number; inboxes: number }));
    supabase.rpc("admin_overview").then(({ data, error }) => {
      if (error) setErr(error.message); else setD(data as unknown as Overview);
    });
  }, []);
  if (err) return <p className="text-destructive">Couldn't load overview: {err}</p>;
  if (!d) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;

  const tiles: { label: string; value: string | number; go?: string }[] = [
    { label: "Emails sent / capacity", value: `${d.emails_sent} / ${d.email_capacity}`, go: "broadcasts" },
    { label: "Cold capacity today", value: cold ? `${cold.used} / ${cold.capacity}` : "…", go: "channels" },
    { label: "Replies waiting", value: d.replies_waiting, go: "inbox" },
    { label: "Interested replies", value: d.interested_today, go: "inbox" },
    { label: "Meetings booked", value: d.meetings_booked, go: "leads" },
    { label: "New leads", value: d.new_leads, go: "leads" },
    { label: "New sign-ups", value: d.new_signups, go: "users" },
    { label: "Sign-ups from outreach", value: d.outreach_signups, go: "funnel" },
    { label: "Pro upgrades", value: d.pro_upgrades, go: "transactions" },
    { label: "Credit purchases", value: d.credit_purchases, go: "transactions" },
  ];
  const needs: { text: string; go: string; warn?: boolean }[] = [];
  if (cold && cold.inboxes === 0) needs.push({ text: "No cold inboxes yet, so cold emails are paused. Add them in Channels.", go: "channels", warn: true });
  if (d.drafts_pending) needs.push({ text: `${d.drafts_pending} drafts waiting for your approval`, go: "inbox" });
  if (d.replies_waiting) needs.push({ text: `${d.replies_waiting} interested or question replies to answer`, go: "inbox" });
  if (d.failed_sends) needs.push({ text: `${d.failed_sends} outreach messages failed this week`, go: "inbox", warn: true });
  if (d.failed_emails_24h) needs.push({ text: `${d.failed_emails_24h} emails failed in the last 24 h${d.last_email_error ? ` — ${d.last_email_error.slice(0, 120)}` : ""}`, go: "broadcasts", warn: true });

  return (
    <div className="space-y-6">
      <DeliverabilityBanner go={go} />
      <div>
        <h2 className="text-lg font-semibold mb-3">Today</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tiles.map((t) => (
            <button key={t.label} onClick={() => t.go && go(t.go)} className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/60 transition-colors">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="text-2xl font-bold mt-1">{t.value}</p>
            </button>
          ))}
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Needs you</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {needs.length === 0 ? <p className="text-sm text-muted-foreground">All clear.</p> : needs.map((n) => (
            <Button key={n.text} variant="outline" onClick={() => go(n.go)} className={`h-auto w-full justify-start whitespace-normal text-left py-3 ${n.warn ? "border-destructive/50 text-destructive" : ""}`}>
              {n.warn && <AlertTriangle className="h-4 w-4 mr-2 shrink-0" />}{n.text}
            </Button>
          ))}
        </CardContent>
      </Card>
      <LeadRunCard />
      <Card>
        <CardHeader><CardTitle className="text-base">Last 7 days</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={(d.week ?? []).map((w) => ({ ...w, day: w.day.slice(5) }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Legend />
              <Bar dataKey="sent" name="Emails sent" fill="hsl(var(--primary))" />
              <Bar dataKey="replies" name="Replies" fill="hsl(var(--secondary))" />
              <Bar dataKey="signups" name="Sign-ups" fill="hsl(var(--muted-foreground))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
