import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const MAX_BETA_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use anon key client with user's auth header for identity validation
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Service role client for all DB operations
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check admin role via the security-definer is_admin() function.
    // Fails closed on any error and is robust to users holding multiple roles.
    const { data: isAdmin, error: roleError } = await adminClient.rpc("is_admin", {
      _user_id: userId,
    });

    if (roleError || isAdmin !== true) {
      console.warn("[admin-data] denied for user", userId, roleError?.message ?? "not admin");
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Parse body once
    const body = await req.json();
    const { action } = body;

    // ─── GET DASHBOARD ───
    if (action === "get_dashboard") {
      const [usersRes, profilesRes, transactionsRes, cardsCountRes, scanCountRes, revenueRes, authUsersRes] =
        await Promise.all([
          adminClient.from("user_credits").select("*").order("created_at", { ascending: false }),
          adminClient.from("profiles").select("id, display_name, created_at"),
          adminClient.from("credit_transactions").select("*").order("created_at", { ascending: false }).limit(200),
          adminClient.from("cards").select("id", { count: "exact", head: true }).eq("scan_purpose", "collection"),
          adminClient.from("credit_transactions").select("id", { count: "exact", head: true }).eq("type", "scan_deduction"),
          adminClient.from("credit_transactions").select("amount").eq("type", "credit_purchase"),
          adminClient.auth.admin.listUsers({ perPage: 1000 }),
        ]);

      // Build email lookup from auth.users
      const emailMap: Record<string, string> = {};
      for (const u of authUsersRes.data?.users || []) {
        if (u.id && u.email) emailMap[u.id] = u.email;
      }

      // Merge email into profiles for admin display
      const profilesWithEmail = (profilesRes.data || []).map((p: any) => ({
        ...p,
        email: emailMap[p.id] || null,
      }));

      const totalRevenue = (revenueRes.data || []).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

      const { data: linkedLeads } = await adminClient.from("agent_leads").select("id,user_id,stage").not("user_id", "is", null).is("merged_into", null);
      const leadByUser: Record<string, string> = {};
      for (const l of linkedLeads || []) leadByUser[l.user_id as string] = l.id as string;

      return new Response(
        JSON.stringify({
          leadByUser,
          users: usersRes.data || [],
          profiles: profilesWithEmail,
          transactions: transactionsRes.data || [],
          stats: {
            totalCards: cardsCountRes.count || 0,
            totalScans: scanCountRes.count || 0,
            totalRevenue,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── UPDATE CREDITS (set absolute value) ───
    if (action === "update_credits") {
      const { targetUserId, credits, reason } = body;
      if (!targetUserId || credits === undefined) {
        return new Response(JSON.stringify({ error: "targetUserId and credits required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get current credits to calculate diff
      const { data: current } = await adminClient
        .from("user_credits")
        .select("credits")
        .eq("user_id", targetUserId)
        .single();

      const diff = credits - (current?.credits || 0);

      const { error: updateErr } = await adminClient
        .from("user_credits")
        .update({ credits, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId);

      if (updateErr) throw updateErr;

      // Log transaction
      await adminClient.from("credit_transactions").insert({
        user_id: targetUserId,
        amount: diff,
        type: "admin_adjustment",
        description: reason || `Admin set credits to ${credits}`,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ADD CREDITS (relative) ───
    if (action === "add_credits") {
      const { targetUserId, amount, reason } = body;
      if (!targetUserId || !amount) {
        return new Response(JSON.stringify({ error: "targetUserId and amount required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: current } = await adminClient
        .from("user_credits")
        .select("credits")
        .eq("user_id", targetUserId)
        .single();

      const newCredits = Math.max(0, (current?.credits || 0) + amount);

      const { error: updateErr } = await adminClient
        .from("user_credits")
        .update({ credits: newCredits, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId);

      if (updateErr) throw updateErr;

      await adminClient.from("credit_transactions").insert({
        user_id: targetUserId,
        amount,
        type: "admin_adjustment",
        description: reason || `Admin ${amount > 0 ? "added" : "deducted"} ${Math.abs(amount)} credits`,
      });

      return new Response(JSON.stringify({ success: true, newCredits }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE PLAN ───
    if (action === "update_plan") {
      const { targetUserId, plan } = body;
      if (!targetUserId || !plan || !["free", "pro"].includes(plan)) {
        return new Response(JSON.stringify({ error: "targetUserId and valid plan (free/pro) required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateErr } = await adminClient
        .from("user_credits")
        .update({ plan, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId);

      if (updateErr) throw updateErr;

      await adminClient.from("credit_transactions").insert({
        user_id: targetUserId,
        amount: 0,
        type: "admin_plan_change",
        description: `Admin changed plan to ${plan}`,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET USER DETAIL ───
    if (action === "get_user_detail") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "targetUserId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [profileRes, creditsRes, transRes, cardsRes] = await Promise.all([
        adminClient.from("profiles").select("*").eq("id", targetUserId).single(),
        adminClient.from("user_credits").select("*").eq("user_id", targetUserId).single(),
        adminClient.from("credit_transactions").select("*").eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(50),
        adminClient.from("cards").select("id", { count: "exact", head: true }).eq("user_id", targetUserId).eq("scan_purpose", "collection"),
      ]);

      return new Response(
        JSON.stringify({
          profile: profileRes.data,
          credits: creditsRes.data,
          transactions: transRes.data || [],
          cardsCount: cardsRes.count || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── PERSON VIEW (lead and/or account) ───
    if (action === "get_person") {
      const { leadId, targetUserId } = body;
      let lead: any = null;
      if (leadId) lead = (await adminClient.from("agent_leads").select("*").eq("id", leadId).maybeSingle()).data;
      let uid: string | null = targetUserId || lead?.user_id || null;
      if (!lead && uid) lead = (await adminClient.from("agent_leads").select("*").eq("user_id", uid).is("merged_into", null).limit(1).maybeSingle()).data;
      let account: any = null;
      if (uid) {
        const [authRes, profileRes, creditsRes, transRes, cardsRes, pcRes, lastPc, lastCard] = await Promise.all([
          adminClient.auth.admin.getUserById(uid),
          adminClient.from("profiles").select("display_name, created_at, signup_ref").eq("id", uid).maybeSingle(),
          adminClient.from("user_credits").select("plan, credits, beta_access_until").eq("user_id", uid).maybeSingle(),
          adminClient.from("credit_transactions").select("id, amount, type, description, created_at").eq("user_id", uid)
            .in("type", ["credit_purchase", "subscription"]).order("created_at", { ascending: false }).limit(20),
          adminClient.from("cards").select("id", { count: "exact", head: true }).eq("user_id", uid),
          adminClient.from("price_checks").select("id", { count: "exact", head: true }).eq("user_id", uid),
          adminClient.from("price_checks").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          adminClient.from("cards").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        const u = authRes.data?.user;
        const lastActive = [u?.last_sign_in_at, lastPc.data?.created_at, lastCard.data?.created_at].filter(Boolean).sort().pop() ?? null;
        account = {
          user_id: uid, email: u?.email ?? null, display_name: profileRes.data?.display_name ?? null,
          signed_up_at: profileRes.data?.created_at ?? u?.created_at ?? null, signup_ref: profileRes.data?.signup_ref ?? null,
          plan: creditsRes.data?.plan ?? "free", credits: creditsRes.data?.credits ?? 0,
          scans: cardsRes.count ?? 0, price_checks: pcRes.count ?? 0, purchases: transRes.data ?? [], last_active: lastActive,
        };
      }
      let timeline: any[] = [];
      if (lead) {
        const [acts, drips, camp, outr, reps] = await Promise.all([
          adminClient.from("agent_activities").select("id, type, body, meta, created_at").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(200),
          adminClient.from("drip_campaign_queue").select("id, step, subject, sent, sent_at, scheduled_for, cancelled_at").eq("lead_id", lead.id),
          lead.email ? adminClient.from("email_send_log").select("id, template_name, status, created_at").eq("recipient_email", String(lead.email).toLowerCase()).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
          adminClient.from("agent_outreach").select("id, channel, status, subject, final_text, draft_text, created_at, sent_at").eq("lead_id", lead.id),
          adminClient.from("agent_replies").select("id, intent, subject, summary, body, received_at").eq("lead_id", lead.id),
        ]);
        timeline = [
          ...(outr.data || []).map((o: any) => ({ id: o.id, kind: `outreach_${o.status}`, text: o.subject || (o.final_text || o.draft_text || "").slice(0, 200), meta: { channel: o.channel }, at: o.sent_at || o.created_at })),
          ...(reps.data || []).map((r: any) => ({ id: r.id, kind: "reply", text: r.summary || (r.body || "").slice(0, 300), meta: { intent: r.intent, subject: r.subject }, at: r.received_at })),
          ...(acts.data || []).filter((a: any) => a.type !== "reply" && !String(a.type).startsWith("outreach_")).map((a: any) => ({ id: a.id, kind: a.type, text: a.body, meta: a.meta, at: a.created_at })),
          ...(drips.data || []).map((d: any) => ({ id: d.id, kind: d.cancelled_at ? "sequence_cancelled" : d.sent ? "sequence_sent" : "sequence_scheduled",
            text: `Step ${d.step}: ${d.subject}`, at: d.sent_at || d.cancelled_at || d.scheduled_for })),
          ...((camp as any).data || []).filter((e: any) => String(e.template_name).startsWith("campaign:"))
            .map((e: any) => ({ id: e.id, kind: e.status === "sent" ? "campaign_email" : "campaign_failed", text: e.template_name, at: e.created_at })),
        ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
      }
      const email = lead?.email || account?.email;
      const suppressed = email ? !!(await adminClient.from("email_suppressions").select("email").eq("email", String(email).toLowerCase()).maybeSingle()).data : false;
      return new Response(JSON.stringify({ lead, account, timeline, suppressed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── DELETE USER DATA ───
    if (action === "delete_user_data") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "targetUserId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete in order: card_folders → cards → credit_transactions → user_credits
      await adminClient.from("card_folders").delete().eq(
        "card_id",
        adminClient.from("cards").select("id").eq("user_id", targetUserId)
      ).then(() => {});

      await Promise.all([
        adminClient.from("cards").delete().eq("user_id", targetUserId),
        adminClient.from("credit_transactions").delete().eq("user_id", targetUserId),
      ]);

      await adminClient.from("user_credits").delete().eq("user_id", targetUserId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST ADMINS ───
    if (action === "list_admins") {
      const { data: roles, error: rolesErr } = await adminClient
        .from("user_roles")
        .select("user_id, role, created_at")
        .eq("role", "admin");
      if (rolesErr) throw rolesErr;

      const authUsersRes = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const emailMap: Record<string, string> = {};
      for (const u of authUsersRes.data?.users || []) {
        if (u.id && u.email) emailMap[u.id] = u.email;
      }

      const admins = (roles || []).map((r: any) => ({
        user_id: r.user_id,
        email: emailMap[r.user_id] || null,
        granted_at: r.created_at,
        is_self: r.user_id === userId,
      }));

      return new Response(JSON.stringify({ admins }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GRANT ADMIN (by email) ───
    if (action === "grant_admin") {
      const { email } = body;
      if (!email || typeof email !== "string") {
        return new Response(JSON.stringify({ error: "email required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const normalized = email.trim().toLowerCase();

      const authUsersRes = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const found = (authUsersRes.data?.users || []).find(
        (u: any) => (u.email || "").toLowerCase() === normalized
      );
      if (!found) {
        return new Response(JSON.stringify({ error: "No user found with that email" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", found.id)
        .eq("role", "admin")
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ success: true, alreadyAdmin: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: insErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: found.id, role: "admin" });
      if (insErr) throw insErr;

      return new Response(JSON.stringify({ success: true, user_id: found.id, email: found.email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── REVOKE ADMIN ───
    if (action === "revoke_admin") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "targetUserId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (targetUserId === userId) {
        return new Response(JSON.stringify({ error: "You cannot revoke your own admin access" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: delErr } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", targetUserId)
        .eq("role", "admin");
      if (delErr) throw delErr;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SET BETA WINDOW (grant / extend / revoke) ───
    if (action === "set_beta_window") {
      const { targetUserId, endsAt } = body as { targetUserId?: string; endsAt?: string | null };
      if (!isUuid(targetUserId)) {
        return new Response(JSON.stringify({ error: "Valid targetUserId (uuid) required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let endsAtIso: string | null = null;
      if (endsAt !== null && endsAt !== undefined) {
        if (typeof endsAt !== "string") {
          return new Response(JSON.stringify({ error: "endsAt must be an ISO date string or null" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const d = new Date(endsAt);
        if (Number.isNaN(d.getTime())) {
          return new Response(JSON.stringify({ error: "endsAt must be a valid date or null" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const now = Date.now();
        if (d.getTime() <= now || d.getTime() > now + MAX_BETA_WINDOW_MS) {
          return new Response(
            JSON.stringify({ error: "endsAt must be in the future and within 365 days" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        endsAtIso = d.toISOString();
      }

      const revoking = endsAtIso === null;

      const { data: updated, error: betaErr } = await adminClient
        .from("user_credits")
        .update({
          beta_access_until: endsAtIso,
          beta_eligible: !revoking,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", targetUserId)
        .select("user_id");

      if (betaErr) throw betaErr;
      if (!updated || updated.length === 0) {
        return new Response(JSON.stringify({ error: "Target user not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("credit_transactions").insert({
        user_id: targetUserId,
        amount: 0,
        type: revoking ? "admin_beta_revoke" : "admin_beta_grant",
        description: revoking
          ? `Admin ${userId} revoked beta eligibility`
          : `Admin ${userId} set beta window ending ${endsAtIso}`,
      });

      return new Response(JSON.stringify({ success: true, beta_access_until: endsAtIso }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SET FOUNDER PRICE LOCK ───
    if (action === "set_price_lock") {
      const { targetUserId, locked } = body as { targetUserId?: string; locked?: boolean };
      if (!isUuid(targetUserId) || typeof locked !== "boolean") {
        return new Response(
          JSON.stringify({ error: "Valid targetUserId (uuid) and boolean locked required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const lockedAt = locked ? new Date().toISOString() : null;

      const { data: lockUpdated, error: lockErr } = await adminClient
        .from("user_credits")
        .update({ beta_price_locked_at: lockedAt, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId)
        .select("user_id");

      if (lockErr) throw lockErr;
      if (!lockUpdated || lockUpdated.length === 0) {
        return new Response(JSON.stringify({ error: "Target user not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("credit_transactions").insert({
        user_id: targetUserId,
        amount: 0,
        type: locked ? "admin_price_lock" : "admin_price_unlock",
        description: locked
          ? `Admin ${userId} locked founder pricing ($6.99/mo)`
          : `Admin ${userId} removed founder price lock`,
      });


      return new Response(JSON.stringify({ success: true, beta_price_locked_at: lockedAt }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── BETA AUDIT LOG ───
    if (action === "get_beta_audit") {
      const BETA_TYPES = [
        "admin_beta_grant",
        "admin_beta_revoke",
        "admin_price_lock",
        "admin_price_unlock",
      ];

      const { data: rows, error: auditErr } = await adminClient
        .from("credit_transactions")
        .select("id, user_id, type, description, created_at")
        .in("type", BETA_TYPES)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (auditErr) throw auditErr;

      const { data: authList } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const emails: Record<string, string> = {};
      for (const u of authList?.users || []) {
        if (u.id && u.email) emails[u.id] = u.email;
      }

      const actorRe = /Admin ([0-9a-f-]{36})/i;
      const entries = (rows || []).map((r: any) => {
        const actorId = actorRe.exec(r.description || "")?.[1] ?? null;
        return {
          id: r.id,
          created_at: r.created_at,
          action: r.type,
          actor_id: actorId,
          actor_email: actorId ? emails[actorId] ?? null : null,
          target_id: r.user_id,
          target_email: emails[r.user_id] ?? null,
          description: r.description ?? "",
        };
      });

      return new Response(JSON.stringify({ entries }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-data] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
