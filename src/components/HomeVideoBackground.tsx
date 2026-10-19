import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import clip from "@/assets/homepage-tiktok.mp4.asset.json";
import poster from "@/assets/homepage-tiktok-poster.jpg.asset.json";

export default function HomeVideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let userPaused = motion.matches;
    const sync = () => {
      if (userPaused || !visible || document.hidden) { video.pause(); return; }
      void video.play().catch(() => setPaused(true));
    };
    const changeMotion = () => { userPaused = motion.matches; sync(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(video);
    motion.addEventListener("change", changeMotion);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => { observer.disconnect(); motion.removeEventListener("change", changeMotion); document.removeEventListener("visibilitychange", sync); };
  }, []);

  return <div className="home-video-background" aria-hidden={undefined}>
    <video ref={videoRef} src={clip.url} poster={poster.url} muted loop playsInline preload="metadata"
      aria-hidden="true" onPlaying={() => { setReady(true); setPaused(false); }} onPause={() => setPaused(true)}
      className={`home-video-footage ${ready ? "home-video-ready" : ""}`} />
    <div className="home-video-veil" />
    <div className="absolute bottom-2 right-4 z-20 pointer-events-auto">
      <Button variant="outline" size="icon" className="bg-background/80 backdrop-blur-sm" title={paused ? "Play background video" : "Pause background video"}
        aria-label={paused ? "Play background video" : "Pause background video"}
        onClick={() => { const video = videoRef.current; if (!video) return; if (video.paused) void video.play().catch(() => setPaused(true)); else video.pause(); }}>
        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </Button>
    </div>
  </div>;
}