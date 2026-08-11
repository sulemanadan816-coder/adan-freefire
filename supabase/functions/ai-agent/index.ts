// =============================================================================
// AI TOURNAMENT MANAGER — AUTONOMOUS AGENT (Supabase Edge Function)
// -----------------------------------------------------------------------------
// This runs server-side, on a schedule (see DEPLOY.md), completely independent
// of whether anyone has the admin dashboard open. That's what makes it work
// "while you're offline" — it's not a browser feature, it's a backend job.
//
// Two ways this function is invoked:
//   1. The scheduled cron job (every N minutes) — authenticated via a shared
//      secret header (x-cron-secret), not a user login.
//   2. The "Run Agent Now" button in /admin/ai.html — authenticated via the
//      logged-in admin's own session (must be role owner/admin).
//
// Hard safety rules baked into the code (not configurable from the UI):
//   - NEVER approve a registration whose payment is not "verified".
//   - NEVER auto-approve or auto-reject a registration that is flagged as a
//     possible duplicate/fraud match — that always goes to a human.
//   - NEVER auto-publish free-text content (announcements) — always drafted
//     for the Owner to review. Only objective, deterministic actions
//     (approve/reject on hard rules, leaderboard math) can be automatic.
//   - Every action is written to audit_logs AND ai_agent_runs, so there's
//     always a paper trail of exactly what the agent did while you were away.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("AI_AGENT_CRON_SECRET") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Service-role client — bypasses RLS. Only ever used server-side, inside
// this function. The key is a Supabase secret, never shipped to the browser.
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function isAuthorizedCaller(req: Request): Promise<{ ok: boolean; actorId: string | null; actorLabel: string }> {
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (CRON_SECRET && cronHeader === CRON_SECRET) {
    return { ok: true, actorId: null, actorLabel: "Scheduled Run" };
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, actorId: null, actorLabel: "" };

  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData, error } = await anonClient.auth.getUser(token);
  if (error || !userData?.user) return { ok: false, actorId: null, actorLabel: "" };

  const { data: profile } = await db
    .from("profiles")
    .select("id, role, email")
    .eq("id", userData.user.id)
    .single();

  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return { ok: false, actorId: null, actorLabel: "" };
  }
  return { ok: true, actorId: profile.id, actorLabel: `Manual Run (${profile.email})` };
}

async function logAudit(action: string, recordId: string | null, details: unknown) {
  await db.from("audit_logs").insert([{ admin_id: null, action: `[AI Agent] ${action}`, record_id: recordId, details }]);
}

function normalize(s: string | null | undefined) {
  return (s || "").trim().toLowerCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const auth = await isAuthorizedCaller(req);
  if (!auth.ok) return json({ error: "Unauthorized" }, 401);

  const startedAt = Date.now();
  const stats = {
    registrations_scanned: 0,
    approved_count: 0,
    rejected_count: 0,
    flagged_count: 0,
    suggestions_created: 0,
  };
  let summaryLines: string[] = [];
  let runError: string | null = null;

  try {
    // --- 1. Load settings -------------------------------------------------
    const { data: settings } = await db.from("ai_settings").select("*").eq("id", "global").single();
    const mode = settings?.automation_mode || "off";

    // Minimal cost/abuse guard: every caller is already authenticated (cron
    // secret or admin JWT) before reaching this line, so there's no
    // anonymous-abuse surface to close here — but nothing stopped an admin
    // double-clicking "Run Agent Now", or a misconfigured cron interval,
    // from firing overlapping runs and doing redundant DB work. Reuse the
    // last_run_at this function already tracks as a simple cooldown. This
    // is not a general-purpose rate limiter — if this endpoint is ever
    // exposed more broadly, a real per-actor limiter belongs in front of it.
    const MIN_RUN_INTERVAL_MS = 20_000;
    if (settings?.last_run_at) {
      const sinceLastRun = Date.now() - new Date(settings.last_run_at).getTime();
      if (sinceLastRun >= 0 && sinceLastRun < MIN_RUN_INTERVAL_MS) {
        return json({ ok: false, error: "RATE_LIMITED", retry_after_ms: MIN_RUN_INTERVAL_MS - sinceLastRun }, 429);
      }
    }

    if (mode === "off") {
      await db.from("ai_agent_runs").insert([{
        mode, ...stats, summary: "Automation is OFF — agent did nothing.", duration_ms: Date.now() - startedAt,
        triggered_by: auth.actorId, actor_label: auth.actorLabel,
      }]);
      return json({ ok: true, mode, summary: "Automation is OFF." });
    }

    // --- 2. Load active tournament + capacity ------------------------------
    const { data: tournament } = await db.from("tournaments").select("*").eq("is_active", true).single();
    if (!tournament) {
      await db.from("ai_agent_runs").insert([{
        mode, ...stats, summary: "No active tournament found — nothing to do.", duration_ms: Date.now() - startedAt,
        triggered_by: auth.actorId, actor_label: auth.actorLabel,
      }]);
      return json({ ok: true, mode, summary: "No active tournament." });
    }

    const totalSlots = tournament.total_team_slots || 0;
    const { count: approvedCount } = await db
      .from("teams")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournament.id)
      .eq("status", "approved");
    let slotsRemaining = totalSlots - (approvedCount || 0);

    // --- 3. Load ALL registrations for this tournament for duplicate scan --
    const { data: allRegs } = await db
      .from("registrations")
      .select("*")
      .eq("tournament_id", tournament.id);
    const regs = allRegs || [];

    const uidMap = new Map<string, string[]>();      // uid -> [registration_id]
    const whatsappMap = new Map<string, string[]>();
    const teamNameMap = new Map<string, string[]>();

    for (const r of regs) {
      const uids = new Set<string>();
      if (r.captain_uid) uids.add(normalize(r.captain_uid));
      (Array.isArray(r.players) ? r.players : []).forEach((p: any) => {
        if (p?.uid) uids.add(normalize(p.uid));
      });
      for (const uid of uids) {
        if (!uid) continue;
        if (!uidMap.has(uid)) uidMap.set(uid, []);
        uidMap.get(uid)!.push(r.id);
      }
      const wa = normalize(r.whatsapp);
      if (wa) {
        if (!whatsappMap.has(wa)) whatsappMap.set(wa, []);
        whatsappMap.get(wa)!.push(r.id);
      }
      const tn = normalize(r.team_name);
      if (tn) {
        if (!teamNameMap.has(tn)) teamNameMap.set(tn, []);
        teamNameMap.get(tn)!.push(r.id);
      }
    }

    function findDuplicateReason(r: any): string | null {
      const uids = new Set<string>();
      if (r.captain_uid) uids.add(normalize(r.captain_uid));
      (Array.isArray(r.players) ? r.players : []).forEach((p: any) => { if (p?.uid) uids.add(normalize(p.uid)); });
      for (const uid of uids) {
        if ((uidMap.get(uid) || []).length > 1) return `Duplicate player UID "${uid}" also appears in another registration.`;
      }
      const wa = normalize(r.whatsapp);
      if (wa && (whatsappMap.get(wa) || []).length > 1) return `Duplicate WhatsApp number "${r.whatsapp}" also used by another registration.`;
      const tn = normalize(r.team_name);
      if (tn && (teamNameMap.get(tn) || []).length > 1) return `Duplicate team name "${r.team_name}" also used by another registration.`;
      return null;
    }

    // --- 4. Process pending registrations ----------------------------------
    const pending = regs.filter((r) => r.status === "pending");
    stats.registrations_scanned = pending.length;

    for (const reg of pending) {
      const dupReason = findDuplicateReason(reg);

      if (dupReason) {
        if (!reg.ai_flagged) {
          await db.from("registrations").update({
            ai_flagged: true, ai_flag_reason: dupReason,
            ai_last_action: "flagged", ai_last_action_at: new Date().toISOString(),
          }).eq("id", reg.id);

          await db.from("ai_suggestions").insert([{
            suggestion_type: "flag_suspicious",
            registration_id: reg.id,
            reason: dupReason,
            confidence: "high",
            payload: { team_name: reg.team_name, captain_name: reg.captain_name },
          }]);

          await logAudit("Flagged suspicious registration", reg.id, { reason: dupReason });
          stats.flagged_count++;
          stats.suggestions_created++;
        }
        continue; // never touch flagged registrations automatically
      }

      if (reg.payment_status !== "verified") continue; // hard rule — no payment, no action

      if (slotsRemaining <= 0) {
        const reason = "Tournament is full — no slots remaining.";
        if (mode === "automatic" && settings.auto_reject_when_full) {
          await db.from("registrations").update({
            status: "rejected", internal_notes: reason,
            ai_last_action: "auto_rejected_full", ai_last_action_at: new Date().toISOString(),
          }).eq("id", reg.id);
          await logAudit("Auto-rejected registration (slots full)", reg.id, { reason });
          stats.rejected_count++;
        } else {
          await db.from("ai_suggestions").insert([{
            suggestion_type: "reject_registration", registration_id: reg.id, reason, confidence: "high",
            payload: { team_name: reg.team_name },
          }]);
          stats.suggestions_created++;
        }
        continue;
      }

      // Clean, payment-verified, slot available.
      const reason = "Payment verified, slot available, no duplicates detected.";
      if (mode === "automatic") {
        // Atomic: team + players + registration status + audit log all in
        // one DB transaction. See migration_atomic_approve_rpc.sql — this
        // replaces what used to be 3 separate inserts/updates done here in
        // JS with no transaction around them (a crash or error partway
        // through could leave a team with no players, or an approved-
        // looking team whose registration was still "pending").
        const { data: rpcResult, error: rpcErr } = await db.rpc("approve_registration", { p_registration_id: reg.id });
        if (rpcErr) {
          console.error("approve_registration RPC failed", reg.id, rpcErr);
          await logAudit("Auto-approve failed", reg.id, { reason: rpcErr.message });
        } else {
          stats.approved_count++;
          slotsRemaining--;
          void rpcResult; // logging already done inside the RPC itself
        }
      } else {
        await db.from("ai_suggestions").insert([{
          suggestion_type: "approve_registration", registration_id: reg.id, reason, confidence: "high",
          payload: { team_name: reg.team_name, captain_name: reg.captain_name },
        }]);
        stats.suggestions_created++;
      }
    }

    summaryLines.push(
      `Scanned ${stats.registrations_scanned} pending registrations.`,
      `Flagged ${stats.flagged_count} as suspicious (needs human review).`,
      mode === "automatic"
        ? `Auto-approved ${stats.approved_count}, auto-rejected ${stats.rejected_count} (slots full).`
        : `Queued ${stats.suggestions_created} suggestions for admin review.`,
    );

    // --- 5. Recompute leaderboard (deterministic aggregation, safe to run) -
    try {
      const { data: teams } = await db.from("teams").select("id").eq("tournament_id", tournament.id).eq("status", "approved");
      if (teams && teams.length) {
        const { data: scores } = await db.from("scores").select("*").in("team_id", teams.map((t) => t.id));
        const agg = new Map<string, { kills: number; placement: number; matches: number }>();
        (scores || []).forEach((s) => {
          const cur = agg.get(s.team_id) || { kills: 0, placement: 0, matches: 0 };
          cur.kills += s.kills || 0;
          cur.placement += s.placement_points || 0;
          cur.matches += 1;
          agg.set(s.team_id, cur);
        });
        const ranked = Array.from(agg.entries())
          .map(([team_id, v]) => ({ team_id, ...v, total: v.kills + v.placement }))
          .sort((a, b) => b.total - a.total);

        for (let i = 0; i < ranked.length; i++) {
          const r = ranked[i];
          await db.from("leaderboard").upsert({
            tournament_id: tournament.id, team_id: r.team_id,
            matches_played: r.matches, kills: r.kills, placement_points: r.placement,
            total_points: r.total, rank: i + 1,
            is_published: mode === "automatic" && settings.auto_publish_leaderboard ? true : undefined,
            updated_at: new Date().toISOString(),
          }, { onConflict: "tournament_id,team_id" });
        }
        if (ranked.length) summaryLines.push(`Leaderboard recomputed for ${ranked.length} teams.`);
      }
    } catch (e) {
      console.error("leaderboard recompute failed", e);
    }

    // --- 6. Daily report (always a draft — agent never auto-publishes text) -
    const today = new Date().toISOString().slice(0, 10);
    const reportTitle = `AI Daily Report — ${today}`;
    const { data: existingReport } = await db.from("announcements")
      .select("id").eq("tournament_id", tournament.id).eq("title", reportTitle).maybeSingle();

    if (!existingReport) {
      const todaysRegs = regs.filter((r) => (r.created_at || "").slice(0, 10) === today);
      const paid = regs.filter((r) => r.payment_status === "verified").length;
      const unpaid = regs.filter((r) => r.payment_status !== "verified").length;
      const approved = regs.filter((r) => r.status === "approved").length;
      const rejected = regs.filter((r) => r.status === "rejected").length;
      const flagged = regs.filter((r) => r.ai_flagged).length;

      const message = [
        `New registrations today: ${todaysRegs.length}`,
        `Total pending: ${pending.length}`,
        `Approved teams: ${approved} / ${totalSlots}`,
        `Rejected: ${rejected}`,
        `Flagged for review: ${flagged}`,
        `Payment verified: ${paid} · Unpaid/unverified: ${unpaid}`,
        `Slots remaining: ${Math.max(slotsRemaining, 0)}`,
      ].join("\n");

      await db.from("announcements").insert([{
        tournament_id: tournament.id, title: reportTitle, message,
        priority: "normal", is_published: false,
      }]);
      summaryLines.push("Drafted a new daily report (unpublished — review in Admin > Announcements).");
    }

    // --- 7. Update settings + run log --------------------------------------
    await db.from("ai_settings").update({ last_run_at: new Date().toISOString() }).eq("id", "global");

    const finalSummary = summaryLines.join(" ");
    await db.from("ai_agent_runs").insert([{
      mode, ...stats, summary: finalSummary, duration_ms: Date.now() - startedAt,
      triggered_by: auth.actorId, actor_label: auth.actorLabel,
    }]);

    return json({ ok: true, mode, actor: auth.actorLabel, stats, summary: finalSummary });
  } catch (e) {
    runError = String(e?.message || e);
    console.error("AI agent run failed", e);
    await db.from("ai_agent_runs").insert([{
      mode: "error", ...stats, summary: "Run failed.", error: runError, duration_ms: Date.now() - startedAt,
      triggered_by: auth.actorId, actor_label: auth.actorLabel,
    }]);
    return json({ ok: false, error: runError }, 500);
  }
});
