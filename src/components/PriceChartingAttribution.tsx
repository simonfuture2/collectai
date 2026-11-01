import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Logo slot: set this to an imported image once PriceCharting approves logo use.
 * e.g. import pcLogo from "@/assets/pricecharting-logo.png"; const PC_LOGO = pcLogo;
 */
const PC_LOGO: string | null = null;

export function priceChartingUrl(productId?: number | string | null, url?: string | null) {
  if (url) return url;
  if (productId == null || productId === "") return null;
  return `https://www.pricecharting.com/offers?product=${productId}`;
}

interface Props {
  productId?: number | string | null;
  /** Exact product URL when known (overrides productId link). */
  url?: string | null;
  /** Optional date the prices were last updated. */
  syncedAt?: string | null;
  className?: string;
  /** Hide the "View on PriceCharting" link (e.g. on totals). */
  hideLink?: boolean;
}

export default function PriceChartingAttribution({ productId, url, syncedAt, className, hideLink }: Props) {
  const href = hideLink ? null : priceChartingUrl(productId, url);
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1.5">
        {PC_LOGO && <img src={PC_LOGO} alt="PriceCharting" className="h-4 w-auto" />}
        Prices from PriceCharting{syncedAt ? ` · ${new Date(syncedAt).toLocaleDateString()}` : ""}
      </span>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          View on PriceCharting <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}
