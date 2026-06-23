import { Component, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import { Web3Provider } from "./components/Web3Provider";
import BottomNav from "./components/BottomNav";

const Scan = lazy(() => import("./pages/Scan"));
const Collection = lazy(() => import("./pages/Collection"));
const PackRip = lazy(() => import("./pages/PackRip"));
const CardDetail = lazy(() => import("./pages/CardDetail"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Achievements = lazy(() => import("./pages/Achievements"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const CheckoutCancel = lazy(() => import("./pages/CheckoutCancel"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Refund = lazy(() => import("./pages/Refund"));
const FAQ = lazy(() => import("./pages/FAQ"));
const About = lazy(() => import("./pages/About"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Admin = lazy(() => import("./pages/Admin"));
const IdBakeoff = lazy(() => import("./pages/admin/IdBakeoff"));
const SharedCard = lazy(() => import("./pages/SharedCard"));
const PublicCollection = lazy(() => import("./pages/PublicCollection"));
const PartnerSignup = lazy(() => import("./pages/PartnerSignup"));
const FreeGuide = lazy(() => import("./pages/FreeGuide"));
const Install = lazy(() => import("./pages/Install"));
const DeleteAccount = lazy(() => import("./pages/DeleteAccount"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceListing = lazy(() => import("./pages/MarketplaceListing"));
const CreateListing = lazy(() => import("./pages/CreateListing"));
const WalletSettings = lazy(() => import("./pages/WalletSettings"));
const DesignDemo = lazy(() => import("./pages/DesignDemo"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen bg-background" aria-hidden="true" />
);

function isChunkLoadError(error: unknown) {
  const msg = String((error as Error)?.message ?? error ?? "");
  return (
    msg.includes("Importing a module script failed") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk")
  );
}

class ChunkErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { failed: isChunkLoadError(error) };
  }

  async componentDidCatch(error: unknown) {
    if (!isChunkLoadError(error)) return;

    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch {
      // Continue to a fresh navigation even if cleanup is blocked.
    }

    const url = new URL(window.location.href);
    url.searchParams.set("_r", String(Date.now()));
    window.location.replace(url.toString());
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return <RouteFallback />;
  }
}

// Wrap only wallet-dependent routes with the Web3 stack so it isn't loaded
// on the dashboard / landing / auth pages.
const Wallet = ({ children }: { children: React.ReactNode }) => (
  <Web3Provider>{children}</Web3Provider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ChunkErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/scan" element={<Scan />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/pack-rip" element={<PackRip />} />
              <Route path="/card/:id" element={<CardDetail />} />
              <Route path="/achievements" element={<Achievements />} />
              <Route path="/marketplace" element={<Wallet><Marketplace /></Wallet>} />
              <Route path="/marketplace/:id" element={<Wallet><MarketplaceListing /></Wallet>} />
              <Route path="/marketplace/list/:cardId" element={<Wallet><CreateListing /></Wallet>} />
              <Route path="/wallets" element={<Wallet><WalletSettings /></Wallet>} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/checkout/success" element={<CheckoutSuccess />} />
              <Route path="/checkout/cancel" element={<CheckoutCancel />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/refund" element={<Refund />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/about" element={<About />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/id-bakeoff" element={<IdBakeoff />} />
              <Route path="/partners" element={<PartnerSignup />} />
              <Route path="/free-guide" element={<FreeGuide />} />
              <Route path="/card/share/:id" element={<SharedCard />} />
              <Route path="/u/:slug" element={<PublicCollection />} />
              <Route path="/install" element={<Install />} />
              <Route path="/delete-account" element={<DeleteAccount />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/design-demo" element={<DesignDemo />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <BottomNav />
        </ChunkErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
