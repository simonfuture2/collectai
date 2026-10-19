import { Fragment, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Camera, Instagram, Music2, Film } from "lucide-react";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import SocialVideoCard from "@/components/social/SocialVideoCard";
import { resolveSocialMedia, useSocialVideos } from "@/hooks/use-social-videos";
import { needsVideoCta, SOCIAL_SCAN_URL, VIDEO_CATEGORIES } from "@/lib/socialVideos";
import collectaiLogo from "@/assets/collectai-logo.png";

// Fill in your real profile URLs here. No invented account links.
export const SOCIAL_PROFILES = { tiktok: "", instagram: "" };

function FollowLinks() {
  return <div className="flex flex-wrap justify-center gap-4">
    {SOCIAL_PROFILES.tiktok && <a className="inline-flex items-center gap-2 text-sm text-muted-foreground underline underline-offset-4" href={SOCIAL_PROFILES.tiktok} target="_blank" rel="noopener noreferrer"><Music2 className="h-4 w-4" />Follow on TikTok</a>}
    {SOCIAL_PROFILES.instagram && <a className="inline-flex items-center gap-2 text-sm text-muted-foreground underline underline-offset-4" href={SOCIAL_PROFILES.instagram} target="_blank" rel="noopener noreferrer"><Instagram className="h-4 w-4" />Follow on Instagram</a>}
  </div>;
}

export default function Watch() {
  const [filter, setFilter] = useState("all");
  const { data = [], isPending, isError, refetch } = useSocialVideos();
  const shown = data.filter(v => filter === "all" || v.category === filter);
  const hostedVideos = data.filter(v => v.platform === "hosted" && v.poster_url);
  const hostedMetadata = useQueries({ queries: hostedVideos.map(v => ({
    queryKey: ["social-video-schema", v.id, v.url, v.poster_url, v.title, v.caption],
    queryFn: async () => {
      const [thumbnailUrl, contentUrl] = await Promise.all([resolveSocialMedia(v.poster_url), resolveSocialMedia(v.url)]);
      if (!thumbnailUrl || !contentUrl) return null;
      return { "@context": "https://schema.org", "@type": "VideoObject", name: v.title, description: v.caption || v.title, thumbnailUrl, contentUrl, uploadDate: v.created_at };
    }, staleTime: 30 * 60000, refetchInterval: 30 * 60000,
  })) });
  const hosted = hostedMetadata.flatMap(result => result.data ? [result.data] : []);
  return <div className="min-h-screen bg-background">
    <SEO title="Watch MyCollectAi scan real trading cards" description="Watch real MyCollectAI scans at card shows, pack openings and more. See trading cards identified and priced from real sold listings." path="/watch" jsonLd={hosted.length ? hosted : undefined} />
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5"><Link to="/" className="flex shrink-0 items-center gap-2"><img src={collectaiLogo} alt="" className="h-9 w-9 rounded-lg" /><span className="font-display text-xl font-semibold">MyCollectAI</span></Link><nav className="flex items-center gap-2 sm:gap-3"><Link to="/watch" aria-current="page" className="hidden text-sm text-primary sm:inline">Watch</Link><ThemeToggle /><Button variant="outline" asChild><Link to="/auth">Sign in</Link></Button></nav></header>
    <main className="mx-auto max-w-6xl px-4 pb-16">
      <section className="border-b border-border py-12 text-center sm:py-16"><p className="mb-4 text-sm font-medium text-primary">Watch it work</p><h1 className="mx-auto max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl">See MyCollectAi scan real cards</h1><p className="mt-4 text-lg text-muted-foreground">Real scans, real sold prices. No edits.</p><Button asChild size="lg" className="mt-7 mb-5"><a href={SOCIAL_SCAN_URL}><Camera className="mr-2 h-5 w-5" />Try a free scan</a></Button><FollowLinks /></section>
      <div className="my-7 flex flex-wrap gap-2" role="group" aria-label="Video categories">{[{ value: "all", label: "All" }, ...VIDEO_CATEGORIES.filter(c => c.value !== "other")].map(c => <Button key={c.value} size="sm" variant={filter === c.value ? "default" : "outline"} aria-pressed={filter === c.value} onClick={() => setFilter(c.value)}>{c.label}</Button>)}</div>
      {isPending ? <p className="py-16 text-center text-muted-foreground">Loading videos…</p> : isError ? <div className="py-16 text-center"><p className="mb-4 text-muted-foreground">Videos are temporarily unavailable</p><Button variant="outline" onClick={() => refetch()}>Try again</Button></div> : shown.length === 0 ? <div className="py-16 text-center"><Film className="mx-auto mb-4 h-12 w-12 text-primary" /><h2 className="mb-5 font-display text-2xl">{data.length === 0 ? "New videos coming soon" : "No videos in this category yet"}</h2><FollowLinks /></div> : <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{shown.map((v, i) => <Fragment key={v.id}><SocialVideoCard video={v} />{needsVideoCta(i) && <div className="flex min-h-64 flex-col items-center justify-center gap-5 rounded-lg border border-primary/40 bg-muted p-8 text-center"><Camera className="h-8 w-8 text-primary" /><h2 className="font-display text-2xl">Your turn. Scan any card free.</h2><Button asChild><a href={SOCIAL_SCAN_URL}>Try a free scan</a></Button></div>}</Fragment>)}</div>}
    </main><Footer />
  </div>;
}