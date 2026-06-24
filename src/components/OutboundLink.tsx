import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface OutboundLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  label?: React.ReactNode;
  /** Hide the trailing external-link icon (rare — keep on by default). */
  hideIcon?: boolean;
}

/**
 * Anchor that always opens in a new tab with rel="noopener noreferrer" and
 * appends a small external-link glyph. Subtly themed with our accent token.
 */
const OutboundLink = ({
  href,
  label,
  hideIcon = false,
  className,
  children,
  ...rest
}: OutboundLinkProps) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={cn(
      "inline-flex items-center gap-1 text-primary hover:text-primary/80 underline decoration-primary/30 hover:decoration-primary underline-offset-2 transition-colors",
      className,
    )}
    {...rest}
  >
    <span>{label ?? children}</span>
    {!hideIcon && <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
  </a>
);

export default OutboundLink;
