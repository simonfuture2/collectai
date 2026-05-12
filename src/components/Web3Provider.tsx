import { useEffect, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { initAppKit, wagmiAdapter } from "@/lib/web3/appkit";

export function Web3Provider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initAppKit();
  }, []);
  return <WagmiProvider config={wagmiAdapter.wagmiConfig}>{children}</WagmiProvider>;
}
