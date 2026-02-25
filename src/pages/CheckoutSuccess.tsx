import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const CheckoutSuccess = () => {
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          window.location.href = "/dashboard";
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-display font-bold">Payment Successful!</h1>
        <p className="text-muted-foreground">
          Your purchase has been confirmed. Credits or subscription will be activated shortly.
        </p>
        <div className="flex flex-col gap-3">
          <Link to="/dashboard">
            <Button className="w-full gradient-primary">
              <Sparkles className="mr-2 w-4 h-4" />
              Go to Dashboard
            </Button>
          </Link>
          <Link to="/scan">
            <Button variant="outline" className="w-full">Start Scanning</Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Redirecting in {countdown}s…
        </p>
      </div>
    </div>
  );
};

export default CheckoutSuccess;
