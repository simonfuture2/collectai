import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, ExternalLink } from "lucide-react";
import { callFn } from "./leadgenClient";

type Fact = { value: unknown; source: string };
const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v ?? ""));

/** Sourced facts from the lead's website/channel, and live Google details for shops (not stored). */
export default function LeadResearchPanel({ placeId, research, fitScore }: { placeId?: string | null; research?: any; fitScore?: number | null }) {
  const [g, setG] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const groups = Object.entries(research ?? {}).filter(([, v]: any) => v && typeof v === "object" && v.facts) as [string, { facts: Record<string, Fact>; at?: string }][];
  const loadGoogle = async () => { setBusy(true); setErr(""); try { setG((await callFn("places-search", { action: "details", place_id: placeId })).place); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  if (!placeId && !groups.length && fitScore == null) return null;
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between"><p className="font-medium">Research{fitScore != null && <span className="ml-2 text-muted-foreground">Fit score {fitScore}/100</span>}</p>
        {placeId && !g && <Button size="sm" variant="outline" onClick={loadGoogle} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3 mr-1" />}Google details</Button>}</div>
      {err && <p className="text-destructive text-xs">{err}</p>}
      {g && <div className="text-xs space-y-0.5 bg-muted/50 rounded p-2">
        <p className="font-medium">{g.displayName?.text}</p><p>{g.formattedAddress}</p>
        {g.nationalPhoneNumber && <p>{g.nationalPhoneNumber}</p>}
        {g.rating && <p>{g.rating}★ ({g.userRatingCount} reviews)</p>}
        {(g.regularOpeningHours?.weekdayDescriptions ?? []).map((d: string) => <p key={d} className="text-muted-foreground">{d}</p>)}
        {g.googleMapsUri && <a className="underline" href={g.googleMapsUri} target="_blank" rel="noreferrer">Open in Google Maps</a>}
        <p className="text-muted-foreground">Live from Google · not saved</p></div>}
      {groups.map(([k, grp]) => (
        <div key={k} className="space-y-1"><p className="text-xs uppercase text-muted-foreground">{k}</p>
          {Object.entries(grp.facts).filter(([, f]) => f && f.value !== null && f.value !== "").map(([name, f]) => (
            <div key={name} className="flex gap-2 text-xs"><span className="w-24 shrink-0 text-muted-foreground">{name.replace(/_/g, " ")}</span>
              <span className="flex-1 break-words">{show(f.value)}</span>
              <a href={f.source} target="_blank" rel="noreferrer" title={f.source} className="shrink-0 text-primary"><ExternalLink className="h-3 w-3" /></a></div>))}
        </div>))}
    </div>
  );
}
