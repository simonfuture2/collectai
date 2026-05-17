import { useEffect, useState, type ReactNode } from "react";

/**
 * Lazy wallet provider. The Reown AppKit + Wagmi + Solana adapter stack is
 * heavy (hundreds of KB) and was previously loaded on every page, slowing
 * down post-sign-in dashboard render. Mount this ONLY around routes that
 * actually need wallet connectivity (Marketplace, WalletSettings, etc).
 */
export function Web3Provider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<{
    WagmiProvider: any;
    config: any;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ WagmiProvider }, { initAppKit, wagmiAdapter }] = await Promise.all([
        import("wagmi"),
        import("@/lib/web3/appkit"),
      ]);
      initAppKit();
      if (!cancelled) {
        setStack({ WagmiProvider, config: wagmiAdapter.wagmiConfig });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stack) return <>{children}</>;
  const { WagmiProvider, config } = stack;
  return <WagmiProvider config={config}>{children}</WagmiProvider>;
}
