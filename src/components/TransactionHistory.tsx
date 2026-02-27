import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, Plus, Minus, CreditCard, Gift, Zap } from "lucide-react";
import { format } from "date-fns";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

const typeConfig: Record<string, { icon: typeof Plus; label: string; color: string }> = {
  credit_purchase: { icon: CreditCard, label: "Purchase", color: "text-green-500" },
  signup_bonus: { icon: Gift, label: "Bonus", color: "text-primary" },
  scan_deduction: { icon: Zap, label: "Scan", color: "text-orange-500" },
  referral_bonus: { icon: Gift, label: "Referral", color: "text-primary" },
  pro_subscription: { icon: CreditCard, label: "Pro", color: "text-green-500" },
};

const TransactionHistory = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("credit_transactions")
      .select("id, type, amount, description, created_at")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setTransactions(data);
        setLoading(false);
      });
  }, []);

  const getConfig = (type: string) =>
    typeConfig[type] || { icon: History, label: type, color: "text-muted-foreground" };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Transaction History</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" /> Transaction History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
        ) : (
          <div className="space-y-1">
            {transactions.map((tx) => {
              const config = getConfig(tx.type);
              const Icon = config.icon;
              const isPositive = tx.amount > 0;
              return (
                <div key={tx.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-muted ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tx.description || config.label}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(tx.created_at), "MMM d, yyyy · h:mm a")}</p>
                    </div>
                  </div>
                  <Badge variant={isPositive ? "default" : "secondary"} className="font-mono">
                    {isPositive ? "+" : ""}{tx.amount}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TransactionHistory;
