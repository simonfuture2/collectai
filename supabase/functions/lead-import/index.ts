// Admin-only: import sellers/creators from a pasted list or CSV, and YouTube channels via the YouTube Data API.
// Emails are never taken from imported lists (purchased/scraped lists are not allowed); they only come from
// a channel's own published description/links or the lead's own website (enrich-lead).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { adminUserId, enrichBatch, svc, type Any } from "../_shared/leadgen.ts";
import { emailsInText, fitScore } from "../_shared/leadScoring.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const PLATFORMS = ["ebay", "whatnot", "tcgplayer", "etsy", "youtube", "tiktok", "instagram", "discord", "other"] as const;
const Row = z.object({ name: z.string().trim().max(200).optional(), handle: z.string().trim().max(200).optional(), website: z.string().trim().max(500).optional(), city: z.string().max(120).optional(), state: z.string().max(10).optional(), followers: z.number().int().min(0).optional(), notes: z.string().max(1000).optional() });
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rows"), platform: z.enum(PLATFORMS), lead_type: z.enum(["seller", "creator"]), source: z.string().trim().min(1).max(120), rows: z.array(Row).min(1).max(500) }),
  z.object({ action: z.literal("youtube"), channels: z.array(z.string().trim().min(2).max(300)).min(1).max(50), source: z.string().trim().max(120).optional() }),
]);
const key = (platform: string, h?: string, n?: string) => `${platform}:${String(h || n || "").trim().toLowerCase().replace(/^@/, "")}`;

async function existingKeys(db: Any, platform: string) {
  const { data } = await db.from("agent_leads").select("handle, name, external_id").eq("platform", platform).is("merged_into", null).limit(10000);
  const s = new Set<string>();
  for (const r of data ?? []) { if (r.handle) s.add(key(platform, r.handle)); if (r.external_id) s.add(`${platform}:id:${r.external_id}`); if (r.name) s.add(key(platform, undefined, r.name)); }
  return s;
}

function parseChannel(input: string): { id?: string; handle?: string } {
  const s = input.trim();
  const m = s.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i); if (m) return { id: m[1] };
  if (/^UC[\w-]{20,}$/.test(s)) return { id: s };
  const h = s.match(/youtube\.com\/@([\w.\-]+)/i)?.[1] ?? s.replace(/^@/, "");
  return { handle: h };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = svc();
  const uid = await adminUserId(req, db);
  if (!uid) return json({ error: "Forbidden" }, 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return json({ error: p.error.flatten() }, 400);
  const b = p.data;

  if (b.action === "rows") {
    const have = await existingKeys(db, b.platform);
    const seen = new Set<string>(); const dupes: string[] = []; const insert: Any[] = [];
    for (const r of b.rows) {
      const k = key(b.platform, r.handle, r.name);
      if (!r.handle && !r.name) continue;
      if (have.has(k) || seen.has(k)) { dupes.push(r.handle || r.name || ""); continue; }
      seen.add(k);
      insert.push({ platform: b.platform, lead_type: b.lead_type, source: b.source, handle: r.handle || null, name: r.name || r.handle || null, business_name: r.name || null,
        website: r.website || null, city: r.city || null, state: r.state || null, followers: r.followers ?? null, notes: r.notes || null, owner_id: uid,
        enrich_status: r.website ? "pending" : "none", tags: [b.platform], fit_score: fitScore({ leadType: b.lead_type, followers: r.followers }) });
    }
    const { data, error } = insert.length ? await db.from("agent_leads").insert(insert).select("id") : { data: [], error: null };
    if (error) return json({ error: error.message }, 500);
    const ids = (data ?? []).map((x: Any) => x.id);
    // deno-lint-ignore no-explicit-any
    if (ids.length) (globalThis as any).EdgeRuntime?.waitUntil(enrichBatch(db, ids));
    return json({ imported: ids.length, duplicates: dupes });
  }

  // YouTube
  const yk = Deno.env.get("YOUTUBE_API_KEY");
  if (!yk) return json({ error: "YOUTUBE_API_KEY is not configured" }, 500);
  const have = await existingKeys(db, "youtube");
  const results: Any[] = [];
  for (const raw of b.channels) {
    const c = parseChannel(raw);
    const qs = new URLSearchParams({ part: "snippet,statistics,brandingSettings", key: yk, ...(c.id ? { id: c.id } : { forHandle: `@${c.handle}` }) });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?${qs}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { results.push({ input: raw, error: `YouTube ${r.status}: ${j?.error?.message ?? ""}` }); continue; }
    const ch = j.items?.[0];
    if (!ch) { results.push({ input: raw, error: "Channel not found" }); continue; }
    const handle = (ch.snippet?.customUrl ?? c.handle ?? "").replace(/^@/, "");
    if (have.has(`youtube:id:${ch.id}`) || have.has(key("youtube", handle))) { results.push({ input: raw, duplicate: true, name: ch.snippet?.title }); continue; }
    const desc = String(ch.snippet?.description ?? "");
    const links = [...new Set((desc.match(/https?:\/\/[^\s)]+/g) ?? []))].slice(0, 15);
    const email = emailsInText(desc)[0] ?? null; // only if the channel publishes it
    const subs = ch.statistics?.hiddenSubscriberCount ? null : Number(ch.statistics?.subscriberCount ?? 0);
    const website = links.find((l) => !/(youtube|youtu\.be|instagram|tiktok|twitter|x\.com|facebook|discord|linktr\.ee|amzn|amazon)\./i.test(l)) ?? null;
    const channelUrl = `https://www.youtube.com/channel/${ch.id}`;
    const row = {
      platform: "youtube", lead_type: "creator", source: b.source || "youtube_import", external_id: ch.id, handle: handle || null,
      name: ch.snippet?.title ?? null, business_name: ch.snippet?.title ?? null, country: ch.snippet?.country ?? null, followers: subs,
      email, website, owner_id: uid, tags: ["youtube"], enrich_status: website ? "pending" : "none",
      fit_score: fitScore({ leadType: "creator", followers: subs, publicEmail: !!email, activeSocial: true }),
      research: { youtube: { facts: {
        channel_name: { value: ch.snippet?.title, source: channelUrl }, subscribers: { value: subs, source: channelUrl },
        country: { value: ch.snippet?.country ?? null, source: channelUrl }, links: { value: links, source: `${channelUrl}/about` },
        ...(email ? { email: { value: email, source: `${channelUrl}/about` } } : {}),
      }, at: new Date().toISOString() } },
    };
    const { data, error } = await db.from("agent_leads").insert(row).select("id").single();
    if (error) { results.push({ input: raw, error: error.message }); continue; }
    have.add(`youtube:id:${ch.id}`);
    results.push({ input: raw, id: data.id, name: row.name, subscribers: subs, email: !!email, links: links.length });
  }
  return json({ results });
});
