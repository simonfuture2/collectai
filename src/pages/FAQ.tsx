import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";

const faqs = [
  {
    q: "What types of cards does MyCollectAI support?",
    a: "MyCollectAI can identify and analyze trading cards across major categories including Pokémon, Magic: The Gathering, Yu-Gi-Oh!, sports cards (baseball, basketball, football, hockey), and other collectible cards. Our AI is continuously trained on new card sets and categories.",
  },
  {
    q: "How accurate is the AI grading?",
    a: "Our AI provides condition estimates based on visual analysis of your card images. While our grading correlates well with professional graders, it is an estimate only and should not be considered a substitute for certified grading from PSA, BGS, CGC, or SGC. For high-value cards, we always recommend professional grading.",
  },
  {
    q: "How are market values determined?",
    a: "Our AI estimates market values based on recent comparable sales data, including eBay sold listings, TCGPlayer market prices, and PSA population data. Values are estimates and can fluctuate with market conditions. They should not be treated as guaranteed sale prices.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "When your credits reach zero, you won't be able to perform new AI scans until you purchase more credits or subscribe to Pro. Your existing collection and all previously scanned cards remain fully accessible. You can purchase credit packs starting at $9.99 for 10 credits.",
  },
  {
    q: "Can I cancel my Pro subscription?",
    a: "Yes, you can cancel your Pro subscription at any time from the Pricing page. After cancellation, you'll retain Pro access until the end of your current billing period. Your collection data is never deleted when you cancel.",
  },
  {
    q: "How do refunds work?",
    a: "Pro subscriptions can be refunded within 48 hours of the initial purchase if no Pro features have been used. Credit packs can be refunded within 48 hours if no credits have been consumed. For full details, see our Refund Policy.",
  },
  {
    q: "Is my card data private and secure?",
    a: "Yes. Your card images and collection data are stored securely with encryption at rest and in transit. Only you can access your collection. We do not share your card images or data with other users. Payment information is handled securely by Stripe — we never see or store your card numbers.",
  },
  {
    q: "What is AuthentiSeal?",
    a: "AuthentiSeal is our digital authenticity certificate system, available to Pro subscribers. It uses blockchain technology (Solana) to create tamper-proof, publicly verifiable certificates of your card's AI analysis results, including the identification, condition assessment, and valuation at the time of scanning. These certificates are Non-Fungible Tokens (NFTs) used solely for authentication — MyCollectAI is not a cryptocurrency exchange.",
  },
  {
    q: "Does MyCollectAI access my camera?",
    a: "Yes, MyCollectAI uses your device camera solely for the purpose of scanning collectible cards. Images captured are encrypted in transit and sent to our AI servers for analysis. We do not access your camera for any other purpose, and images are only stored in your personal collection. You can revoke camera access at any time through your device settings.",
  },
  {
    q: "How many images should I upload per card?",
    a: "For the best results, upload both the front and back of the card. You can also add additional views for cards with unique features (holo patterns, signatures, etc.). More angles give the AI more data to work with for accurate identification and grading.",
  },
  {
    q: "Do credits expire?",
    a: "No, purchased credits never expire. They remain in your account until used. Free credits provided at registration also do not expire.",
  },
];

const FAQ = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title="FAQ – Trading Card AI Grading Questions | MyCollectAI"
        description="Answers about supported card types, AI grading accuracy, credit packs, Pro subscription, and how MyCollectAI valuations work."
        path="/faq"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <h1 className="text-xl font-display font-bold flex-1">Frequently Asked Questions</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-3xl flex-1">
        <Accordion type="single" collapsible className="space-y-2">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="bg-card border border-border rounded-xl px-4">
              <AccordionTrigger className="text-left font-display font-semibold text-sm hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-10 text-center">
          <p className="text-sm text-muted-foreground mb-2">Still have questions?</p>
          <a href="mailto:support@collectai.app">
            <Button variant="outline">Contact Support</Button>
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FAQ;
