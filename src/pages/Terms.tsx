import LegalPageLayout from "@/components/LegalPageLayout";
import SEO from "@/components/SEO";

const Terms = () => {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="February 25, 2026">
      <SEO
        title="Terms of Service – MyCollectAI"
        description="The terms governing your use of MyCollectAI's AI card grading service, account responsibilities, AI disclaimers, and payments."
        path="/terms"
      />
      <section>
        <h2 className="text-xl font-display font-bold">1. Acceptance of Terms</h2>
        <p className="text-muted-foreground">
          By accessing or using MyCollectAI ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">2. Description of Service</h2>
        <p className="text-muted-foreground">
          MyCollectAI provides AI-powered trading card identification, condition grading, and market valuation tools. Our Service uses artificial intelligence to analyze images of collectible cards and provide estimated information including card identity, condition assessment, and market value ranges.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">3. User Accounts</h2>
        <p className="text-muted-foreground">
          You must create an account to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must provide accurate and complete information when creating your account.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">4. AI Disclaimer &amp; Limitation of AI Services</h2>
        <p className="text-muted-foreground">
          All card identifications, condition grades, and valuations provided by MyCollectAI are AI-generated estimates only. <strong>AI grading and valuation features are currently in beta and continuously improving. Results should be considered estimates only.</strong> They are <strong>not</strong> professional appraisals, certified grades, or guaranteed market values.
        </p>
        <p className="text-muted-foreground mt-2">
          <strong>You acknowledge and agree that:</strong>
        </p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1 mt-1">
          <li>AI valuations are rough estimates and may differ significantly from actual market prices. They should never be relied upon as the sole basis for buying, selling, or insuring collectible cards.</li>
          <li>MyCollectAI is <strong>not liable</strong> for any financial losses, missed opportunities, or damages arising from decisions made based on AI-generated grades, values, or identifications.</li>
          <li>For high-value cards or transactions exceeding $100, you should seek professional grading from certified services such as PSA, BGS, CGC, or SGC, and verify market values through independent sources.</li>
          <li>Market values fluctuate constantly. An estimate provided today may be significantly different from actual sale prices at any given time.</li>
          <li>AI identification may occasionally misidentify cards, especially variants, parallels, or cards with similar artwork. Always verify identification before making financial decisions.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">5. Blockchain and Digital Certificates</h2>
        <p className="text-muted-foreground">
          MyCollectAI's AuthentiSeal feature uses blockchain technology (Solana) to create Non-Fungible Tokens (NFTs) / Digital Assets for authentication purposes. AuthentiSeal certificates provide a verifiable, tamper-proof record of your card's AI analysis results. Please be aware:
        </p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li>Certificates are public and immutable once created on the blockchain.</li>
          <li>MyCollectAI is not a cryptocurrency exchange and does not facilitate trading of digital assets.</li>
          <li>You are responsible for maintaining access to your own wallet credentials.</li>
          <li>On-chain data cannot be modified or deleted after creation.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">6. Credits and Subscriptions</h2>
        <p className="text-muted-foreground">
          The Service offers free credits upon registration, one-time credit pack purchases, and a Pro subscription plan. Credits are consumed when using the AI scan feature. Pro subscribers receive unlimited scans during their active subscription period. Credits do not expire but are non-transferable and non-refundable except as outlined in our Refund Policy.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">7. Payments and Billing</h2>
        <p className="text-muted-foreground">
          Payments are processed through Stripe. By making a purchase, you agree to Stripe's terms of service. Subscription fees are billed monthly and will automatically renew unless cancelled. You can manage or cancel your subscription at any time through the Pricing page.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">8. Acceptable Use</h2>
        <p className="text-muted-foreground">
          You agree not to: (a) use the Service for any unlawful purpose; (b) upload images containing inappropriate or harmful content; (c) attempt to reverse-engineer, decompile, or exploit the Service; (d) share your account credentials with others; (e) use automated tools to scrape or access the Service in bulk.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">9. Intellectual Property</h2>
        <p className="text-muted-foreground">
          The Service, including its AI models, algorithms, design, and branding, is the property of MyCollectAI. You retain ownership of images you upload but grant MyCollectAI a limited license to process them for the purpose of providing the Service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">10. Limitation of Liability</h2>
        <p className="text-muted-foreground">
          MyCollectAI shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. Our total liability shall not exceed the amount paid by you to MyCollectAI in the 12 months preceding the claim. The Service is provided "as is" without warranties of any kind.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">11. Termination</h2>
        <p className="text-muted-foreground">
          We may suspend or terminate your account at any time for violations of these terms. You may delete your account at any time. Upon termination, your right to use the Service will cease immediately. Any unused credits will be forfeited unless otherwise required by applicable law.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">12. Changes to Terms</h2>
        <p className="text-muted-foreground">
          We reserve the right to modify these terms at any time. We will notify users of material changes via email or in-app notification. Continued use of the Service after changes constitutes acceptance of the updated terms.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">13. Contact</h2>
        <p className="text-muted-foreground">
          For questions about these Terms, please contact us at{" "}
          <a href="mailto:support@collectai.app" className="text-primary hover:underline">support@collectai.app</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default Terms;
