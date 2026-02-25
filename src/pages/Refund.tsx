import LegalPageLayout from "@/components/LegalPageLayout";

const Refund = () => {
  return (
    <LegalPageLayout title="Refund Policy" lastUpdated="February 25, 2026">
      <section>
        <h2 className="text-xl font-display font-bold">Pro Subscription</h2>
        <p className="text-muted-foreground">
          You may cancel your Pro subscription at any time. Upon cancellation, you will retain access to Pro features until the end of your current billing period. No partial refunds are issued for unused portions of a billing cycle.
        </p>
        <p className="text-muted-foreground">
          If you cancel within 48 hours of your initial subscription purchase and have not used any Pro features, you may request a full refund by contacting us at{" "}
          <a href="mailto:support@collectai.app" className="text-primary hover:underline">support@collectai.app</a>.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">Credit Packs</h2>
        <p className="text-muted-foreground">
          Credit pack purchases are non-refundable once any credits from the pack have been used. If you have not used any credits from a purchased pack, you may request a refund within 48 hours of purchase.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">Free Credits</h2>
        <p className="text-muted-foreground">
          The 3 free credits provided upon account registration are complimentary and carry no monetary value. They are non-transferable and non-refundable.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">Technical Issues</h2>
        <p className="text-muted-foreground">
          If a scan fails or produces no results due to a technical issue on our end, the credit used for that scan will be automatically restored to your account. If automatic restoration does not occur, please contact support and we will investigate and restore the credit.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">How to Request a Refund</h2>
        <p className="text-muted-foreground">
          To request a refund, email us at{" "}
          <a href="mailto:support@collectai.app" className="text-primary hover:underline">support@collectai.app</a>{" "}
          with your account email and a description of the issue. Refund requests are typically processed within 5–7 business days.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-display font-bold">Disputes</h2>
        <p className="text-muted-foreground">
          If you believe a charge was made in error, please contact us before initiating a chargeback with your bank. We are committed to resolving disputes promptly and fairly.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default Refund;
