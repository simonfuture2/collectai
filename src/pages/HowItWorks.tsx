import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import LegalPageLayout from "@/components/LegalPageLayout";
import {
  UserPlus,
  Camera,
  Brain,
  Save,
  ShieldCheck,
  Lightbulb,
  Sun,
  Layers,
  RotateCcw,
  Upload,
  Focus,
  Star,
  TrendingUp,
  Lock,
  Sparkles,
} from "lucide-react";

const steps = [
  {
    number: 1,
    title: "Sign Up & Get Free Scans",
    icon: UserPlus,
    color: "from-primary/20 to-primary/5",
    iconBg: "bg-primary/15 text-primary",
    description:
      "Create your free account in seconds. Every new user receives complimentary scan credits to start building their collection profile — no credit card required.",
    visual: (
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">Welcome Bonus</p>
            <p className="text-xs text-muted-foreground">3 free scans included</p>
          </div>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1 h-2 rounded-full bg-primary/30" />
          ))}
          {[4, 5].map((i) => (
            <div key={i} className="flex-1 h-2 rounded-full bg-muted" />
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">3 / 5 credits available</p>
      </div>
    ),
  },
  {
    number: 2,
    title: "Upload or Snap Your Card",
    icon: Camera,
    color: "from-accent/20 to-accent/5",
    iconBg: "bg-accent/15 text-accent-foreground",
    description:
      "Use your device camera to snap a photo, or upload an existing image. Our scanner accepts Pokémon, Magic: The Gathering, Yu-Gi-Oh!, and all major sports cards.",
    visual: (
      <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">Drag & drop or tap to upload</p>
        <div className="flex gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">JPG</span>
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">PNG</span>
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">Camera</span>
        </div>
      </div>
    ),
  },
  {
    number: 3,
    title: "AI Analyzes Your Card",
    icon: Brain,
    color: "from-secondary/40 to-secondary/10",
    iconBg: "bg-secondary text-secondary-foreground",
    description:
      "Our neural network examines centering, edges, corners, and surface quality. It cross-references thousands of graded card data points to generate an Estimated Grade — all in seconds.",
    visual: (
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Focus className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">AI Analysis in Progress</span>
        </div>
        {[
          { label: "Centering", value: 92 },
          { label: "Edges", value: 88 },
          { label: "Corners", value: 95 },
          { label: "Surface", value: 90 },
        ].map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium text-foreground">{item.value}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${item.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    number: 4,
    title: "Review Results & Save",
    icon: Save,
    color: "from-primary/15 to-primary/5",
    iconBg: "bg-primary/15 text-primary",
    description:
      "View your estimated grade, current market value, and comparable sales data. Save cards to your collection, organize them into folders, and track your portfolio value over time.",
    visual: (
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Estimated Grade</p>
            <p className="text-2xl font-bold text-primary">PSA 9</p>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <Star key={i} className="w-4 h-4 fill-primary text-primary" />
            ))}
            <Star className="w-4 h-4 text-muted" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Market Value</p>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-primary" /> $120 – $180
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Category</p>
            <p className="text-sm font-semibold text-foreground">Pokémon TCG</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    number: 5,
    title: "Seal with AuthentiSeal™",
    icon: ShieldCheck,
    color: "from-accent/20 to-accent/5",
    iconBg: "bg-accent/15 text-accent-foreground",
    description:
      "Lock in your grade with a tamper-proof digital certificate on the Solana blockchain. AuthentiSeal creates a permanent, verifiable record that buyers and traders can trust — no middleman required.",
    visual: (
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">AuthentiSeal™ Certificate</p>
            <p className="text-xs text-muted-foreground">Verified on Solana</p>
          </div>
        </div>
        <div className="rounded-lg bg-muted/30 p-3 font-mono text-xs text-muted-foreground break-all">
          seal_7xK9...mN2pQ
        </div>
        <div className="flex items-center gap-2 text-xs text-primary">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="font-medium">Blockchain Verified</span>
        </div>
      </div>
    ),
  },
];

const tips = [
  {
    icon: Sun,
    title: "Use Good Lighting",
    description: "Natural or bright diffused light reveals surface details the AI needs for an accurate grade.",
  },
  {
    icon: RotateCcw,
    title: "Try Multiple Angles",
    description: "Capture both front and back. Different angles help the AI detect edge wear and corner softness.",
  },
  {
    icon: Layers,
    title: "Flat Surface, No Sleeves",
    description: "Place the card on a clean, flat surface. Remove toploaders or sleeves to avoid glare and distortion.",
  },
];

const HowItWorks = () => {
  useEffect(() => { document.title = "How CollectAI Works – AI Card Grading in 5 Steps"; }, []);
  return (
    <LegalPageLayout title="How It Works" lastUpdated="June 2025">
      {/* Hero */}
      <div className="text-center mb-12 -mt-2">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-3">
          How CollectAI Works
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          From snap to seal in five simple steps. Here's how our AI-powered platform helps you
          identify, grade, and authenticate your cards.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-16">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.number} className="space-y-5">
              {/* Step header */}
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  {step.number}
                </div>
                <div className={`p-2.5 rounded-xl ${step.iconBg}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-display font-bold text-foreground">{step.title}</h3>
              </div>
              <p className="text-muted-foreground pl-12 md:pl-16">{step.description}</p>
              {/* Visual mock */}
              <div className="pl-12 md:pl-16 max-w-md">{step.visual}</div>
            </div>
          );
        })}
      </div>

      {/* Pro Tips */}
      <div className="mt-20">
        <div className="flex items-center gap-2 mb-6">
          <Lightbulb className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-display font-bold text-foreground">Pro Tips for Better Scans</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {tips.map((tip) => {
            const Icon = tip.icon;
            return (
              <Card key={tip.title} className="border-border">
                <CardContent className="p-5 space-y-2">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <h4 className="font-semibold text-sm text-foreground">{tip.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{tip.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-16 text-center space-y-4">
        <h3 className="text-2xl font-display font-bold text-foreground">Ready to scan your first card?</h3>
        <p className="text-muted-foreground">It only takes a few seconds — and your first scans are free.</p>
        <Link to="/scan">
          <Button size="lg" className="mt-2">
            Start Scanning
          </Button>
        </Link>
      </div>
    </LegalPageLayout>
  );
};

export default HowItWorks;
