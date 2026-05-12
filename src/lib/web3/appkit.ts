import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { mainnet } from "@reown/appkit/networks";
import { solana } from "@reown/appkit/networks";

// Public Reown project ID. Replace via env if needed.
const projectId =
  (import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined) ||
  "a3b1c8d4e5f60718293a4b5c6d7e8f90";

const metadata = {
  name: "CollectAI Marketplace",
  description: "Trade collectibles on Ethereum & Solana",
  url: typeof window !== "undefined" ? window.location.origin : "https://mycollectai.com",
  icons: ["https://mycollectai.com/favicon.ico"],
};

const networks = [mainnet, solana] as const;

export const wagmiAdapter = new WagmiAdapter({
  networks: networks as any,
  projectId,
  ssr: false,
});

export const solanaAdapter = new SolanaAdapter({});

let initialized = false;
export function initAppKit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  createAppKit({
    adapters: [wagmiAdapter, solanaAdapter],
    networks: networks as any,
    projectId,
    metadata,
    features: { analytics: false, email: false, socials: false },
  });
}
