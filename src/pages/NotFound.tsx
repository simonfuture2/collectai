import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-8xl font-display font-bold text-gradient-primary mb-4">404</h1>
          <h2 className="text-2xl font-display font-semibold mb-2">Page Not Found</h2>
          <p className="text-muted-foreground mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/">
              <Button className="gradient-primary">
                <Home className="mr-2 w-4 h-4" />
                Go Home
              </Button>
            </Link>
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="mr-2 w-4 h-4" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default NotFound;
