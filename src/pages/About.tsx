import LegalPageLayout from "@/components/LegalPageLayout";
import { Brain, Link2, Shield, Camera, AlertTriangle } from "lucide-react";

const sections = [
  {
    icon: Brain,
    title: "AI-Powered Analysis",
    content:
      "CollectAI uses artificial intelligence to identify trading cards, estimate their condition grade, and provide market valuations. All AI results are estimates only and are not professional appraisals, certified grades, or guaranteed sale prices. AI grading and valuation features are currently in beta and continuously improving. For high-value cards, we always recommend certified grading from PSA, BGS, CGC, or SGC.",
  },
  {
    icon: Camera,
    title: "Camera & Image Processing",
    content:
      "The app accesses your device camera solely to capture images of collectible cards for AI analysis. Images are encrypted in transit and processed on secure cloud servers. We do not use your camera for any other purpose. You can revoke camera permissions at any time through your device settings.",
  },
  {
    icon: Link2,
    title: "Blockchain & AuthentiSeal Certificates",
    content:
      "AuthentiSeal certificates use blockchain technology (Solana) to create tamper-proof, publicly verifiable records of card analysis results. Certificates are Non-Fungible Tokens (NFTs) used solely for authentication purposes. CollectAI is not a cryptocurrency exchange and does not facilitate the trading of digital assets or cryptocurrencies. On-chain certificate data is publicly visible and permanently recorded — it cannot be modified or deleted after creation. Only card analysis metadata is stored on-chain; no personal information is recorded.",
  },
  {
    icon: Shield,
    title: "Data Privacy & Security",
    content:
      "Your card images and collection data are stored securely with encryption at rest and in transit. Only you can access your collection. We do not sell your personal images or data to third parties. Payment information is handled by Stripe — we never see or store your card numbers. You may request deletion of your account and all associated data by emailing support@collectai.app.",
  },
  {
    icon: AlertTriangle,
    title: "Important Disclaimers",
    content:
      "CollectAI is not a financial advisor, professional grading service, or cryptocurrency exchange. AI-generated grades, identifications, and valuations are estimates only and should not be the sole basis for purchasing, selling, or insuring collectibles. Market values fluctuate and past performance does not guarantee future results. AuthentiSeal certificates verify AI analysis results — they do not replace professional authentication or grading.",
  },
];

const About = () => {
  return (
    <LegalPageLayout title="About CollectAI" lastUpdated="February 25, 2026">
      <p className="text-muted-foreground text-base mb-8">
        CollectAI is an AI-powered trading card analysis platform that helps collectors identify cards, assess condition, track market values, and generate blockchain-backed authenticity certificates.
      </p>

      {sections.map((section, i) => (
        <section key={i} className="mb-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <section.icon className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-display font-bold">{section.title}</h2>
          </div>
          <p className="text-muted-foreground">{section.content}</p>
        </section>
      ))}

      <section className="mt-6 p-4 rounded-xl bg-muted/50 border border-border">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Questions?</strong> Contact us at{" "}
          <a href="mailto:support@collectai.app" className="text-primary hover:underline">
            support@collectai.app
          </a>
          . For full details, see our{" "}
          <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>,{" "}
          <a href="/terms" className="text-primary hover:underline">Terms of Service</a>, and{" "}
          <a href="/faq" className="text-primary hover:underline">FAQ</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default About;
