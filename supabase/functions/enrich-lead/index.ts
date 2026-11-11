// Admin-only: read leads' own websites (home, contact, about) and save sourced facts + fit score.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { adminUserId, enrichBatch, svc } from "../_shared/leadgen.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ lead_ids: z.array(z.string().uuid()).max(50).optional(), limit: z.number().int().min(1).max(50).optional(), background: z.boolean().optional() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = svc();
  if (!(await adminUserId(req, db))) return json({ error: "Forbidden" }, 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400);
  if (p.data.lead_ids?.length) await db.from("agent_leads").update({ enrich_status: "pending" }).in("id", p.data.lead_ids).neq("enrich_status", "done").lt("enrich_attempts", 3);
  const job = enrichBatch(db, p.data.lead_ids, p.data.limit ?? 50, p.data.background ? 330_000 : 120_000);
  if (p.data.background) {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(job);
    return json({ started: true });
  }
  try { return json(await job); } catch (e) { return json({ error: (e as Error).message }, 500); }
});
