import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { readSession, sessionTray } from "@/lib/priceSession";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 100 ? 0 : 2 });

export default function PriceSessionTray() {
  const [items] = useState(() => sessionTray(readSession()));
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = items.map(i => i.imagePath).filter(Boolean);
    if (!paths.length) return;
    supabase.storage.from("card-images").createSignedUrls(paths, 3600).then(({ data }) => {
      const map: Record<string, string> = {};
      data?.forEach(d => { if (d.path && d.signedUrl) map[d.path] = d.signedUrl; });
      setUrls(map);
    });
  }, [items]);
  if (!items.length) return null;
  return (
    <nav aria-label="This session's price checks" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
      {items.map(i => (
        <Link key={i.priceCheckId} to={`/price/${i.priceCheckId}`} title={i.name}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-3">
          <span className="h-8 w-6 overflow-hidden rounded-md bg-muted">
            {urls[i.imagePath] && <img src={urls[i.imagePath]} alt="" className="h-full w-full object-cover" />}
          </span>
          <span className="text-xs font-semibold tabular-nums text-foreground">{i.price != null ? usd(i.price) : "—"}</span>
        </Link>
      ))}
    </nav>
  );
}
