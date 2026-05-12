import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/hooks/use-wallet";

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function WalletConnectButton({ size = "default" as "default" | "sm" }) {
  const { ethAddress, solAddress, isConnected, open } = useWallet();
  const navigate = useNavigate();
  const label = isConnected ? short(ethAddress ?? solAddress ?? "") : "Connect Wallet";
  return (
    <Button
      size={size}
      variant={isConnected ? "outline" : "default"}
      onClick={() => (isConnected ? navigate("/wallets") : open())}
    >
      <Wallet />
      {label}
    </Button>
  );
}
