import { Link } from "react-router-dom";
import { ArrowRight, Film } from "lucide-react";
import { useSocialVideos } from "@/hooks/use-social-videos";
import SocialVideoCard from "./SocialVideoCard";

export default function FeaturedVideos() {
  const { data = [], isPending, isError } = useSocialVideos(true);
  return <section className="mx-auto mt-16 max-w-5xl border-y border-border py-10">
    <div className="mb-6 flex items-center justify-between gap-4"><h2 className="font-display text-3xl font-semibold">See it in action</h2><Link to="/watch" className="flex shrink-0 items-center gap-2 text-sm text-primary">Watch more<ArrowRight className="h-4 w-4" /></Link></div>
    {data.length > 0 ? <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{data.map(v => <SocialVideoCard key={v.id} video={v} />)}</div> : <div className="flex items-center gap-3 py-5 text-muted-foreground"><Film className="h-6 w-6 text-primary" /><p>{isPending ? "Loading videos…" : isError ? "Videos are temporarily unavailable" : "New videos coming soon"}</p></div>}
  </section>;
}