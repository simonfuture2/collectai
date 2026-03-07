import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, User } from "lucide-react";
import collectaiLogo from "@/assets/collectai-logo.png";
import Footer from "@/components/Footer";

interface PublicCard {
  id: string;
  card_name: string | null;
  card_set: string | null;
  condition_grade: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  image_url: string;
}

export default function PublicCollection() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);
  const [cards, setCards] = useState<PublicCard[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    document.title = "CollectAI – Public Collection";
  }, []);

  useEffect(() => {
    const fetchCollection = async () => {
      if (!slug) return;

      const { data: prof, error: profError } = await (supabase as any)
        .from("public_profiles")
        .select("id, display_name")
        .eq("public_collection_slug", slug)
        .maybeSingle();

      if (profError || !prof) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile({ display_name: prof.display_name });

      const { data: cardData } = await supabase
        .from("cards")
        .select("id, card_name, card_set, condition_grade, estimated_value_low, estimated_value_high, image_url")
        .eq("user_id", prof.id)
        .order("created_at", { ascending: false })
        .limit(100);

      const cardList = cardData || [];
      setCards(cardList);

      // Resolve image URLs
      const urls: Record<string, string> = {};
      for (const card of cardList) {
        if (!card.image_url.startsWith("http")) {
          const { data: signed } = await supabase.storage
            .from("card-images")
            .createSignedUrl(card.image_url, 3600);
          urls[card.id] = signed?.signedUrl || card.image_url;
        } else {
          const match = card.image_url.match(/card-images\/(.+?)(\?|$)/);
          if (match?.[1]) {
            const { data: signed } = await supabase.storage
              .from("card-images")
              .createSignedUrl(match[1], 3600);
            urls[card.id] = signed?.signedUrl || card.image_url;
          } else {
            urls[card.id] = card.image_url;
          }
        }
      }
      setImageUrls(urls);
      setLoading(false);
    };
    fetchCollection();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-display font-bold mb-4">Collection Not Found</h1>
        <p className="text-muted-foreground mb-6">This collection is not available or has been made private.</p>
        <Link to="/auth">
          <Button className="gradient-primary">
            <Camera className="mr-2 w-4 h-4" /> Start Your Own Collection
          </Button>
        </Link>
      </div>
    );
  }

  const totalValue = cards.reduce((sum, c) => sum + ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={collectaiLogo} alt="CollectAI" className="w-8 h-8 rounded-lg" />
            <span className="text-xl font-display font-bold text-gradient-primary">CollectAI</span>
          </Link>
          <Link to="/auth">
            <Button size="sm" className="gradient-primary">
              <Camera className="mr-2 w-4 h-4" /> Start Scanning
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <User className="w-5 h-5 text-primary" />
            <span className="text-sm text-muted-foreground">Public Collection</span>
          </div>
          <h1 className="text-3xl font-display font-bold">{profile?.display_name || "Collector"}'s Collection</h1>
          <p className="text-muted-foreground mt-2">
            {cards.length} card{cards.length !== 1 ? "s" : ""} • Est. Value: ${totalValue.toFixed(0)}
          </p>
        </div>

        {cards.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <p className="text-muted-foreground">No cards in this collection yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {cards.map((card) => {
              const avg = ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;
              return (
                <div key={card.id} className="bg-card border border-border rounded-xl overflow-hidden hover-lift">
                  <div className="aspect-[3/4] bg-muted">
                    <img
                      src={imageUrls[card.id] || card.image_url}
                      alt={card.card_name || "Card"}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold truncate">{card.card_name || "Unknown"}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">{card.condition_grade || "N/A"}</span>
                      <span className="text-xs font-medium text-primary">${avg.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className="text-center mt-12 bg-card border border-border rounded-2xl p-8">
          <h2 className="text-xl font-display font-bold mb-2">Build your own collection</h2>
          <p className="text-muted-foreground mb-4">AI-powered card grading and market values — free to start.</p>
          <Link to="/auth">
            <Button size="lg" className="gradient-primary">
              <Camera className="mr-2 w-5 h-5" /> Start Scanning Free
            </Button>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
