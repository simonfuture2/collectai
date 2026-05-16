import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Shield, Star } from "lucide-react";
import collectaiLogo from "@/assets/collectai-logo.png";
import Footer from "@/components/Footer";
import AIDisclaimer from "@/components/AIDisclaimer";
import SEO from "@/components/SEO";

interface SharedCardData {
  id: string;
  card_name: string | null;
  card_set: string | null;
  card_year: string | null;
  condition_grade: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  rarity: string | null;
  category: string | null;
  image_url: string;
}

export default function SharedCard() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<SharedCardData | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    document.title = "CollectAI – Graded Card Certificate";
  }, []);

  useEffect(() => {
    const fetchCard = async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from("cards")
        .select("id, card_name, card_set, card_year, condition_grade, estimated_value_low, estimated_value_high, rarity, category, image_url")
        .eq("id", id)
        .eq("is_public", true)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setCard(data);

      // Get signed URL for image
      if (!data.image_url.startsWith("http")) {
        const { data: signed } = await supabase.storage
          .from("card-images")
          .createSignedUrl(data.image_url, 3600);
        setImageUrl(signed?.signedUrl || data.image_url);
      } else {
        const match = data.image_url.match(/card-images\/(.+?)(\?|$)/);
        if (match?.[1]) {
          const { data: signed } = await supabase.storage
            .from("card-images")
            .createSignedUrl(match[1], 3600);
          setImageUrl(signed?.signedUrl || data.image_url);
        } else {
          setImageUrl(data.image_url);
        }
      }

      setLoading(false);
    };
    fetchCard();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !card) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-display font-bold mb-4">Card Not Found</h1>
        <p className="text-muted-foreground mb-6">This card certificate is not available or has been made private.</p>
        <Link to="/auth">
          <Button className="gradient-primary">
            <Camera className="mr-2 w-4 h-4" /> Scan Your Own Cards
          </Button>
        </Link>
      </div>
    );
  }

  const avgValue = ((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={collectaiLogo} alt="CollectAI" className="w-8 h-8 rounded-lg" />
            <span className="text-xl font-display font-bold text-gradient-primary">CollectAI</span>
          </Link>
          <Link to="/auth">
            <Button size="sm" className="gradient-primary">
              <Camera className="mr-2 w-4 h-4" /> Scan Your Cards
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 mb-4">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-medium">AuthentiSeal Certificate</span>
          </div>
          <h1 className="text-3xl font-display font-bold">{card.card_name || "Trading Card"}</h1>
          {card.card_set && <p className="text-muted-foreground mt-1">{card.card_set} {card.card_year && `(${card.card_year})`}</p>}
        </div>

        {/* Card Image */}
        <div className="bg-card border border-border rounded-2xl p-4 mb-6">
          <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted">
            <img
              src={imageUrl}
              alt={card.card_name || "Card"}
              className="w-full h-full object-contain"
              loading="lazy"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="gradient-primary text-white rounded-xl p-4">
            <p className="text-sm opacity-80">Estimated Value</p>
            <p className="text-2xl font-display font-bold">${avgValue.toFixed(2)}</p>
            <p className="text-xs opacity-70">${card.estimated_value_low?.toFixed(2)} – ${card.estimated_value_high?.toFixed(2)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">AI Grade</p>
            <p className="text-xl font-display font-bold">{card.condition_grade || "N/A"}</p>
            {card.rarity && <p className="text-xs text-muted-foreground">{card.rarity}</p>}
          </div>
        </div>

        <AIDisclaimer className="mb-6" />

        {/* CTA */}
        <div className="text-center bg-card border border-border rounded-2xl p-8">
          <Star className="w-10 h-10 text-primary mx-auto mb-3" />
          <h2 className="text-xl font-display font-bold mb-2">Want to grade your cards?</h2>
          <p className="text-muted-foreground mb-4">Get AI-powered grading and market values in seconds — free to start.</p>
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
