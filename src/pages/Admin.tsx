import { useEffect, useState } from "react";
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
import { ArrowLeft, Users, CreditCard, Activity, Search, Crown, Coins } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

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

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [users, setUsers] = useState<UserCredit[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate("/dashboard");
    }
  }, [isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin]);

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase.functions.invoke("admin-data", {
      body: { action: "get_dashboard" },
    });

    if (!error && data) {
      setUsers(data.users || []);
      setProfiles(data.profiles || []);
      setTransactions(data.transactions || []);
    }
    setLoading(false);
  };

  const getProfile = (userId: string) => profiles.find((p) => p.id === userId);

  const filteredUsers = users.filter((u) => {
    const profile = getProfile(u.user_id);
    const term = search.toLowerCase();
    return (
      !search ||
      profile?.email?.toLowerCase().includes(term) ||
      profile?.display_name?.toLowerCase().includes(term) ||
      u.plan.toLowerCase().includes(term)
    );
  });

  const totalPro = users.filter((u) => u.plan === "pro").length;
  const totalFree = users.filter((u) => u.plan !== "pro").length;
  const totalCredits = users.reduce((sum, u) => sum + u.credits, 0);

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!isAdmin) return null;

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
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid sm:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              <Users className="w-5 h-5 text-primary" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold">{users.length}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pro Subscribers</CardTitle>
              <Crown className="w-5 h-5 text-primary" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div>
                  <p className="text-3xl font-bold">{totalPro}</p>
                  <p className="text-xs text-muted-foreground">{totalFree} free users</p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Credits in Circulation</CardTitle>
              <Coins className="w-5 h-5 text-primary" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold">{totalCredits}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> Users
              </CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Credits</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((u) => {
                      const profile = getProfile(u.user_id);
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{profile?.email || u.user_id.slice(0, 8)}</TableCell>
                          <TableCell>
                            <Badge variant={u.plan === "pro" ? "default" : "secondary"}>
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
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" /> Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No transactions yet</p>
            ) : (
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
                  {transactions.map((t) => {
                    const profile = getProfile(t.user_id);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{profile?.email || t.user_id.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant={t.amount > 0 ? "default" : "destructive"} className="text-xs">
                            {t.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={t.amount > 0 ? "text-green-600" : "text-red-500"}>
                          {t.amount > 0 ? "+" : ""}{t.amount}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{t.description || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(t.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Admin;
