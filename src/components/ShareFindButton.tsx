import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useReferralCode } from "@/hooks/use-referral-code";

interface Props { name: string; imageUrl?: string | null; value?: string | null; subtitle?: string | null; className?: string }

/** "Share this find": a story-sized card image with the value and the user's referral link. */
export default function ShareFindButton({ name, imageUrl, value, subtitle, className }: Props) {
  const { code, link } = useReferralCode();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const shortLink = link.replace(/^https?:\/\//, "");

  const make = async () => {
    if (!ref.current) return null;
    const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
    return await (await fetch(url)).blob();
  };
  const share = async () => {
    setBusy(true);
    try {
      const blob = await make();
      if (!blob) return;
      const file = new File([blob], "my-find.png", { type: "image/png" });
      const text = `${name}${value ? ` — ${value}` : ""}. Check yours free: ${link}`;
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-find.png"; a.click(); await navigator.clipboard?.writeText(text).catch(() => {}); toast.success("Image saved and link copied — post it to your story or Discord"); }
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error("Couldn't make the image"); } finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="outline" className={className} onClick={() => setOpen(true)}><Share2 className="h-4 w-4 mr-2" />Share this find</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Share this find</DialogTitle></DialogHeader>
          <div ref={ref} className="mx-auto w-[270px] aspect-[9/16] rounded-2xl gradient-primary p-5 flex flex-col items-center justify-between text-primary-foreground">
            <p className="text-sm font-semibold tracking-wide opacity-90">MY PULL</p>
            {imageUrl ? <img src={imageUrl} crossOrigin="anonymous" alt={name} className="max-h-[55%] rounded-lg shadow-xl object-contain" /> : <div className="h-40" />}
            <div className="text-center space-y-1">
              <p className="font-bold leading-tight">{name}</p>
              {subtitle && <p className="text-xs opacity-80">{subtitle}</p>}
              {value && <p className="text-3xl font-extrabold">{value}</p>}
            </div>
            <p className="text-[11px] opacity-90">Check yours free · {shortLink}</p>
          </div>
          <p className="text-xs text-muted-foreground text-center">{code ? "Friends who join with your link and run 5 price checks get 3 free credits, and so do you." : "Sign in to add your referral link."}</p>
          <Button onClick={share} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Share image</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
