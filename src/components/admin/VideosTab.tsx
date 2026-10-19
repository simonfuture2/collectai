import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Reorder } from "framer-motion";
import { Plus, GripVertical, Pencil, Trash2, Upload, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { detectSocialPlatform, validateVideo, VIDEO_CATEGORIES, type SocialVideo } from "@/lib/socialVideos";

export default function VideosTab() {
  const [videos, setVideos] = useState<SocialVideo[]>([]);
  const dragOrder = useRef<SocialVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SocialVideo | "new" | null>(null);
  const [deleting, setDeleting] = useState<SocialVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("social_videos").select("*").order("sort_order").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setVideos(data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const refresh = () => { void load(); void client.invalidateQueries({ queryKey: ["social-videos"] }); };
  const update = async (id: string, patch: Partial<SocialVideo>) => {
    const { error } = await supabase.from("social_videos").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  };
  const saveOrder = async (ordered: SocialVideo[]) => {
    setBusy(true);
    const results = await Promise.all(ordered.map((v, i) => supabase.from("social_videos").update({ sort_order: i }).eq("id", v.id)));
    setBusy(false);
    if (results.some(r => r.error)) toast.error("Couldn't save all positions. Please try again.");
    refresh();
  };
  const move = (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= videos.length) return;
    const next = [...videos]; [next[index], next[target]] = [next[target], next[index]];
    setVideos(next); void saveOrder(next);
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const { error } = await supabase.from("social_videos").delete().eq("id", deleting.id);
    if (!error && deleting.platform === "hosted") {
      const paths = [deleting.url, deleting.poster_url].filter((p): p is string => !!p && !p.startsWith("https://"));
      if (paths.length) await supabase.storage.from("social-videos").remove(paths);
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setDeleting(null); refresh(); toast.success("Video deleted");
  };
  return <section>
    <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-display text-2xl">Videos</h2><Button onClick={() => setEditing("new")}><Plus className="mr-2 h-4 w-4" />Add video</Button></div>
    {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : videos.length === 0 ? <p className="border-y border-border py-12 text-center text-muted-foreground">No videos yet</p> : <Reorder.Group axis="y" values={videos} onReorder={next => { dragOrder.current = next; setVideos(next); }} className="space-y-3">
      {videos.map((v, index) => <Reorder.Item key={v.id} value={v} dragListener={!busy} onDragStart={() => { dragOrder.current = videos; }} onDragEnd={() => void saveOrder(dragOrder.current)} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-muted-foreground" aria-label="Drag to reorder" />
        <div className="min-w-0 flex-1"><h3 className="break-words font-medium">{v.title}</h3><p className="text-xs text-muted-foreground">{v.platform} · {VIDEO_CATEGORIES.find(c => c.value === v.category)?.label}</p></div>
        <div className="flex flex-wrap items-center gap-3" onPointerDown={e => e.stopPropagation()}>
          <Label className="flex items-center gap-2 text-xs"><Switch checked={v.featured} onCheckedChange={featured => void update(v.id, { featured })} aria-label={`Featured: ${v.title}`} />Featured</Label>
          <Label className="flex items-center gap-2 text-xs"><Switch checked={v.published} onCheckedChange={published => void update(v.id, { published })} aria-label={`Published: ${v.title}`} />Published</Label>
          <Button size="icon" variant="ghost" title="Move up" aria-label={`Move up: ${v.title}`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title="Move down" aria-label={`Move down: ${v.title}`} disabled={busy || index === videos.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title="Edit video" aria-label={`Edit: ${v.title}`} onClick={() => setEditing(v)}><Pencil className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title="Delete video" aria-label={`Delete: ${v.title}`} onClick={() => setDeleting(v)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </Reorder.Item>)}
    </Reorder.Group>}
    {editing && <VideoForm key={editing === "new" ? "new" : editing.id} video={editing === "new" ? null : editing} sortOrder={videos.length} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete video?</DialogTitle></DialogHeader><p className="break-words">{deleting?.title}</p><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>Delete</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}

function VideoForm({ video, sortOrder, onClose, onSaved }: { video: SocialVideo | null; sortOrder: number; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState(video?.platform === "hosted" ? "hosted" : "social");
  const [url, setUrl] = useState(video?.url ?? "");
  const [title, setTitle] = useState(video?.title ?? "");
  const [caption, setCaption] = useState(video?.caption ?? "");
  const [category, setCategory] = useState(video?.category ?? "scan");
  const [clip, setClip] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [posterUrl, setPosterUrl] = useState(video?.poster_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const platform = mode === "hosted" ? "hosted" : detectSocialPlatform(url);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    if (!platform) { setError("Use a full TikTok video or Instagram reel/post URL."); return; }
    if (clip && clip.type !== "video/mp4" && !clip.name.toLowerCase().endsWith(".mp4")) { setError("Choose an MP4 video."); return; }
    if (poster && !["image/jpeg", "image/png", "image/webp"].includes(poster.type)) { setError("Choose a JPG, PNG or WebP poster."); return; }
    const validation = validateVideo({ platform, url: clip ? clip.name : url, title, poster_url: poster ? poster.name : posterUrl });
    if (validation) { setError(validation); return; }
    setBusy(true);
    const uploaded: string[] = [];
    try {
      const upload = async (file: File) => {
        const path = `${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("social-videos").upload(path, file, { contentType: file.type });
        if (error) throw error;
        uploaded.push(path); return path;
      };
      const savedUrl = mode === "hosted" && clip ? await upload(clip) : url.trim();
      const savedPoster = poster ? await upload(poster) : posterUrl.trim() || null;
      const patch = { platform, url: savedUrl, poster_url: savedPoster, title: title.trim(), caption: caption.trim() || null, category };
      const result = video ? await supabase.from("social_videos").update(patch).eq("id", video.id) : await supabase.from("social_videos").insert({ ...patch, sort_order: sortOrder });
      if (result.error) throw result.error;
      toast.success(video ? "Video updated" : "Video added"); onSaved();
    } catch (e) {
      if (uploaded.length) await supabase.storage.from("social-videos").remove(uploaded);
      setError(e instanceof Error ? e.message : "Couldn't save the video.");
    } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{video ? "Edit video" : "Add video"}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4">
    <div className="flex gap-2"><Button type="button" variant={mode === "social" ? "default" : "outline"} disabled={busy} onClick={() => { setMode("social"); setUrl(""); }}>Social link</Button><Button type="button" variant={mode === "hosted" ? "default" : "outline"} disabled={busy} onClick={() => { setMode("hosted"); setUrl(""); }}><Upload className="mr-2 h-4 w-4" />Upload MP4</Button></div>
    {mode === "social" ? <div className="space-y-2"><Label htmlFor="video-url">TikTok or Instagram URL</Label><Input id="video-url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@name/video/…" required />{platform && <p className="text-xs text-muted-foreground">{platform === "tiktok" ? "TikTok" : "Instagram"}</p>}</div> : <div className="space-y-2"><Label htmlFor="video-file">MP4 video</Label><Input id="video-file" type="file" accept="video/mp4,.mp4" onChange={e => setClip(e.target.files?.[0] ?? null)} />{url && <p className="text-xs text-muted-foreground">Current video saved</p>}</div>}
    <div className="space-y-2"><Label htmlFor="video-poster">Poster image{mode === "hosted" ? " (required)" : " (optional)"}</Label><Input id="video-poster" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPoster(e.target.files?.[0] ?? null)} />{posterUrl && <p className="text-xs text-muted-foreground">Current poster saved</p>}</div>
    <div className="space-y-2"><Label htmlFor="video-title">Title</Label><Input id="video-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={180} required /></div>
    <div className="space-y-2"><Label htmlFor="video-caption">Caption</Label><Input id="video-caption" value={caption} onChange={e => setCaption(e.target.value)} maxLength={300} /></div>
    <div className="space-y-2"><Label htmlFor="video-category">Category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger id="video-category"><SelectValue /></SelectTrigger><SelectContent>{VIDEO_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save video</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}