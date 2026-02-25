import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Camera, Trash2, Search, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import EcosystemBadge from "@/components/EcosystemBadge";
import Footer from "@/components/Footer";
import type { User } from "@supabase/supabase-js";

interface Card {
  id: string;
  image_url: string;
  card_name: string | null;
  card_set: string | null;
  card_year: string | null;
  rarity: string | null;
  category: string | null;
  condition_grade: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Trading Card": "bg-primary/15 text-primary border-primary/30",
  "Sports Card": "bg-secondary/15 text-secondary border-secondary/30",
  "Pokémon": "bg-collectai-yellow/15 text-accent border-accent/30",
  "Magic: The Gathering": "bg-collectai-blue/15 text-secondary border-secondary/30",
  "Yu-Gi-Oh!": "bg-collectai-orange/15 text-collectai-orange border-collectai-orange/30",
  "Comic Book": "bg-collectai-pink/15 text-collectai-pink border-collectai-pink/30",
  "Coin": "bg-collectai-green/15 text-collectai-green border-collectai-green/30",
  "Other": "bg-muted text-muted-foreground border-border",
};

const getCategoryStyle = (cat: string | null) =>
  CATEGORY_COLORS[cat || ""] || CATEGORY_COLORS["Other"];

type SortOption = "newest" | "oldest" | "value-high" | "value-low" | "name";

const Collection = () => {
  const [user, setUser] = useState<User | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeRarity, setActiveRarity] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);
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
      supabase
        .from("cards")
        .select("id, image_url, card_name, card_set, card_year, rarity, category, condition_grade, estimated_value_low, estimated_value_high")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .then(async ({ data }) => {
          if (!data) { setCards([]); setLoading(false); return; }

          const cardsWithUrls = await Promise.all(
            data.map(async (card) => {
              const isFilePath = !card.image_url.startsWith("http");
              if (isFilePath) {
                const { data: signedData } = await supabase.storage
                  .from("card-images")
                  .createSignedUrl(card.image_url, 3600);
                return { ...card, image_url: signedData?.signedUrl || card.image_url };
              }
              const match = card.image_url.match(/card-images\/(.+?)(\?|$)/);
              if (match) {
                const { data: signedData } = await supabase.storage
                  .from("card-images")
                  .createSignedUrl(match[1], 3600);
                return { ...card, image_url: signedData?.signedUrl || card.image_url };
              }
              return card;
            })
          );

          setCards(cardsWithUrls);
          setLoading(false);
        });
    }
  }, [user]);

  const deleteCard = async (id: string) => {
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setCards(cards.filter((c) => c.id !== id));
  };

  // Derive unique categories and rarities for filter chips
  const categories = useMemo(() => {
    const cats = new Set(cards.map((c) => c.category || "Trading Card"));
    return Array.from(cats).sort();
  }, [cards]);

  const rarities = useMemo(() => {
    const rars = new Set(cards.filter((c) => c.rarity).map((c) => c.rarity!));
    return Array.from(rars).sort();
  }, [cards]);

  // Filter and sort
  const filtered = useMemo(() => {
    let list = [...cards];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.card_name || "").toLowerCase().includes(q) ||
          (c.card_set || "").toLowerCase().includes(q) ||
          (c.card_year || "").toLowerCase().includes(q) ||
          (c.rarity || "").toLowerCase().includes(q) ||
          (c.category || "").toLowerCase().includes(q)
      );
    }

    // Category filter
    if (activeCategory) {
      list = list.filter((c) => (c.category || "Trading Card") === activeCategory);
    }

    // Rarity filter
    if (activeRarity) {
      list = list.filter((c) => c.rarity === activeRarity);
    }

    // Sort
    switch (sortBy) {
      case "oldest":
        list.reverse();
        break;
      case "value-high":
        list.sort((a, b) => ((b.estimated_value_high || 0) - (a.estimated_value_high || 0)));
        break;
      case "value-low":
        list.sort((a, b) => ((a.estimated_value_low || 0) - (b.estimated_value_low || 0)));
        break;
      case "name":
        list.sort((a, b) => (a.card_name || "").localeCompare(b.card_name || ""));
        break;
    }

    return list;
  }, [cards, search, activeCategory, activeRarity, sortBy]);

  const totalValue = filtered.reduce(
    (sum, c) => sum + ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2,
    0
  );

  const clearFilters = () => {
    setSearch("");
    setActiveCategory(null);
    setActiveRarity(null);
    setSortBy("newest");
  };

  const hasActiveFilters = search || activeCategory || activeRarity || sortBy !== "newest";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <h1 className="text-xl font-display font-bold">My Collection</h1>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              {filtered.length}{filtered.length !== cards.length ? `/${cards.length}` : ""} items
            </p>
            <p className="text-lg font-display font-bold text-gradient-primary">~${totalValue.toFixed(0)}</p>
          </div>
        </div>

        {/* Search & filter bar */}
        {cards.length > 0 && (
          <div className="container mx-auto px-4 pb-3 space-y-3">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, set, year, rarity..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-10 bg-card border-border"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter toggle & sort */}
            <div className="flex items-center gap-2">
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">!</span>
                )}
              </Button>

              {/* Sort dropdown */}
              <div className="relative ml-auto">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="appearance-none bg-card border border-border rounded-lg text-sm px-3 py-1.5 pr-8 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="value-high">Value: High → Low</option>
                  <option value="value-low">Value: Low → High</option>
                  <option value="name">Name A–Z</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Filter chips */}
            {showFilters && (
              <div className="space-y-2 animate-fade-in">
                {/* Categories */}
                {categories.length > 1 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">Category</p>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                          className={`text-xs px-3 py-1 rounded-full border transition-all ${
                            activeCategory === cat
                              ? getCategoryStyle(cat) + " ring-1 ring-ring"
                              : "bg-card text-muted-foreground border-border hover:border-primary/40"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rarities */}
                {rarities.length > 1 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">Rarity</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rarities.map((r) => (
                        <button
                          key={r}
                          onClick={() => setActiveRarity(activeRarity === r ? null : r)}
                          className={`text-xs px-3 py-1 rounded-full border transition-all ${
                            activeRarity === r
                              ? "bg-primary/15 text-primary border-primary/30 ring-1 ring-ring"
                              : "bg-card text-muted-foreground border-border hover:border-primary/40"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
                <Skeleton className="aspect-[3/4] w-full" />
                <div className="p-2.5 sm:p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-16">
            <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-6">No items in your collection yet</p>
            <Link to="/scan"><Button className="gradient-primary">Scan Your First Item</Button></Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No items match your search</p>
            <button onClick={clearFilters} className="text-primary text-sm hover:underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {filtered.map((card) => (
              <div
                key={card.id}
                className="bg-card border border-border rounded-xl overflow-hidden hover-lift group cursor-pointer"
                onClick={() => navigate(`/card/${card.id}`)}
              >
                <div className="aspect-[3/4] bg-muted relative">
                  <img
                    src={card.image_url}
                    alt={card.card_name || "Item"}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                  {/* Category badge */}
                  <span
                    className={`absolute top-1.5 left-1.5 text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${getCategoryStyle(card.category)}`}
                  >
                    {card.category || "Trading Card"}
                  </span>
                </div>
                <div className="p-2.5 sm:p-3">
                  <h3 className="font-display font-semibold text-sm truncate">{card.card_name || "Unknown"}</h3>
                  <p className="text-xs text-muted-foreground truncate">{card.card_set}</p>
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-xs sm:text-sm font-medium text-gradient-primary">
                      ${(((card.estimated_value_low || 0) + (card.estimated_value_high || 0)) / 2).toFixed(0)}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {card.card_name || "this item"}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently remove this item from your collection.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteCard(card.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-center pt-8">
          <EcosystemBadge type="authentiseal" variant="inline" />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Collection;
