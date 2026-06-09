import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Shield, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface AdminRow {
  user_id: string;
  email: string | null;
  granted_at: string;
  is_self: boolean;
}

const AdminsTab = () => {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-data", {
      body: { action: "list_admins" },
    });
    if (error) toast.error("Failed to load admins");
    else setAdmins(data?.admins || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("admin-data", {
      body: { action: "grant_admin", email: trimmed },
    });
    setAdding(false);
    if (error) {
      const msg = (error as any)?.context?.error || (error as any)?.message || "Failed to add admin";
      toast.error(msg);
      return;
    }
    if (data?.alreadyAdmin) toast.info("That user is already an admin");
    else toast.success(`Granted admin to ${trimmed}`);
    setEmail("");
    load();
  };

  const handleRevoke = async (row: AdminRow) => {
    if (row.is_self) { toast.error("You cannot revoke your own admin access"); return; }
    if (!confirm(`Revoke admin access for ${row.email || row.user_id}?`)) return;
    setRevoking(row.user_id);
    const { error } = await supabase.functions.invoke("admin-data", {
      body: { action: "revoke_admin", targetUserId: row.user_id },
    });
    setRevoking(null);
    if (error) { toast.error("Failed to revoke admin"); return; }
    toast.success("Admin access revoked");
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Admin Accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs text-muted-foreground mb-1 block">Add admin by email</label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={adding || !email.trim()} className="gradient-primary">
            <UserPlus className="w-4 h-4 mr-1" />
            {adding ? "Adding..." : "Grant Admin"}
          </Button>
        </form>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No admins yet</TableCell>
                  </TableRow>
                ) : admins.map((a) => (
                  <TableRow key={a.user_id}>
                    <TableCell className="font-medium">
                      {a.email || <span className="text-muted-foreground">unknown</span>}
                      {a.is_self && <Badge variant="secondary" className="ml-2 text-xs">You</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{a.user_id.slice(0, 8)}…</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(a.granted_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Revoke admin"
                        disabled={a.is_self || revoking === a.user_id}
                        onClick={() => handleRevoke(a)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminsTab;
