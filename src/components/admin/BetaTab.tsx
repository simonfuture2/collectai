import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, Sparkles, Lock, Unlock, CalendarPlus, Ban, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

export interface BetaUserRow {
  user_id: string;
  plan: string;
  stripe_subscription_id: string | null;
  beta_access_until: string | null;
  beta_eligible: boolean | null;
  beta_price_locked_at: string | null;
}

interface BetaTabProps {
  users: BetaUserRow[];
  getProfile: (userId: string) => { email: string | null; display_name: string | null } | undefined;
  onRefresh: () => void;
}

type Filter = "all" | "active" | "expired" | "locked";

const daysLeft = (iso: string | null) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)) : 0;

const isActive = (iso: string | null) => !!iso && new Date(iso).getTime() > Date.now();

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function BetaTab({ users, getProfile, onRefresh }: BetaTabProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [grantDialog, setGrantDialog] = useState<{ open: boolean; userId: string; email: string }>({
    open: false, userId: "", email: "",
  });
  const [duration, setDuration] = useState("30");
  const [customDate, setCustomDate] = useState("");

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      const p = getProfile(u.user_id);
      const matchesSearch =
        !term ||
        p?.email?.toLowerCase().includes(term) ||
        p?.display_name?.toLowerCase().includes(term);
      if (!matchesSearch) return false;
      const active = isActive(u.beta_access_until);
      if (filter === "active") return active;
      if (filter === "expired") return !!u.beta_access_until && !active;
      if (filter === "locked") return !!u.beta_price_locked_at;
      return true;
    });
  }, [users, search, filter, getProfile]);

  const stats = useMemo(() => ({
    active: users.filter((u) => isActive(u.beta_access_until)).length,
    expired: users.filter((u) => !!u.beta_access_until && !isActive(u.beta_access_until)).length,
    locked: users.filter((u) => !!u.beta_price_locked_at).length,
  }), [users]);

  const call = async (key: string, body: Record<string, unknown>, successMsg: string) => {
    setBusy(key);
    try {
      const { data, error } = await supabase.functions.invoke("admin-data", { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(successMsg);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const submitGrant = async () => {
    let endsAt: string;
    if (duration === "custom") {
      if (!customDate) {
        toast.error("Pick an end date");
        return;
      }
      const d = new Date(`${customDate}T23:59:59`);
      if (Number.isNaN(d.getTime())) {
        toast.error("Invalid date");
        return;
      }
      endsAt = d.toISOString();
    } else {
      endsAt = new Date(Date.now() + Number(duration) * 86400000).toISOString();
    }
    await call(
      `grant-${grantDialog.userId}`,
      { action: "set_beta_window", targetUserId: grantDialog.userId, endsAt },
      `Beta window set for ${grantDialog.email}`,
    );
    setGrantDialog({ open: false, userId: "", email: "" });
    setCustomDate("");
    setDuration("30");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active beta</CardTitle></CardHeader>
          <CardContent className="text-2xl font-display font-bold">{stats.active}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expired windows</CardTitle></CardHeader>
          <CardContent className="text-2xl font-display font-bold">{stats.expired}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Price locked</CardTitle></CardHeader>
          <CardContent className="text-2xl font-display font-bold">{stats.locked}</CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Revoking a window doesn't cancel an existing subscription or remove a discount already applied at
          checkout — that's controlled by the payment provider. Unlocking founder pricing only affects future checkouts.
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="active">Active beta</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="locked">Price locked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Beta status</TableHead>
              <TableHead>Window ends</TableHead>
              <TableHead>Founder price</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No users match this filter.
                </TableCell>
              </TableRow>
            )}
            {rows.map((u) => {
              const p = getProfile(u.user_id);
              const active = isActive(u.beta_access_until);
              const locked = !!u.beta_price_locked_at;
              const grantKey = `grant-${u.user_id}`;
              const revokeKey = `revoke-${u.user_id}`;
              const lockKey = `lock-${u.user_id}`;
              return (
                <TableRow key={u.user_id}>
                  <TableCell className="max-w-[220px]">
                    <div className="font-medium truncate">{p?.email || "—"}</div>
                    {p?.display_name && (
                      <div className="text-xs text-muted-foreground truncate">{p.display_name}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {active ? (
                      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40 gap-1">
                        <Sparkles className="w-3 h-3" /> Active · {daysLeft(u.beta_access_until)}d
                      </Badge>
                    ) : u.beta_access_until ? (
                      <Badge variant="outline">Expired</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{fmt(u.beta_access_until)}</TableCell>
                  <TableCell>
                    {locked ? (
                      <div>
                        <Badge className="bg-primary/15 text-primary border border-primary/40 gap-1">
                          <Lock className="w-3 h-3" /> Locked
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-0.5">{fmt(u.beta_price_locked_at)}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Standard</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm capitalize">{u.plan}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.stripe_subscription_id ? "Subscribed" : "No subscription"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={busy !== null}
                        onClick={() => setGrantDialog({ open: true, userId: u.user_id, email: p?.email || u.user_id })}
                      >
                        {busy === grantKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
                        {u.beta_access_until ? "Extend" : "Grant"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={busy !== null || (!u.beta_access_until && !u.beta_eligible)}
                        onClick={() =>
                          call(revokeKey, { action: "set_beta_window", targetUserId: u.user_id, endsAt: null },
                            `Beta revoked for ${p?.email || "user"}`)
                        }
                      >
                        {busy === revokeKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                        Revoke
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={busy !== null}
                        onClick={() =>
                          call(lockKey, { action: "set_price_lock", targetUserId: u.user_id, locked: !locked },
                            locked ? "Founder price unlocked" : "Founder price locked")
                        }
                      >
                        {busy === lockKey ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : locked ? (
                          <Unlock className="w-3.5 h-3.5" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                        {locked ? "Unlock" : "Lock $6.99"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={grantDialog.open} onOpenChange={(open) => setGrantDialog((s) => ({ ...s, open }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Beta window</DialogTitle>
            <DialogDescription>
              Grant or extend full Pro access for {grantDialog.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="custom">Custom end date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {duration === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="beta-end-date">End date</Label>
                <Input
                  id="beta-end-date"
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantDialog({ open: false, userId: "", email: "" })}>
              Cancel
            </Button>
            <Button onClick={submitGrant} disabled={busy !== null} className="gradient-primary">
              {busy?.startsWith("grant-") && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
              Save window
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
