import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft } from "lucide-react";

const CheckoutCancel = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-display font-bold">Payment Cancelled</h1>
        <p className="text-muted-foreground">
          No worries — you weren't charged. You can try again whenever you're ready.
        </p>
        <div className="flex flex-col gap-3">
          <Link to="/pricing">
            <Button className="w-full gradient-primary">
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back to Pricing
            </Button>
          </Link>
          <Link to="/dashboard">
            <Button variant="outline" className="w-full">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CheckoutCancel;
