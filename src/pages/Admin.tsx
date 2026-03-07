import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import collectaiLogo from "@/assets/collectai-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Users, CreditCard, Activity, Search, Crown, Coins,
  BarChart3, ImageIcon, TrendingUp, Plus, Minus, Settings, Trash2, RefreshCw,
  UserPlus, Megaphone, ChevronLeft, ChevronRight,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import LeadsTab from "@/components/admin/LeadsTab";
import CampaignsTab from "@/components/admin/CampaignsTab";
import PushNotificationsTab from "@/components/admin/PushNotificationsTab";
import { toast } from "sonner";

interface UserCredit {
  id: string;
  user_id: string;
  credits: number;
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
}

interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

interface DashboardStats {
  totalCards: number;
  totalScans: number;
  totalRevenue: number;
}

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [users, setUsers] = useState<UserCredit[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ totalCards: 0, totalScans: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const [txPage, setTxPage] = useState(0);

  // Credit adjustment dialog
  const [creditDialog, setCreditDialog] = useState<{ open: boolean; userId: string; email: string; currentCredits: number }>({
    open: false, userId: "", email: "", currentCredits: 0,
  });
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditMode, setCreditMode] = useState<"add" | "set">("add");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) navigate("/dashboard");
  }, [isAdmin, adminLoading, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-data", {
      body: { action: "get_dashboard" },
    });
    if (!error && data) {
      setUsers(data.users || []);
      setProfiles(data.profiles || []);
      setTransactions(data.transactions || []);
      setStats(data.stats || { totalCards: 0, totalScans: 0, totalRevenue: 0 });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  const getProfile = (userId: string) => profiles.find((p) => p.id === userId);

  const filteredUsers = users.filter((u) => {
    const profile = getProfile(u.user_id);
    const term = search.toLowerCase();
    return !search || profile?.email?.toLowerCase().includes(term) || profile?.display_name?.toLowerCase().includes(term) || u.plan.toLowerCase().includes(term);
  });

  const filteredTransactions = transactions.filter((t) => txFilter === "all" || t.type === txFilter);
  const TX_PAGE_SIZE = 10;
  const txTotalPages = Math.ceil(filteredTransactions.length / TX_PAGE_SIZE);
  const paginatedTransactions = filteredTransactions.slice(txPage * TX_PAGE_SIZE, (txPage + 1) * TX_PAGE_SIZE);

  const totalPro = users.filter((u) => u.plan === "pro").length;
  const totalCredits = users.reduce((sum, u) => sum + u.credits, 0);

  const handleCreditSubmit = async () => {
    const amount = parseInt(creditAmount);
    if (isNaN(amount)) { toast.error("Enter a valid number"); return; }
    setActionLoading(true);
    const action = creditMode === "set" ? "update_credits" : "add_credits";
    const payload = creditMode === "set"
      ? { action, targetUserId: creditDialog.userId, credits: amount, reason: creditReason }
      : { action, targetUserId: creditDialog.userId, amount, reason: creditReason };

    const { error } = await supabase.functions.invoke("admin-data", { body: payload });
    setActionLoading(false);
    if (error) { toast.error("Failed to update credits"); return; }
    toast.success("Credits updated");
    setCreditDialog({ open: false, userId: "", email: "", currentCredits: 0 });
    setCreditAmount("");
    setCreditReason("");
    fetchData();
  };

  const handlePlanToggle = async (userId: string, currentPlan: string) => {
    const newPlan = currentPlan === "pro" ? "free" : "pro";
    setActionLoading(true);
    const { error } = await supabase.functions.invoke("admin-data", {
      body: { action: "update_plan", targetUserId: userId, plan: newPlan },
    });
    setActionLoading(false);
    if (error) { toast.error("Failed to update plan"); return; }
    toast.success(`Plan changed to ${newPlan}`);
    fetchData();
  };

  const handleDeleteUserData = async (userId: string, email: string) => {
    if (!confirm(`Delete ALL data for ${email || userId}? This cannot be undone.`)) return;
    setActionLoading(true);
    const { error } = await supabase.functions.invoke("admin-data", {
      body: { action: "delete_user_data", targetUserId: userId },
    });
    setActionLoading(false);
    if (error) { toast.error("Failed to delete user data"); return; }
    toast.success("User data deleted");
    fetchData();
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  if (!isAdmin) return null;

  const txTypes = [...new Set(transactions.map((t) => t.type))];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Link to="/" className="flex items-center gap-2">
              <img src={collectaiLogo} alt="CollectAI Logo" className="w-8 h-8 rounded-lg" />
              <span className="text-xl font-display font-bold text-gradient-primary">Admin</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Users", value: users.length, icon: Users },
            { label: "Pro Subscribers", value: totalPro, icon: Crown },
            { label: "Credits in Circulation", value: totalCredits, icon: Coins },
            { label: "Total Cards", value: stats.totalCards, icon: ImageIcon },
            { label: "Total Scans", value: stats.totalScans, icon: BarChart3 },
            { label: "Credit Purchases", value: stats.totalRevenue, icon: TrendingUp },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loading ? <Skeleton className="h-7 w-14" /> : <p className="text-2xl font-bold">{value}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="push">Push</TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Users</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Credits</TableHead>
                          <TableHead>Subscription</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found</TableCell>
                          </TableRow>
                        ) : (
                          filteredUsers.map((u) => {
                            const profile = getProfile(u.user_id);
                            return (
                              <TableRow key={u.id}>
                                <TableCell className="font-medium">
                                  <div>
                                    <p>{profile?.email || u.user_id.slice(0, 8)}</p>
                                    {profile?.display_name && <p className="text-xs text-muted-foreground">{profile.display_name}</p>}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={u.plan === "pro" ? "default" : "secondary"}
                                    className="cursor-pointer"
                                    onClick={() => handlePlanToggle(u.user_id, u.plan)}
                                  >
                                    {u.plan === "pro" ? "Pro" : "Free"}
                                  </Badge>
                                </TableCell>
                                <TableCell>{u.credits}</TableCell>
                                <TableCell>
                                  {u.stripe_subscription_id ? (
                                    <Badge variant="outline" className="text-xs">Active</Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {new Date(u.created_at).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      title="Adjust credits"
                                      onClick={() => setCreditDialog({ open: true, userId: u.user_id, email: profile?.email || u.user_id.slice(0, 8), currentCredits: u.credits })}
                                    >
                                      <Coins className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      title="Delete user data"
                                      onClick={() => handleDeleteUserData(u.user_id, profile?.email || "")}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5" /> Transactions</CardTitle>
                  <Select value={txFilter} onValueChange={(v) => { setTxFilter(v); setTxPage(0); }}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {txTypes.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                 ) : filteredTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No transactions found</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedTransactions.map((t) => {
                            const profile = getProfile(t.user_id);
                            return (
                              <TableRow key={t.id}>
                                <TableCell className="font-medium">{profile?.email || t.user_id.slice(0, 8)}</TableCell>
                                <TableCell>
                                  <Badge variant={t.amount > 0 ? "default" : "destructive"} className="text-xs">{t.type}</Badge>
                                </TableCell>
                                <TableCell className={t.amount > 0 ? "text-green-600" : "text-red-500"}>
                                  {t.amount > 0 ? "+" : ""}{t.amount}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{t.description || "—"}</TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {new Date(t.created_at).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {txTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          Page {txPage + 1} of {txTotalPages} ({filteredTransactions.length} total)
                        </p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setTxPage((p) => p - 1)} disabled={txPage === 0}>
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setTxPage((p) => p + 1)} disabled={txPage >= txTotalPages - 1}>
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* Leads Tab */}
          <TabsContent value="leads">
            <LeadsTab />
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns">
            <CampaignsTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* Credit Adjustment Dialog */}
      <Dialog open={creditDialog.open} onOpenChange={(open) => { if (!open) setCreditDialog({ ...creditDialog, open: false }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Credits</DialogTitle>
            <DialogDescription>
              {creditDialog.email} — Current balance: <strong>{creditDialog.currentCredits}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button variant={creditMode === "add" ? "default" : "outline"} size="sm" onClick={() => setCreditMode("add")}>
                <Plus className="w-3 h-3 mr-1" /> Add / Deduct
              </Button>
              <Button variant={creditMode === "set" ? "default" : "outline"} size="sm" onClick={() => setCreditMode("set")}>
                <Settings className="w-3 h-3 mr-1" /> Set Exact
              </Button>
            </div>
            <div>
              <Label>{creditMode === "add" ? "Amount (negative to deduct)" : "New credit balance"}</Label>
              <Input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder={creditMode === "add" ? "e.g. 10 or -5" : "e.g. 50"} />
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="e.g. Compensation for bug" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditDialog({ ...creditDialog, open: false })}>Cancel</Button>
            <Button onClick={handleCreditSubmit} disabled={actionLoading}>
              {actionLoading ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
