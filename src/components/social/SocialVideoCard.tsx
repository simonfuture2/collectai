import { useEffect, useRef, useState } from "react";
import { Instagram, Music2, Play, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSocialMedia } from "@/hooks/use-social-videos";
import { EMBED_TIMEOUT_MS, safeMediaUrl, tiktokVideoId, detectSocialPlatform, type SocialVideo } from "@/lib/socialVideos";

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
    tiktokEmbed?: { lib?: { render: (elements: HTMLElement[]) => void } };
  }
}

const scripts = new Map<string, Promise<void>>();
function loadEmbedScript(platform: "tiktok" | "instagram") {
  const existing = scripts.get(platform);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = platform === "tiktok" ? "https://www.tiktok.com/embed.js" : "https://www.instagram.com/embed.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Embed unavailable"));
    document.body.appendChild(script);
  });
  scripts.set(platform, promise);
  return promise;
}

export default function SocialVideoCard({ video }: { video: SocialVideo }) {
  const container = useRef<HTMLDivElement>(null);
  const embed = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const poster = useSocialMedia(video.poster_url);
  const media = useSocialMedia(active && video.platform === "hosted" ? video.url : null);
  const PlatformIcon = video.platform === "instagram" ? Instagram : video.platform === "tiktok" ? Music2 : Play;
  const label = video.platform === "tiktok" ? "TikTok" : video.platform === "instagram" ? "Instagram" : "Video";

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setActive(true); observer.disconnect(); } }, { rootMargin: "250px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active || video.platform === "hosted") return;
    const node = embed.current;
    if (!node) return;
    const platform = video.platform;
    if (detectSocialPlatform(video.url) !== platform) { setFailed(true); return; }
    // Provider scripts own this DOM subtree, not React.
    const quote = document.createElement("blockquote");
    if (platform === "tiktok") {
      quote.className = "tiktok-embed";
      quote.setAttribute("cite", video.url);
      quote.setAttribute("data-video-id", tiktokVideoId(video.url) ?? "");
      quote.appendChild(document.createElement("section"));
    } else {
      quote.className = "instagram-media";
      quote.setAttribute("data-instgrm-permalink", video.url);
      quote.setAttribute("data-instgrm-version", "14");
    }
    node.replaceChildren(quote);
    let disposed = false;
    const observedFrames = new WeakSet<HTMLIFrameElement>();
    let timeout: number;
    const onLoaded = () => { if (!disposed) { setReady(true); setFailed(false); clearTimeout(timeout); } };
    const check = () => node.querySelectorAll("iframe").forEach(frame => {
      if (!observedFrames.has(frame)) { observedFrames.add(frame); frame.addEventListener("load", onLoaded, { once: true }); }
    });
    const observer = new MutationObserver(check);
    observer.observe(node, { childList: true, subtree: true });
    // TikTok's bootstrap loads its renderer asynchronously; later cards must wait for it too.
    const renderTimer = window.setInterval(() => {
      if (disposed) return;
      if (platform === "tiktok" && window.tiktokEmbed?.lib?.render) {
        window.tiktokEmbed.lib.render([quote]); clearInterval(renderTimer);
      } else if (platform === "instagram" && window.instgrm) {
        window.instgrm.Embeds.process(); clearInterval(renderTimer);
      }
    }, 250);
    timeout = window.setTimeout(() => { if (!disposed) setFailed(true); }, EMBED_TIMEOUT_MS);
    void loadEmbedScript(platform).then(() => {
      if (disposed) return;
      if (platform === "instagram") window.instgrm?.Embeds.process();
      else window.tiktokEmbed?.lib?.render([quote]);
      check();
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; observer.disconnect(); clearInterval(renderTimer); clearTimeout(timeout); node.querySelectorAll("iframe").forEach(frame => frame.removeEventListener("load", onLoaded)); node.replaceChildren(); };
  }, [active, video.platform, video.url]);

  return <article className="overflow-hidden rounded-lg border border-border bg-card">
    <div ref={container} className="relative aspect-[9/14] overflow-auto bg-muted">
      {active && video.platform === "hosted" && media.data && <video className="h-full w-full object-contain" src={safeMediaUrl(media.data) ?? undefined} poster={safeMediaUrl(poster.data ?? null) ?? undefined} muted playsInline controls preload="none" onPlay={(event) => { document.querySelectorAll("video").forEach(v => { if (v !== event.currentTarget) v.pause(); }); }} />}
      {video.platform !== "hosted" && active && <div ref={embed} className="social-embed min-h-full w-full" />}
      {(!active || (video.platform !== "hosted" && !ready && !failed) || (video.platform === "hosted" && !media.data)) && <Button variant="ghost" className="absolute inset-0 h-full w-full flex-col whitespace-normal rounded-none p-6 text-center" onClick={() => setActive(true)} aria-label={`Play ${video.title}`}>
        {poster.data && <img src={safeMediaUrl(poster.data) ?? undefined} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
        <span className="relative flex max-w-full flex-col items-center gap-4 rounded-lg bg-card/95 p-5 text-foreground">
          {active ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <Play className="h-10 w-10 text-primary" />}
          <span className="font-display text-lg">{video.title}</span>
        </span>
      </Button>}
      {active && video.platform === "hosted" && media.isFetched && !media.data && <p className="absolute inset-x-4 bottom-4 bg-card p-3 text-sm">Video unavailable</p>}
      {failed && video.platform !== "hosted" && <div className="absolute inset-x-0 bottom-0 border-t border-border bg-card/95 p-4 text-center"><Button variant="outline" asChild><a href={video.url} target="_blank" rel="noopener noreferrer">Watch on {label}<ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>}
    </div>
    <div className="p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><PlatformIcon className="h-4 w-4" />{label}</div>
      <h3 className="break-words font-display text-lg font-semibold leading-snug">{video.title}</h3>
      {video.caption && <p className="mt-2 break-words text-sm text-muted-foreground">{video.caption}</p>}
      {video.platform !== "hosted" && <a href={video.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4">Watch on {label}<ExternalLink className="h-3 w-3" /></a>}
    </div>
  </article>;
}