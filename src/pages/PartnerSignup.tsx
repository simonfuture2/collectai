import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import collectaiLogo from "@/assets/collectai-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle, Handshake } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Footer from "@/components/Footer";

const PartnerSignup = () => {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setLoading(true);
    const { error } = await supabase.functions.invoke("partner-signup", { body: form });
    setLoading(false);
    if (error) {
      toast.error("Something went wrong. Please try again.");
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <img src={collectaiLogo} alt="CollectAI" className="w-8 h-8 rounded-lg" />
            <span className="text-xl font-display font-bold text-gradient-primary">CollectAI</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12 max-w-lg">
        {submitted ? (
          <Card className="text-center">
            <CardContent className="pt-10 pb-10 space-y-4">
              <CheckCircle className="w-16 h-16 text-primary mx-auto" />
              <h2 className="text-2xl font-bold">Thank you!</h2>
              <p className="text-muted-foreground">We've received your partner interest form. Our team will reach out to you soon.</p>
              <Button asChild variant="outline">
                <Link to="/">Back to Home</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto bg-primary/10 rounded-full p-3 w-fit mb-2">
                <Handshake className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Become a Partner</CardTitle>
              <CardDescription>
                Join the CollectAI partner program and help grow the future of AI-powered collectibles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your full name" maxLength={100} required />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" maxLength={255} required />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" maxLength={20} />
                </div>
                <div>
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Your company name" maxLength={100} />
                </div>
                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tell us about your interest..." maxLength={1000} rows={4} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Submitting..." : "Submit Partner Interest"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default PartnerSignup;
