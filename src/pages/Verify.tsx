import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import AuthentiSealVerify from "@/components/AuthentiSealVerify";
import collectaiLogo from "@/assets/collectai-logo.png";

const Verify = () => (
  <div className="min-h-screen bg-background">
    <SEO
      title="Verify an AuthentiSeal Certificate – MyCollectAI"
      description="Look up any AuthentiSeal certificate instantly. Blockchain-backed proof of authenticity."
      path="/verify"
    />
    <header className="container mx-auto px-4 py-6 flex justify-between items-center">
      <Link to="/" className="flex items-center gap-2">
        <img src={collectaiLogo} alt="MyCollectAI Logo" width={40} height={40} className="w-10 h-10 rounded-lg" />
        <span className="text-2xl font-display font-bold text-gradient-primary">MyCollectAI</span>
      </Link>
      <ThemeToggle />
    </header>
    <main className="container mx-auto px-4 py-12 max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-collectai-green/10 border border-collectai-green/30 mb-6">
        <Shield className="w-4 h-4 text-collectai-green" />
        <span className="text-sm text-collectai-green font-medium">On-Chain Verification</span>
      </div>
      <h1 className="text-3xl md:text-5xl font-display font-bold mb-3">
        Verify Any <span className="text-gradient-primary">Certificate</span>
      </h1>
      <p className="text-muted-foreground mb-8">
        Look up any AuthentiSeal certificate instantly. Blockchain-backed proof of authenticity.
      </p>
      <AuthentiSealVerify verifyOnly className="text-left" />
    </main>
    <Footer />
  </div>
);

export default Verify;
