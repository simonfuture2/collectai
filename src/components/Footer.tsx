import { Link } from "react-router-dom";
import collectaiLogo from "@/assets/collectai-logo.png";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-card/50 mt-auto">
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src={collectaiLogo} alt="CollectAI Logo" className="w-8 h-8 rounded-lg" />
              <h3 className="font-display font-bold text-gradient-primary text-lg">CollectAI</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered card identification, grading, and valuation.
            </p>
          </div>

          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
              <li><Link to="/scan" className="hover:text-foreground transition-colors">Scan</Link></li>
              <li><Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link></li>
              <li><Link to="/marketplace" className="hover:text-foreground transition-colors">Marketplace</Link></li>
              <li><Link to="/how-it-works" className="hover:text-foreground transition-colors">How It Works</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link to="/refund" className="hover:text-foreground transition-colors">Refund Policy</Link></li>
              <li><Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link></li>
              <li><Link to="/about" className="hover:text-foreground transition-colors">About</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Connect</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="mailto:support@collectai.app" className="hover:text-foreground transition-colors">support@collectai.app</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} CollectAI. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground text-center">
            AI valuations are estimates and should not be treated as professional appraisals or financial advice.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
