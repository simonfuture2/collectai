import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppKit, useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wallet, Copy, ExternalLink, Trash2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import Footer from "@/components/Footer";

interface SavedWallet {
  id: string;
  chain: "ethereum" | "solana";
  address: string;
  is_primary: boolean;
  created_at: string;
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function explorerUrl(chain: "ethereum" | "solana", address: string) {
  return chain === "ethereum"
    ? `https://etherscan.io/address/${address}`
    : `https://solscan.io/account/${address}`;
}

export default function WalletSettings() {
  const navigate = useNavigate();
  const evm = useAppKitAccount({ namespace: "eip155" });
  const sol = useAppKitAccount({ namespace: "solana" });
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedWallet[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (uid: string) => {
    const { data } = await supabase
      .from("wallets")
      .select("id, chain, address, is_primary, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    setSaved((data as SavedWallet[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate("/auth"); return; }
      setUserId(session.user.id);
      await load(session.user.id);
      setLoading(false);
    })();
  }, [navigate]);

  // Refresh when a new connection lands
  useEffect(() => {
    if (userId) load(userId);
  }, [userId, evm.isConnected, evm.address, sol.isConnected, sol.address]);

  const copy = (a: string) => {
    navigator.clipboard.writeText(a);
    toast({ title: "Address copied" });
  };

  const remove = async (w: SavedWallet) => {
    await supabase.from("wallets").delete().eq("id", w.id);
    if (userId) await load(userId);
    toast({ title: "Wallet removed" });
  };

  const setPrimary = async (w: SavedWallet) => {
    if (!userId) return;
    await supabase.from("wallets").update({ is_primary: false }).eq("user_id", userId).eq("chain", w.chain);
    await supabase.from("wallets").update({ is_primary: true }).eq("id", w.id);
    await load(userId);
    toast({ title: "Primary wallet updated" });
  };

  const disconnectChain = async (namespace: "eip155" | "solana") => {
    try {
      await disconnect({ namespace });
      toast({ title: "Wallet disconnected" });
    } catch (e: any) {
      toast({ title: "Disconnect failed", description: e?.message, variant: "destructive" });
    }
  };

  const liveByChain: Record<"ethereum" | "solana", string | null> = {
    ethereum: evm.isConnected ? evm.address ?? null : null,
    solana: sol.isConnected ? sol.address ?? null : null,
  };

  const grouped = {
    ethereum: saved.filter((w) => w.chain === "ethereum"),
    solana: saved.filter((w) => w.chain === "solana"),
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold">Wallets</h1>
          </div>
          <Button onClick={() => open()}>
            <Plus /> Connect wallet
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
        <Card className="p-4 text-sm text-muted-foreground">
          Connect an Ethereum or Solana wallet to buy and sell on the marketplace. Primary wallets receive payouts on their chain.
        </Card>

        {(["ethereum", "solana"] as const).map((chain) => {
          const live = liveByChain[chain];
          const wallets = grouped[chain];
          const namespace = chain === "ethereum" ? "eip155" : "solana";
          return (
            <section key={chain} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold capitalize">{chain}</h2>
                {live && (
                  <Button variant="ghost" size="sm" onClick={() => disconnectChain(namespace as any)}>
                    Disconnect active
                  </Button>
                )}
              </div>

              {loading ? (
                <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
              ) : wallets.length === 0 ? (
                <Card className="p-6 text-center">
                  <Wallet className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No {chain} wallets connected.</p>
                  <Button size="sm" onClick={() => open()}><Plus /> Connect</Button>
                </Card>
              ) : (
                <div className="space-y-2">
                  {wallets.map((w) => {
                    const isLive = live?.toLowerCase() === w.address.toLowerCase();
                    return (
                      <Card key={w.id} className="p-4 flex flex-wrap items-center gap-3">
                        <Wallet className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm truncate">{short(w.address)}</div>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {w.is_primary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
                            {isLive && <Badge className="text-[10px]">Connected</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => copy(w.address)} title="Copy address">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" asChild title="View on explorer">
                            <a href={explorerUrl(w.chain, w.address)} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          {!w.is_primary && (
                            <Button variant="outline" size="sm" onClick={() => setPrimary(w)}>Set primary</Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => remove(w)} title="Remove">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </main>
      <Footer />
    </div>
  );
}
