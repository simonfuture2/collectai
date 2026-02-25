import LegalPageLayout from "@/components/LegalPageLayout";

const Privacy = () => {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="February 25, 2026">
      <section>
        <h2 className="text-xl font-display font-bold">1. Information We Collect</h2>
        <p className="text-muted-foreground">We collect the following types of information:</p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li><strong>Account Information:</strong> Email address and password when you create an account.</li>
          <li><strong>Card Images:</strong> Photos you upload for AI analysis.</li>
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
          <li>To communicate with you about your account and service updates.</li>
          <li>To comply with legal obligations.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">3. Third-Party Services</h2>
        <p className="text-muted-foreground">We use the following third-party services:</p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li><strong>Stripe:</strong> For payment processing. Stripe's privacy policy applies to payment data.</li>
          <li><strong>AI Models:</strong> Card images are processed by AI models for identification and grading. Images may be transmitted to AI service providers for processing.</li>
          <li><strong>Cloud Infrastructure:</strong> Your data is stored on secure cloud servers with encryption at rest and in transit.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">4. Data Storage and Security</h2>
        <p className="text-muted-foreground">
          Your data is stored securely with encryption at rest and in transit. Card images are stored in secure cloud storage. We implement industry-standard security measures to protect your information, including secure authentication, encrypted connections, and access controls.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">5. Data Retention</h2>
        <p className="text-muted-foreground">
          We retain your account data and card collection for as long as your account is active. Card images are stored until you delete them or your account. Payment records are retained as required by law.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">6. Your Rights</h2>
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
        <h2 className="text-xl font-display font-bold">7. Cookies</h2>
        <p className="text-muted-foreground">
          We use essential cookies required for authentication and session management. We do not currently use third-party tracking or advertising cookies.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">8. Children's Privacy</h2>
        <p className="text-muted-foreground">
          The Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">9. Changes to This Policy</h2>
        <p className="text-muted-foreground">
          We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notification.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">10. Contact</h2>
        <p className="text-muted-foreground">
          For privacy-related questions, contact us at{" "}
          <a href="mailto:support@collectai.app" className="text-primary hover:underline">support@collectai.app</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default Privacy;
