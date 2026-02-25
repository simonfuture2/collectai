import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Footer from "./Footer";
import ThemeToggle from "./ThemeToggle";

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

const LegalPageLayout = ({ title, lastUpdated, children }: LegalPageLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <h1 className="text-xl font-display font-bold flex-1">{title}</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-3xl flex-1">
        <p className="text-sm text-muted-foreground mb-8">Last updated: {lastUpdated}</p>
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default LegalPageLayout;
