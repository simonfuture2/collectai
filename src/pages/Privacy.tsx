import LegalPageLayout from "@/components/LegalPageLayout";
import SEO from "@/components/SEO";

const Privacy = () => {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="February 25, 2026">
      <SEO
        title="Privacy Policy – CollectAI"
        description="How CollectAI collects, uses, and protects your data — camera images, account info, payment details, and blockchain interactions."
        path="/privacy"
      />
      <section>
        <h2 className="text-xl font-display font-bold">1. Information We Collect</h2>
        <p className="text-muted-foreground">We collect the following types of information:</p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li><strong>Account Information:</strong> Email address and password when you create an account.</li>
          <li><strong>Camera Access &amp; Card Images:</strong> When you use the scan feature, we access your device camera to capture images of collectibles. These images are transmitted securely and processed by our AI to determine card identification, condition grading, and authenticity.</li>
          <li><strong>Blockchain Data:</strong> If you use AuthentiSeal features, we may interact with public blockchain addresses (e.g., Solana) to associate digital certificates of authenticity with your physical items. Only public wallet addresses are collected — we do not access or store private keys.</li>
          <li><strong>Device Data:</strong> We collect standard technical information such as operating system version and device model to ensure the AI scanner functions correctly on your hardware.</li>
          <li><strong>Payment Information:</strong> Processed securely by Stripe. We do not store your credit card details.</li>
          <li><strong>Usage Data:</strong> Information about how you interact with the Service, including scan history and collection data.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">2. How We Use Your Information</h2>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li>To provide and improve the AI card analysis service.</li>
          <li>To process payments and manage your subscription.</li>
          <li>To maintain your card collection and portfolio data.</li>
          <li>To generate AuthentiSeal digital certificates on the blockchain.</li>
          <li>To communicate with you about your account and service updates.</li>
          <li>To comply with legal obligations.</li>
        </ul>
        <p className="text-muted-foreground mt-2">
          <strong>We do not sell your personal images or data to third parties.</strong>
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">3. Third-Party Services</h2>
        <p className="text-muted-foreground">We use the following third-party services:</p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li><strong>Stripe:</strong> For payment processing. Stripe's privacy policy applies to payment data.</li>
          <li><strong>AI Models:</strong> Card images are processed by AI models for identification and grading. Images may be transmitted to AI service providers for processing.</li>
          <li><strong>Blockchain Networks:</strong> AuthentiSeal certificates are recorded on public blockchain networks (Solana). On-chain data is publicly visible and immutable.</li>
          <li><strong>Cloud Infrastructure:</strong> Your data is stored on secure cloud servers with encryption at rest and in transit.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">4. Data Storage and Security</h2>
        <p className="text-muted-foreground">
          Your data is stored securely with encryption at rest and in transit. Card images are stored in secure cloud storage. We implement industry-standard security measures to protect your information, including secure authentication, encrypted connections, and access controls. Images captured via the camera are encrypted during transmission to our AI processing servers.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">5. Data Retention and Deletion</h2>
        <p className="text-muted-foreground">
          We retain your account data and card collection for as long as your account is active. Card images are stored until you delete them or your account. Payment records are retained as required by law.
        </p>
        <p className="text-muted-foreground mt-2">
          <strong>You may request deletion of your account and all associated data</strong> (including scan history and card images) at any time by emailing{" "}
          <a href="mailto:support@collectai.app" className="text-primary hover:underline">support@collectai.app</a>.
          Deletion requests are processed within 30 days. Please note that AuthentiSeal certificates recorded on the blockchain cannot be deleted as they are immutable public records.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">6. Blockchain and Digital Certificates</h2>
        <p className="text-muted-foreground">
          AuthentiSeal certificates are created on public blockchain networks (Solana) as Non-Fungible Tokens (NFTs) for authentication purposes. Please be aware:
        </p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li>On-chain certificate data is publicly visible and permanently recorded.</li>
          <li>CollectAI does not operate as a cryptocurrency exchange or financial service.</li>
          <li>We do not store your private wallet keys. You are responsible for securing your own wallet credentials.</li>
          <li>Certificates contain card analysis metadata only — no personal information is recorded on-chain.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">7. Your Rights</h2>
        <p className="text-muted-foreground">Depending on your location, you may have the right to:</p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li>Access and download your personal data.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Request deletion of your account and associated data.</li>
          <li>Opt out of marketing communications.</li>
          <li>Lodge a complaint with a data protection authority.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">8. Cookies</h2>
        <p className="text-muted-foreground">
          We use essential cookies required for authentication and session management. We do not currently use third-party tracking or advertising cookies.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">9. Children's Privacy</h2>
        <p className="text-muted-foreground">
          The Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">10. Changes to This Policy</h2>
        <p className="text-muted-foreground">
          We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notification.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">11. Contact</h2>
        <p className="text-muted-foreground">
          For privacy-related questions, contact us at{" "}
          <a href="mailto:support@collectai.app" className="text-primary hover:underline">support@collectai.app</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default Privacy;
