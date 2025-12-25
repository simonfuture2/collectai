import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, LogOut, Wallet, TrendingUp, Layers } from "lucide-react";
import type { User } from "@supabase/supabase-js";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState({ totalCards: 0, totalValue: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      supabase.from("cards").select("estimated_value_low, estimated_value_high").eq("user_id", user.id)
        .then(({ data }) => {
          if (data) {
            const total = data.reduce((sum, c) => sum + ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2, 0);
            setStats({ totalCards: data.length, totalValue: total });
          }
        });
    }
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-display font-bold text-gradient-primary">CollectAI</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <h2 className="text-3xl font-display font-bold mb-8">Your Collection</h2>

        <div className="grid sm:grid-cols-3 gap-6 mb-10">
          {[
            { icon: Layers, label: "Total Cards", value: stats.totalCards, color: "text-primary" },
            { icon: Wallet, label: "Est. Value", value: `$${stats.totalValue.toFixed(0)}`, color: "text-secondary" },
            { icon: TrendingUp, label: "Trend", value: "—", color: "text-accent" },
          ].map((s, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-6 flex items-center gap-4">
              <s.icon className={`w-10 h-10 ${s.color}`} />
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-display font-bold">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 mb-10">
          <Link to="/scan">
            <Button className="gradient-primary glow-purple hover-lift"><Camera className="mr-2 w-5 h-5" />Scan New Card</Button>
          </Link>
          <Link to="/collection">
            <Button variant="outline">View Full Collection</Button>
          </Link>
        </div>

        {stats.totalCards === 0 && (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-display font-semibold mb-2">No cards yet</h3>
            <p className="text-muted-foreground mb-6">Scan your first card to start building your collection!</p>
            <Link to="/scan"><Button className="gradient-primary">Scan Your First Card</Button></Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
