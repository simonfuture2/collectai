import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import ScanShowcase from "@/components/social/ScanShowcase";
import { Camera, Layers, Tag, BadgeDollarSign } from "lucide-react";

const SIGNUP = `/auth?mode=signup&next=${encodeURIComponent("/scan?mode=price")}`;

const steps = [
  { icon: Camera, title: "Scan your card", text: "Take a picture of your card — raw, sleeved, in a toploader or slabbed." },
  { icon: Layers, title: "We find the match", text: "We read the name, set and number and show the closest matches, with parallels side by side." },
  { icon: BadgeDollarSign, title: "See the value", text: "Get the ungraded price plus graded values (PSA, BGS, CGC and more) from PriceCharting." },
  { icon: Tag, title: "Save it free", text: "Add the card to your collection at no cost, and run a full analysis later if you want one." },
];

export default function PriceCheckLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO
        title="What's My Card Worth? Free Photo Price Check | MyCollectAI"
        description="Free photo price check for Pokémon, One Piece, Magic, Yu-Gi-Oh!, Lorcana and sports cards. See ungraded and graded values from PriceCharting in seconds."
        path="/price-check"
      />
      <header className="container mx-auto px-4 py-4">
        <Link to="/" className="font-display text-xl font-bold">MyCollectAI</Link>
      </header>
      <main className="container mx-auto px-4 pb-16">
        <section className="max-w-3xl mx-auto text-center py-10">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">What's my card worth? Free photo price check</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Scan a Pokémon, One Piece, Magic, Yu-Gi-Oh!, Lorcana or sports card and see its ungraded and graded values in seconds. Price checks are free with a free account — no credits used.
          </p>
          <Link to={SIGNUP}>
            <Button size="lg" className="gradient-primary text-lg px-8 py-7 rounded-xl">
              <Camera className="mr-2 w-6 h-6" /> Check a card free
            </Button>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            Already have an account? <Link to={`/auth?next=${encodeURIComponent("/scan?mode=price")}`} className="underline underline-offset-4">Sign in</Link>
          </p>
        </section>

        <ScanShowcase />

        <section className="max-w-4xl mx-auto py-12">
          <h2 className="font-display text-3xl font-bold text-center mb-8">How it works</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {steps.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-6">
                <Icon className="w-7 h-7 text-primary mb-3" />
                <h3 className="font-display text-xl font-semibold mb-1">{title}</h3>
                <p className="text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-3xl mx-auto py-6">
          <h2 className="font-display text-2xl font-bold mb-3">Where the prices come from</h2>
          <p className="text-muted-foreground mb-3">
            Values come from <a href="https://www.pricecharting.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">PriceCharting</a> and are updated daily. When we can't find a match, we say so instead of guessing a price.
          </p>
          <p className="text-muted-foreground">
            Want condition, grading advice and recent eBay sales too? Run a full analysis on any saved card — see <Link to="/grading" className="underline underline-offset-4">our grading guides</Link>.
          </p>
        </section>

        <section className="text-center py-10">
          <Link to={SIGNUP}>
            <Button size="lg" className="gradient-primary px-8 rounded-xl">Check your cards free — sign up</Button>
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
