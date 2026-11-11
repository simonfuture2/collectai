import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import collectaiLogo from "@/assets/collectai-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CheckCircle, Crown, Printer, Smartphone, Percent } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";

const SELLS: [string, string][] = [["pokemon", "Pokémon"], ["sports", "Sports cards"], ["magic", "Magic"], ["one_piece", "One Piece"], ["yugioh", "Yu-Gi-Oh!"], ["sealed", "Sealed product"], ["comics", "Comics"], ["other", "Other collectibles"]];
const PERKS = [
  { icon: Smartphone, t: "A free tool for your customers", d: "Customers scan their cards on your shop page and see current prices in seconds." },
  { icon: Crown, t: "Free Pro for your staff", d: "Everyone on your team gets Pro free while your shop is a partner, with a shop mode that shows a buy offer." },
  { icon: Printer, t: "A counter kit", d: "A printable counter sign, table tent and QR code with your shop's name and logo." },
  { icon: Percent, t: "Optional revenue share", d: "Earn a share of what your customers spend in their first 12 months, if we agree one with you." },
];

export default function PartnerSignup() {
  const [form, setForm] = useState({ company: "", name: "", email: "", phone: "", city: "", state: "", website: "" });
  const [sells, setSells] = useState<string[]>([]);
  const [sms, setSms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company.trim() || !form.name.trim() || !form.email.trim()) { toast.error("Shop name, your name and email are required"); return; }
    setLoading(true);
    const { error } = await supabase.functions.invoke("partner-signup", { body: { ...form, sells, consent_sms: sms } });
    setLoading(false);
    if (error) { toast.error("Something went wrong. Please try again."); return; }
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SEO title="Shop Partner Program – Free card scanning for your customers | MyCollectAI"
        description="Card shops: give customers free card price checks, get free Pro for your staff, a printable counter kit and an optional revenue share." path="/partners" />
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={collectaiLogo} alt="MyCollectAI" className="h-8 w-8 rounded-lg" />
            <span className="font-display text-xl font-bold text-gradient-primary">MyCollectAI</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto grid max-w-5xl flex-1 gap-10 px-4 py-12 lg:grid-cols-2">
        <section>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Shop Partner Program</p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-tight">Free card price checks for your customers</h1>
          <p className="mt-3 text-muted-foreground">Your shop gets its own page and QR code. Customers who sign up through it are credited to your shop.</p>
          <ul className="mt-8 space-y-4">
            {PERKS.map((p) => (
              <li key={p.t} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><p.icon className="h-5 w-5" /></span>
                <div><p className="font-semibold">{p.t}</p><p className="text-sm text-muted-foreground">{p.d}</p></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          {submitted ? (
            <div className="space-y-4 py-10 text-center">
              <CheckCircle className="mx-auto h-14 w-14 text-primary" />
              <h2 className="text-2xl font-bold">Thanks – we'll be in touch</h2>
              <p className="text-muted-foreground">Someone from our team will contact you within one business day.</p>
              <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="font-display text-xl font-semibold">Apply for your shop</h2>
              <div><Label htmlFor="company">Shop name *</Label><Input id="company" value={form.company} onChange={set("company")} maxLength={100} required /></div>
              <div><Label htmlFor="name">Contact name *</Label><Input id="name" value={form.name} onChange={set("name")} maxLength={100} required /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="email">Email *</Label><Input id="email" type="email" value={form.email} onChange={set("email")} maxLength={255} required /></div>
                <div><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" value={form.phone} onChange={set("phone")} maxLength={20} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2"><Label htmlFor="city">City</Label><Input id="city" value={form.city} onChange={set("city")} maxLength={80} /></div>
                <div><Label htmlFor="state">State</Label><Input id="state" value={form.state} onChange={set("state")} maxLength={40} /></div>
              </div>
              <div><Label htmlFor="website">Website</Label><Input id="website" value={form.website} onChange={set("website")} maxLength={255} placeholder="yourshop.com" /></div>
              <fieldset>
                <legend className="text-sm font-medium">What do you sell?</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {SELLS.map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={sells.includes(v)} onCheckedChange={(c) => setSells(c ? [...sells, v] : sells.filter((x) => x !== v))} />{l}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox checked={sms} onCheckedChange={(c) => setSms(!!c)} className="mt-0.5" disabled={!form.phone} />
                <span>Yes, MyCollectAI may text me about the partner program at the number above. Message and data rates may apply. Reply STOP to opt out. Not required to apply.</span>
              </label>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending..." : "Apply as a partner shop"}</Button>
            </form>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
