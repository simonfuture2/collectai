import LegalPageLayout from "@/components/LegalPageLayout";
import { Brain, Camera, Link2, Shield, BarChart3, Globe, AlertTriangle } from "lucide-react";

const About = () => {
  return (
    <LegalPageLayout title="About CollectAI" lastUpdated="February 25, 2026">
      {/* Hero statement */}
      <div className="mb-10">
        <p className="text-xl font-display font-semibold text-foreground mb-3">
          Stop guessing the grade. Start sealing the value.
        </p>
        <p className="text-muted-foreground text-base leading-relaxed">
          CollectAI brings professional-grade artificial intelligence to your pocket. Whether you're a Pokémon master, 
          a Magic enthusiast, or a high-stakes sports card investor, CollectAI gives you the tools to authenticate and 
          value your collection in seconds.
        </p>
      </div>

      {/* Features */}
      <section className="mb-8">
        <h2 className="text-xl font-display font-bold mb-4">What CollectAI Does</h2>
        <div className="space-y-6">
          <Feature
            icon={Camera}
            title="CollectAI Scanner"
            description="Our advanced AI analyzes centering, edges, corners, and surface quality from your card photos to provide an instant estimated grade. Optimized for Pokémon, Magic: The Gathering, Yu-Gi-Oh!, and major sports cards including basketball, baseball, and football."
          />
          <Feature
            icon={Link2}
            title="AuthentiSeal Integration"
            description="Powered by the Solana blockchain. Generate a permanent, tamper-proof digital certificate for your physical cards. AuthentiSeal certificates are Non-Fungible Tokens (NFTs) used solely for authentication — CollectAI is not a cryptocurrency exchange."
          />
          <Feature
            icon={BarChart3}
            title="Real-Time Market Insights"
            description="Sync your grades with current market data from eBay sold listings, TCGPlayer, and PSA population reports to track the total value of your collection — from a shoebox in the basement to full store inventory."
          />
          <Feature
            icon={Globe}
            title="W3MCT Ecosystem"
            description="CollectAI is part of the W3MCT Forge — merging physical collectibles with the future of Web3 technology. Built by collectors, for collectors."
          />
        </div>
      </section>

      {/* Why section */}
      <section className="mb-8">
        <h2 className="text-xl font-display font-bold mb-3">Why CollectAI?</h2>
        <p className="text-muted-foreground leading-relaxed">
          Don't wait weeks for mail-in grading. Get an instant analysis of your Charizard, LeBron rookie, or Black Lotus. 
          Perfect for pre-grading cards before sending them to PSA or BGS, or for verifying trades at local card shows. 
          Your collection deserves more than guesswork.
        </p>
      </section>

      {/* Trust & Compliance Disclosures */}
      <section className="mb-8">
        <h2 className="text-xl font-display font-bold mb-4">How We Protect You</h2>
        <div className="space-y-6">
          <Feature
            icon={Brain}
            title="AI Transparency"
            description="All card identifications, condition grades, and valuations are AI-generated estimates only. AI features are currently in beta and continuously improving. Results are not professional appraisals, certified grades, or guaranteed market values. For high-value cards, we always recommend certified grading services."
          />
          <Feature
            icon={Shield}
            title="Privacy & Security"
            description="Your card images and collection data are encrypted at rest and in transit. We do not sell your images or personal data to third parties. Camera access is used solely for card scanning. Payment processing is handled securely by Stripe — we never see or store your card numbers."
          />
          <Feature
            icon={AlertTriangle}
            title="Blockchain Disclosure"
            description="AuthentiSeal certificates are recorded on public blockchain networks (Solana) and are publicly visible and immutable. Only card analysis metadata is stored on-chain — no personal information. CollectAI does not operate as a cryptocurrency exchange or financial service. You are responsible for securing your own wallet credentials."
          />
        </div>
      </section>

      {/* Data deletion + contact */}
      <section className="p-5 rounded-xl bg-muted/50 border border-border">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Data Deletion:</strong> You may request deletion of your account and all associated data at any time by emailing{" "}
          <a href="mailto:support@collectai.app" className="text-primary hover:underline">support@collectai.app</a>. 
          Requests are processed within 30 days. On-chain AuthentiSeal certificates cannot be removed as they are immutable records.
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          For full details, see our{" "}
          <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>,{" "}
          <a href="/terms" className="text-primary hover:underline">Terms of Service</a>, and{" "}
          <a href="/faq" className="text-primary hover:underline">FAQ</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
};

const Feature = ({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) => (
  <div className="flex gap-4">
    <div className="shrink-0 p-2.5 rounded-lg bg-primary/10 h-fit">
      <Icon className="w-5 h-5 text-primary" />
    </div>
    <div>
      <h3 className="font-display font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  </div>
);

export default About;
