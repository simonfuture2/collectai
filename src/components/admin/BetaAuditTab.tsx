import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, RefreshCw, ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface AuditEntry {
  id: string;
  created_at: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  target_id: string;
  target_email: string | null;
  description: string;
}

const ACTION_LABELS: Record<string, string> = {
  admin_beta_grant: "Beta granted",
  admin_beta_revoke: "Beta revoked",
  admin_price_lock: "Price locked",
  admin_price_unlock: "Price unlocked",
};

const PAGE_SIZE = 15;

const BetaAuditTab = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-data", {
      body: { action: "get_beta_audit" },
    });
    if (error) toast.error("Failed to load audit log");
    else setEntries(data?.entries || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 86_400_000 : null;
    return entries.filter((e) => {
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      const ts = new Date(e.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts >= toTs) return false;
      if (!term) return true;
      return [e.actor_email, e.actor_id, e.target_email, e.target_id, e.description]
        .some((v) => v?.toLowerCase().includes(term));
    });
  }, [entries, search, actionFilter, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [search, actionFilter, from, to]);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = ["timestamp", "action", "actor_email", "actor_id", "target_email", "target_id", "description"];
    const lines = filtered.map((e) =>
      [
        new Date(e.created_at).toISOString(),
        ACTION_LABELS[e.action] || e.action,
        e.actor_email,
        e.actor_id,
        e.target_email,
        e.target_id,
        e.description,
      ].map(esc).join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beta-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5" /> Beta Eligibility Audit Log
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAudit} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Search</Label>
            <Input placeholder="Actor or target email / id" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Action</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {Object.entries(ACTION_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No audit entries found</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.action.includes("revoke") || e.action.includes("unlock") ? "destructive" : "default"} className="text-xs">
                          {ACTION_LABELS[e.action] || e.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{e.actor_email || e.actor_id?.slice(0, 8) || "—"}</TableCell>
                      <TableCell className="text-sm">{e.target_email || e.target_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={e.description}>
                        {e.description || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages} ({filtered.length} entries)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BetaAuditTab;
