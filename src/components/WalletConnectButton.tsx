import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function WalletConnectButton({ size = "default" as "default" | "sm" }) {
  const { ethAddress, solAddress, isConnected, open } = useWallet();
  const label = isConnected
    ? short(ethAddress ?? solAddress ?? "")
    : "Connect Wallet";
  return (
    <Button size={size} variant={isConnected ? "outline" : "default"} onClick={() => open()}>
      <Wallet />
      {label}
    </Button>
  );
}
