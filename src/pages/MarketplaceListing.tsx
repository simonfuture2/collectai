import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ShieldCheck, Truck, Coins } from "lucide-react";
import WalletConnectButton from "@/components/WalletConnectButton";
import { useWallet } from "@/hooks/use-wallet";
import { toast } from "@/hooks/use-toast";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";

export default function MarketplaceListing() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { ethAddress, solAddress, isConnected, open } = useWallet();
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<any>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [seller, setSeller] = useState<{ display_name: string | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data: l } = await supabase
        .from("marketplace_listings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!l) { setLoading(false); return; }
      const { data: c } = await supabase
        .from("cards")
        .select("card_name, card_set, card_year, image_url, rarity, condition_grade, authentiseal_serial, category, ai_analysis, estimated_value_low, estimated_value_high")
        .eq("id", l.card_id)
        .maybeSingle();
      const merged: any = { ...l, cards: c };
      setListing(merged);
      if (c?.image_url) {
        const path = c.image_url;
        if (path.startsWith("http")) setImgUrl(path);
        else {
          const { data: s } = await supabase.storage.from("card-images").createSignedUrl(path, 3600);
          if (s?.signedUrl) setImgUrl(s.signedUrl);
        }
      }
      if (l.seller_id) {
        const { data: p } = await supabase.from("profiles").select("display_name").eq("id", l.seller_id).maybeSingle();
        setSeller(p ?? null);
      }
      setLoading(false);
    })();
  }, [id]);

  const buy = async () => {
    if (!listing) return;
    if (!isConnected) {
      open();
      return;
    }
    const needed = listing.chain === "ethereum" ? ethAddress : solAddress;
    if (!needed) {
      toast({
        title: `Connect a ${listing.chain === "ethereum" ? "Ethereum" : "Solana"} wallet`,
        description: "This listing requires a wallet on the matching network.",
      });
      open();
      return;
    }
    toast({
      title: "Escrow checkout coming soon",
      description: "Phase 2 will deploy on-chain escrow contracts. Your wallet is ready.",
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="aspect-[3/4]" />
          <div className="space-y-3"><Skeleton className="h-8" /><Skeleton className="h-24" /><Skeleton className="h-12" /></div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">Listing not found.</p>
        <Button onClick={() => navigate("/marketplace")}>Back to marketplace</Button>
      </div>
    );
  }

  const c = listing.cards ?? {};
  const titleParts = [c.card_name || "Trading card", c.card_year, c.card_set].filter(Boolean).join(" ");
  const seoTitle = `${titleParts} • ${Number(listing.price).toFixed(2)} ${listing.payment_token}`.slice(0, 60);
  const productJsonLd = buildProductJsonLd(listing, c, imgUrl);
  const seoDesc = productJsonLd.description;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seoTitle} description={seoDesc} path={`/marketplace/${listing.id}`} ogType="product" image={imgUrl ?? undefined} jsonLd={productJsonLd} />
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/marketplace")}>
            <ArrowLeft className="h-4 w-4" /> Marketplace
          </Button>
          <WalletConnectButton size="sm" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="overflow-hidden">
            <div className="aspect-[3/4] bg-muted">
              {imgUrl && <img src={imgUrl} alt={listing.cards?.card_name ?? "Card"} className="w-full h-full object-cover" />}
            </div>
          </Card>

          <div className="space-y-5">
            <div>
              <h1 className="text-3xl font-bold">{listing.cards?.card_name ?? "Untitled card"}</h1>
              <p className="text-muted-foreground">{listing.cards?.card_set} {listing.cards?.card_year ? `• ${listing.cards.card_year}` : ""}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {listing.cards?.rarity && <Badge variant="secondary">{listing.cards.rarity}</Badge>}
              {listing.cards?.condition_grade && <Badge variant="secondary">{listing.cards.condition_grade}</Badge>}
              {listing.cards?.authentiseal_serial && (
                <Badge className="gap-1"><ShieldCheck className="h-3 w-3" /> AuthentiSeal</Badge>
              )}
            </div>

            <Card className="p-5">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">{Number(listing.price).toFixed(2)}</span>
                <span className="text-xl text-muted-foreground">{listing.payment_token}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Pay on {listing.chain === "ethereum" ? "Ethereum" : "Solana"} • Escrow protected
              </p>
              <Button className="w-full mt-4" size="lg" onClick={buy}>
                <Coins /> {isConnected ? "Buy with " + listing.payment_token : "Connect wallet to buy"}
              </Button>
            </Card>

            <Card className="p-4 space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium">On-chain escrow</div>
                  <div className="text-muted-foreground">Funds are locked in a smart contract until you confirm delivery.</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Truck className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium">Tracked shipping required</div>
                  <div className="text-muted-foreground">Seller must provide a carrier tracking number; funds release after verified delivery.</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Coins className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium">Authenticity NFT minted on release</div>
                  <div className="text-muted-foreground">A non-transferable certificate is minted to your wallet, linked to the AuthentiSeal serial.</div>
                </div>
              </div>
            </Card>

            {seller && (
              <p className="text-sm text-muted-foreground">
                Sold by <span className="font-medium text-foreground">{seller.display_name ?? "Anonymous collector"}</span>
              </p>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
