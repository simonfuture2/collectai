import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Wallet } from "lucide-react";
import WalletConnectButton from "@/components/WalletConnectButton";
import { useWallet } from "@/hooks/use-wallet";
import { toast } from "@/hooks/use-toast";
import Footer from "@/components/Footer";
import type { Chain, PaymentToken } from "@/lib/web3/tokens";

export default function CreateListing() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const { ethAddress, solAddress, isConnected, open } = useWallet();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [card, setCard] = useState<any>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [chain, setChain] = useState<Chain>("solana");
  const [token, setToken] = useState<PaymentToken>("USDC");
  const [price, setPrice] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  useEffect(() => {
    if (!cardId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate("/auth"); return; }
      const { data } = await supabase.from("cards").select("*").eq("id", cardId).maybeSingle();
      if (!data || data.user_id !== session.user.id) {
        toast({ title: "Card not found", variant: "destructive" });
        navigate("/collection");
        return;
      }
      setCard(data);
      if (data.image_url) {
        if (data.image_url.startsWith("http")) setImgUrl(data.image_url);
        else {
          const { data: s } = await supabase.storage.from("card-images").createSignedUrl(data.image_url, 3600);
          if (s?.signedUrl) setImgUrl(s.signedUrl);
        }
      }
      // Default sale price = midpoint estimate
      const mid = ((Number(data.estimated_value_low) || 0) + (Number(data.estimated_value_high) || 0)) / 2;
      if (mid > 0) setPrice(mid.toFixed(2));
      setLoading(false);
    })();
  }, [cardId, navigate]);

  const wallet = chain === "ethereum" ? ethAddress : solAddress;

  const submit = async () => {
    if (!card) return;
    const num = Number(price);
    if (!num || num <= 0) { toast({ title: "Enter a valid price", variant: "destructive" }); return; }
    if (!wallet) {
      toast({ title: `Connect a ${chain} wallet to receive payment` });
      open();
      return;
    }
    setSubmitting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setSubmitting(false); return; }

    const { data, error } = await supabase.from("marketplace_listings").insert({
      card_id: card.id,
      seller_id: session.user.id,
      chain,
      payment_token: token,
      price: num,
      seller_wallet: wallet,
      description: description || null,
      status: "active",
    }).select("id").single();

    if (error) {
      toast({ title: "Listing failed", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    await supabase.from("cards").update({ is_listed: true }).eq("id", card.id);
    toast({ title: "Listed on marketplace" });
    navigate(`/marketplace/${data.id}`);
  };

  if (loading) {
    return <div className="container mx-auto p-8"><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <WalletConnectButton size="sm" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-1">List on Marketplace</h1>
        <p className="text-muted-foreground text-sm mb-6">Choose a network and a stablecoin. Buyers pay into on-chain escrow.</p>

        <div className="grid md:grid-cols-[180px_1fr] gap-6">
          <Card className="overflow-hidden">
            <div className="aspect-[3/4] bg-muted">
              {imgUrl && <img src={imgUrl} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="p-3">
              <div className="font-semibold text-sm truncate">{card.card_name ?? "Untitled"}</div>
              <div className="text-xs text-muted-foreground truncate">{card.card_set ?? "—"}</div>
            </div>
          </Card>

          <div className="space-y-6">
            <div>
              <Label className="mb-2 block">Network</Label>
              <RadioGroup value={chain} onValueChange={(v) => setChain(v as Chain)} className="grid grid-cols-2 gap-2">
                <Label className={`border rounded-md p-3 cursor-pointer flex items-center gap-2 ${chain === "solana" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="solana" /> Solana
                </Label>
                <Label className={`border rounded-md p-3 cursor-pointer flex items-center gap-2 ${chain === "ethereum" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="ethereum" /> Ethereum
                </Label>
              </RadioGroup>
            </div>

            <div>
              <Label className="mb-2 block">Payment token</Label>
              <RadioGroup value={token} onValueChange={(v) => setToken(v as PaymentToken)} className="grid grid-cols-2 gap-2">
                <Label className={`border rounded-md p-3 cursor-pointer flex items-center gap-2 ${token === "USDC" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="USDC" /> USDC
                </Label>
                <Label className={`border rounded-md p-3 cursor-pointer flex items-center gap-2 ${token === "USDT" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="USDT" /> USDT
                </Label>
              </RadioGroup>
            </div>

            <div>
              <Label htmlFor="price" className="mb-2 block">Price ({token})</Label>
              <Input id="price" type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>

            <div>
              <Label htmlFor="desc" className="mb-2 block">Description (optional)</Label>
              <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Condition notes, grading, anything buyers should know…" />
            </div>

            <Card className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">Receiving wallet</div>
                  <div className="text-muted-foreground text-xs">
                    {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : `No ${chain} wallet connected`}
                  </div>
                </div>
              </div>
              {!wallet && <Button size="sm" variant="outline" onClick={() => open()}>Connect</Button>}
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate(-1)} disabled={submitting}>Cancel</Button>
              <Button onClick={submit} disabled={submitting || !wallet}>
                {submitting ? "Listing…" : "Publish listing"}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
