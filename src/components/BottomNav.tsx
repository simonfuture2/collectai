import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Layers, Trophy, Store, Camera } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/collection",
  "/scan",
  "/achievements",
  "/marketplace",
  "/pack-rip",
  "/card/",
  "/wallets",
  "/pricing",
];

const HIDDEN_PREFIXES = [
  "/card/share",
];

function shouldShow(pathname: string) {
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  return APP_ROUTE_PREFIXES.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")
  );
}

type Tab = {
  to: string;
  label: string;
  icon: typeof Home;
  match: (path: string) => boolean;
};

const TABS: Tab[] = [
  { to: "/dashboard", label: "Home", icon: Home, match: (p) => p === "/dashboard" },
  { to: "/collection", label: "Collection", icon: Layers, match: (p) => p.startsWith("/collection") || p.startsWith("/card/") },
  { to: "/achievements", label: "Awards", icon: Trophy, match: (p) => p.startsWith("/achievements") },
  { to: "/marketplace", label: "Market", icon: Store, match: (p) => p.startsWith("/marketplace") },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  if (!shouldShow(location.pathname)) return null;

  const scanActive = location.pathname.startsWith("/scan");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 pointer-events-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      <div className="mx-auto max-w-md px-4">
        <div
          className={cn(
            "pointer-events-auto relative flex items-end justify-between gap-1 rounded-2xl px-3 pt-2 pb-2",
            "border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.45)]",
            "bg-[rgba(20,20,22,0.65)] backdrop-blur-xl backdrop-saturate-150"
          )}
        >
          {TABS.slice(0, 2).map((tab) => (
            <TabButton key={tab.to} tab={tab} active={tab.match(location.pathname)} />
          ))}

          {/* Center raised Scan button */}
          <div className="relative -mt-8 flex-1 flex justify-center">
            <motion.button
              type="button"
              onClick={() => navigate("/scan")}
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              aria-label="Scan a card"
              aria-current={scanActive ? "page" : undefined}
              className={cn(
                "relative flex h-16 w-16 items-center justify-center rounded-full",
                "shadow-[0_10px_30px_-6px_rgba(212,175,55,0.55)]",
                "ring-4 ring-[rgba(20,20,22,0.85)]",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/50"
              )}
              style={{ background: "var(--gradient-gold)" }}
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-full opacity-60 blur-md"
                style={{ background: "var(--gradient-gold)" }}
              />
              <Camera className="relative h-7 w-7 text-black" strokeWidth={2.5} />
            </motion.button>
          </div>

          {TABS.slice(2).map((tab) => (
            <TabButton key={tab.to} tab={tab} active={tab.match(location.pathname)} />
          ))}
        </div>
      </div>
    </nav>
  );
}

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <motion.div whileTap={{ scale: 0.9 }} className="flex-1">
      <Link
        to={tab.to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]")} />
        <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
      </Link>
    </motion.div>
  );
}

export default BottomNav;
