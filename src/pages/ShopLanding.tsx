import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Camera, Loader2, MapPin, Globe, ScanLine, BadgeDollarSign, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
import { setRef, trackAgentEvent } from "@/lib/agentRef";
import collectaiLogo from "@/assets/collectai-logo.png";

type Shop = { id: string; name: string; slug: string; status: string; partner_code: string; city: string | null; state: string | null; logo_path: string | null; address: string | null; website: string | null };

const STEPS = [
  { icon: Camera, t: "Point your camera at a card", d: "Pokémon, sports, Magic, One Piece and more." },
  { icon: ScanLine, t: "We find the exact card", d: "Set, number and variant in a few seconds." },
  { icon: BadgeDollarSign, t: "See what it's worth", d: "Current market prices, raw and graded." },
];

export default function ShopLanding() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("partner_shop_public", { _slug: slug }).then(async ({ data }) => {
      const s = (data as Shop | null) ?? null;
      setShop(s);
      if (!s) return;
      setRef(s.partner_code);
      void trackAgentEvent("landing_view", { shop: s.slug });
      if (s.logo_path) {
        const { data: u } = await supabase.storage.from("partner-logos").createSignedUrl(s.logo_path, 3600);
        setLogo(u?.signedUrl ?? null);
      }
    });
  }, [slug]);

  const start = async () => {
    if (shop) setRef(shop.partner_code);
    const { data } = await supabase.auth.getSession();
    navigate(data.session ? "/scan/live" : `/auth?mode=signup&next=${encodeURIComponent("/scan/live")}`);
  };

  if (shop === undefined) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!shop) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <SEO title="Shop not found | MyCollectAI" description="This shop page isn't available." path={`/s/${slug}`} noIndex />
      <p className="text-lg font-semibold">This shop page isn't available.</p>
      <Button asChild><Link to="/price-check">Try a free price check</Link></Button>
    </div>
  );

  const place = [shop.city, shop.state].filter(Boolean).join(", ");
  return (
    <div className="min-h-screen bg-background">
      <SEO title={`${shop.name} – Free card price checks | MyCollectAI`} description={`Scan your cards free at ${shop.name}${place ? ` in ${place}` : ""}. Free card price checks, powered by MyCollectAI.`}
        path={`/s/${shop.slug}`} noIndex={shop.status !== "active"} />
      <main className="mx-auto flex max-w-md flex-col px-5 pb-10 pt-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {logo ? <img src={logo} alt={`${shop.name} logo`} className="h-full w-full object-contain" /> : <span className="font-display text-3xl font-bold text-primary">{shop.name.slice(0, 1)}</span>}
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight">{shop.name}</h1>
          <p className="mt-2 text-muted-foreground">Free card price checks, powered by MyCollectAI.</p>
          {shop.status !== "active" && <p className="mt-3 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Preview – waiting for the shop's approval</p>}
        </div>

        <Button size="lg" onClick={start} className="mt-8 h-14 w-full gradient-primary text-lg text-primary-foreground">
          <Sparkles className="mr-2 h-5 w-5" /> Start scanning free
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">No card needed. Takes under a minute to sign up.</p>

        <h2 className="mt-10 font-display text-lg font-semibold">How it works</h2>
        <ol className="mt-3 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="flex gap-3 rounded-xl border border-border bg-card p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><s.icon className="h-5 w-5" /></span>
              <div><p className="font-medium">{i + 1}. {s.t}</p><p className="text-sm text-muted-foreground">{s.d}</p></div>
            </li>
          ))}
        </ol>

        {(shop.address || shop.website) && (
          <div className="mt-8 space-y-2 rounded-xl bg-muted p-4 text-sm">
            {shop.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{shop.address}</p>}
            {shop.website && <a href={shop.website.startsWith("http") ? shop.website : `https://${shop.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary"><Globe className="h-4 w-4" />Visit {shop.name}'s website</a>}
          </div>
        )}

        <Link to="/" className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <img src={collectaiLogo} alt="" className="h-5 w-5 rounded" /> MyCollectAI
        </Link>
      </main>
    </div>
  );
}
