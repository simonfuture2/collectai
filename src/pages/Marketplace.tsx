import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Search, Tag } from "lucide-react";
import WalletConnectButton from "@/components/WalletConnectButton";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";

interface Listing {
  id: string;
  card_id: string;
  seller_id: string;
  chain: "ethereum" | "solana";
  payment_token: "USDC" | "USDT";
  price: number;
  status: string;
  created_at: string;
  cards?: {
    card_name: string | null;
    card_set: string | null;
    image_url: string;
    rarity: string | null;
    condition_grade: string | null;
  } | null;
}

export default function Marketplace() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<Listing[]>([]);
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [tokenFilter, setTokenFilter] = useState<string>("all");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from("marketplace_listings")
        .select("id, card_id, seller_id, chain, payment_token, price, status, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      const listingsRaw = (rows as any[]) ?? [];
      const cardIds = listingsRaw.map((r) => r.card_id);
      let cardMap: Record<string, any> = {};
      if (cardIds.length) {
        const { data: cards } = await supabase
          .from("cards")
          .select("id, card_name, card_set, image_url, rarity, condition_grade")
          .in("id", cardIds);
        for (const c of cards ?? []) cardMap[c.id] = c;
      }
      const merged: Listing[] = listingsRaw.map((r) => ({ ...r, cards: cardMap[r.card_id] ?? null }));
      setListings(merged);
      const map: Record<string, string> = {};
      for (const row of merged) {
        const path = row.cards?.image_url;
        if (path && !path.startsWith("http")) {
          const { data: signed } = await supabase.storage.from("card-images").createSignedUrl(path, 3600);
          if (signed?.signedUrl) map[row.id] = signed.signedUrl;
        } else if (path) {
          map[row.id] = path;
        }
      }
      setImageUrls(map);
      setLoading(false);
    })();
  }, []);

  const filtered = listings.filter((l) => {
    if (chainFilter !== "all" && l.chain !== chainFilter) return false;
    if (tokenFilter !== "all" && l.payment_token !== tokenFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (l.cards?.card_name ?? "").toLowerCase();
      const set = (l.cards?.card_set ?? "").toLowerCase();
      if (!name.includes(q) && !set.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Card Marketplace – Buy & Sell with USDC/USDT | MyCollectAI"
        description="Browse trading cards listed by collectors. Pay with USDC or USDT on Ethereum or Solana with on-chain escrow and verified shipping."
        path="/marketplace"
      />
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} aria-label="Go back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold">Marketplace</h1>
            <Badge variant="secondary" className="hidden sm:inline-flex">USDC / USDT • ETH + SOL</Badge>
          </div>
          <WalletConnectButton size="sm" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search cards or sets…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={chainFilter} onValueChange={setChainFilter}>
            <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="Chain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All chains</SelectItem>
              <SelectItem value="ethereum">Ethereum</SelectItem>
              <SelectItem value="solana">Solana</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tokenFilter} onValueChange={setTokenFilter}>
            <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="Token" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tokens</SelectItem>
              <SelectItem value="USDC">USDC</SelectItem>
              <SelectItem value="USDT">USDT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <Tag className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg mb-1">No listings yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Be the first to list a card on the marketplace.</p>
            <Button onClick={() => navigate("/collection")}>Browse my collection</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((l) => (
              <Link key={l.id} to={`/marketplace/${l.id}`}>
                <Card className="overflow-hidden hover:shadow-lg transition group">
                  <div className="aspect-[3/4] bg-muted overflow-hidden">
                    {imageUrls[l.id] ? (
                      <img src={imageUrls[l.id]} alt={l.cards?.card_name ? `${l.cards.card_name} trading card` : "Trading card listing"} className="w-full h-full object-cover group-hover:scale-105 transition" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No image</div>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="font-semibold text-sm truncate">{l.cards?.card_name ?? "Unknown card"}</div>
                    <div className="text-xs text-muted-foreground truncate">{l.cards?.card_set ?? "—"}</div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-base font-bold">{Number(l.price).toFixed(2)} {l.payment_token}</span>
                      <Badge variant="outline" className="text-[10px]">{l.chain === "ethereum" ? "ETH" : "SOL"}</Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
