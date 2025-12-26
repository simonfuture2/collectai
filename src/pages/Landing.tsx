import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Camera, Sparkles, TrendingUp, Wallet } from "lucide-react";
import PoweredByW3AI from "@/components/PoweredByW3AI";

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold text-gradient-primary">CollectAI</h1>
        <Link to="/auth">
          <Button variant="outline" className="border-primary/50 hover:bg-primary/10">Sign In</Button>
        </Link>
      </header>

      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-8">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary">AI-Powered Card Analysis</span>
          </div>
          
          <h2 className="text-5xl md:text-7xl font-display font-bold mb-6">
            Know Your Cards'
            <span className="text-gradient-primary block">True Value</span>
          </h2>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Snap a photo of any trading card and instantly get AI-powered identification, 
            condition grading, and real-time market values.
          </p>
          
          <Link to="/auth">
            <Button size="lg" className="gradient-primary text-lg px-8 py-6 rounded-xl glow-purple hover-lift">
              <Camera className="mr-2 w-5 h-5" />
              Start Scanning Free
            </Button>
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-24">
          {[
            { icon: Camera, title: "Instant ID", desc: "Snap a photo and get card name, set, year, and rarity in seconds", color: "text-primary" },
            { icon: TrendingUp, title: "Live Pricing", desc: "Real-time values from eBay, TCGPlayer, and PSA population data", color: "text-secondary" },
            { icon: Wallet, title: "Track Value", desc: "Build your collection and watch your total portfolio grow", color: "text-accent" },
          ].map((f, i) => (
            <div key={i} className="p-8 rounded-2xl bg-card border border-border hover-lift">
              <f.icon className={`w-12 h-12 ${f.color} mb-4`} />
              <h3 className="text-xl font-display font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="container mx-auto px-4 py-8 text-center border-t border-border/30">
        <PoweredByW3AI />
      </footer>
    </div>
  );
};

export default Landing;
