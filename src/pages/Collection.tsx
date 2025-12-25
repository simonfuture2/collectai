import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Camera, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

interface Card {
  id: string;
  image_url: string;
  card_name: string | null;
  card_set: string | null;
  condition_grade: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
}

const Collection = () => {
  const [user, setUser] = useState<User | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
  }, [navigate]);

  useEffect(() => {
    if (user) {
      supabase.from("cards").select("id, image_url, card_name, card_set, condition_grade, estimated_value_low, estimated_value_high")
        .eq("user_id", user.id).order("created_at", { ascending: false })
        .then(({ data }) => { setCards(data || []); setLoading(false); });
    }
  }, [user]);

  const deleteCard = async (id: string) => {
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setCards(cards.filter(c => c.id !== id));
  };

  const totalValue = cards.reduce((sum, c) => sum + ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
            <h1 className="text-xl font-display font-bold">My Collection</h1>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">{cards.length} cards</p>
            <p className="text-lg font-display font-bold text-gradient-primary">~${totalValue.toFixed(0)}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading...</div>
        ) : cards.length === 0 ? (
          <div className="text-center py-16">
            <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-6">No cards in your collection yet</p>
            <Link to="/scan"><Button className="gradient-primary">Scan Your First Card</Button></Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {cards.map(card => (
              <div key={card.id} className="bg-card border border-border rounded-xl overflow-hidden hover-lift group">
                <div className="aspect-[3/4] bg-muted">
                  <img src={card.image_url} alt={card.card_name || "Card"} className="w-full h-full object-contain" />
                </div>
                <div className="p-4">
                  <h3 className="font-display font-semibold truncate">{card.card_name || "Unknown"}</h3>
                  <p className="text-sm text-muted-foreground truncate">{card.card_set}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-medium text-gradient-primary">
                      ${((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2}
                    </span>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100" onClick={() => deleteCard(card.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Collection;
