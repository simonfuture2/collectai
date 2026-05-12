import { useEffect, useMemo } from "react";
import { useAppKitAccount, useAppKit } from "@reown/appkit/react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Unified wallet hook. Returns connected EVM and Solana addresses (when present)
 * and persists them to the `wallets` table when a user is logged in.
 */
export function useWallet() {
  const evm = useAppKitAccount({ namespace: "eip155" });
  const sol = useAppKitAccount({ namespace: "solana" });
  const { open } = useAppKit();

  // Persist any newly-connected address for the logged-in user.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const rows: Array<{ user_id: string; chain: "ethereum" | "solana"; address: string }> = [];
      if (evm.isConnected && evm.address) rows.push({ user_id: session.user.id, chain: "ethereum", address: evm.address });
      if (sol.isConnected && sol.address) rows.push({ user_id: session.user.id, chain: "solana", address: sol.address });
      if (rows.length === 0) return;
      await supabase.from("wallets").upsert(rows, { onConflict: "user_id,chain,address", ignoreDuplicates: true });
    })();
  }, [evm.isConnected, evm.address, sol.isConnected, sol.address]);

  return useMemo(
    () => ({
      ethAddress: evm.isConnected ? evm.address ?? null : null,
      solAddress: sol.isConnected ? sol.address ?? null : null,
      isConnected: evm.isConnected || sol.isConnected,
      open,
    }),
    [evm.isConnected, evm.address, sol.isConnected, sol.address, open],
  );
}
