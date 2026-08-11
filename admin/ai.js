let ADMIN_PROFILE = null;
let TOURNAMENT = null;
let ALL_REGS = [];
let SETTINGS = null;

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}
function toast(msg, isErr) {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add("leaving"); setTimeout(() => el.remove(), 300); }, 3200);
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "—"; }
function todayStr() { return new Date().toISOString().slice(0, 10); }

/* ==========================================================================
   DATA LOADING
   ========================================================================== */
async function loadTournamentAndRegs() {
  const { data: t } = await window.db.from("tournaments").select("*").eq("is_active", true).single();
  TOURNAMENT = t || null;
  if (!TOURNAMENT) { ALL_REGS = []; return; }
  const { data: regs } = await window.db.from("registrations").select("*").eq("tournament_id", TOURNAMENT.id).order("created_at", { ascending: false });
  ALL_REGS = regs || [];
}

async function loadSettings() {
  const { data } = await window.db.from("ai_settings").select("*").eq("id", "global").single();
  SETTINGS = data;
  renderModeButtons();
  document.getElementById("aiLastRun").textContent = "Last run: " + fmtDate(SETTINGS?.last_run_at);
}

/* ==========================================================================
   STATS CARDS
   ========================================================================== */
function renderStats() {
  const cards = document.querySelectorAll("#aiStats .stat-card .value");
  const set = (i, v) => { cards[i].textContent = v; cards[i].classList.remove("admin-loading"); };

  const today = todayStr();
  const todays = ALL_REGS.filter((r) => (r.created_at || "").slice(0, 10) === today);
  const pending = ALL_REGS.filter((r) => r.status === "pending");
  const approved = ALL_REGS.filter((r) => r.status === "approved");
  const rejected = ALL_REGS.filter((r) => r.status === "rejected");
  const paid = ALL_REGS.filter((r) => r.payment_status === "verified");
  const unpaid = ALL_REGS.filter((r) => r.payment_status !== "verified");
  const flagged = ALL_REGS.filter((r) => r.ai_flagged);
  const slotsRemaining = TOURNAMENT ? Math.max((TOURNAMENT.total_team_slots || 0) - approved.length, 0) : "—";

  set(0, String(todays.length));
  set(1, String(pending.length));
  set(2, String(approved.length));
  set(3, String(slotsRemaining));
  set(4, String(paid.length));
  set(5, String(unpaid.length));
  set(6, String(flagged.length));
  set(7, String(rejected.length));
}

/* ==========================================================================
   HEALTH CHECKS
   ========================================================================== */
async function renderHealth() {
  const list = document.getElementById("aiHealthList");
  const items = [];

  try {
    const { error } = await window.db.from("tournaments").select("id").limit(1);
    items.push({ label: "Database", status: error ? "bad" : "ok", note: error ? "Query failed" : "Connected" });
  } catch { items.push({ label: "Database", status: "bad", note: "Unreachable" }); }

  if (!TOURNAMENT) {
    items.push({ label: "Tournament", status: "warn", note: "No active tournament set" });
  } else {
    const approved = ALL_REGS.filter((r) => r.status === "approved").length;
    const remaining = (TOURNAMENT.total_team_slots || 0) - approved;
    items.push({
      label: "Tournament Capacity",
      status: remaining <= 0 ? "warn" : remaining < (TOURNAMENT.total_team_slots || 0) * 0.1 ? "warn" : "ok",
      note: `${Math.max(remaining, 0)} slots left`,
    });
  }

  if (SETTINGS && SETTINGS.automation_mode !== "off") {
    const last = SETTINGS.last_run_at ? new Date(SETTINGS.last_run_at).getTime() : 0;
    const staleMs = (SETTINGS.run_interval_minutes || 10) * 3 * 60 * 1000;
    const isStale = !last || (Date.now() - last) > staleMs;
    items.push({
      label: "Scheduled Agent",
      status: isStale ? "bad" : "ok",
      note: isStale ? "Hasn't run recently — check cron schedule" : "Running on schedule",
    });
  } else {
    items.push({ label: "Scheduled Agent", status: "warn", note: "Automation is OFF" });
  }

  list.innerHTML = items.map((i) => `
    <div class="ai-health-item">
      <span><span class="ai-health-dot ${i.status}"></span>${escapeHtml(i.label)}</span>
      <span style="color:var(--text-3)">${escapeHtml(i.note)}</span>
    </div>`).join("");
}

/* ==========================================================================
   AUTOMATION MODE CONTROLS
   ========================================================================== */
function renderModeButtons() {
  document.querySelectorAll(".ai-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", SETTINGS && btn.dataset.mode === SETTINGS.automation_mode);
  });
}

async function setMode(mode) {
  const { error } = await window.db.from("ai_settings").update({
    automation_mode: mode, updated_by: ADMIN_PROFILE.id, updated_at: new Date().toISOString(),
  }).eq("id", "global");
  if (error) { toast("Failed to update automation mode.", true); return; }
  toast(`Automation set to "${mode}".`);
  await loadSettings();
  await logAudit(`Set AI automation mode to ${mode}`, null, null);
}

async function runAgentNow() {
  const btn = document.getElementById("aiRunNowBtn");
  btn.disabled = true;
  btn.textContent = "Running…";
  try {
    const { data, error } = await window.db.functions.invoke("ai-agent", { body: {} });
    if (error) throw error;
    toast(data?.summary || "Agent run complete.");
    await refreshAll();
  } catch (e) {
    console.error(e);
    toast("Agent run failed — check it's deployed (see deployment guide).", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "▶ Run Agent Now";
  }
}

/* ==========================================================================
   RUN LOG
   ========================================================================== */
async function renderRunLog() {
  const el = document.getElementById("aiRunLog");
  const { data, error } = await window.db.from("ai_agent_runs").select("*").order("run_at", { ascending: false }).limit(12);
  if (error || !data || !data.length) { el.innerHTML = `<div class="admin-loading">No runs yet — deploy the agent and click "Run Agent Now", or wait for the schedule.</div>`; return; }
  el.innerHTML = data.map((r) => `
    <div class="run-row">
      <div>
        <div>${escapeHtml(r.summary || (r.error ? "Run failed: " + r.error : "—"))}</div>
        <div class="meta">${r.mode.toUpperCase()} · ✓${r.approved_count || 0} ✕${r.rejected_count || 0} ⚑${r.flagged_count || 0} · ${r.duration_ms || 0}ms${r.actor_label ? " · " + escapeHtml(r.actor_label) : ""}</div>
      </div>
      <div class="meta" style="white-space:nowrap;">${fmtDate(r.run_at)}</div>
    </div>`).join("");
}

/* ==========================================================================
   SUGGESTIONS QUEUE
   ========================================================================== */
let PENDING_SUGGESTIONS = [];

async function loadSuggestions() {
  const { data } = await window.db.from("ai_suggestions").select("*").eq("status", "pending").order("created_at", { ascending: false });
  PENDING_SUGGESTIONS = data || [];
  renderSuggestions();
}

function regFor(id) { return ALL_REGS.find((r) => r.id === id); }

function renderSuggestions() {
  const el = document.getElementById("aiSuggestionsList");
  if (!PENDING_SUGGESTIONS.length) { el.innerHTML = `<div class="admin-loading">No pending suggestions. The agent will queue items here in Suggestions/Semi-Automatic mode.</div>`; return; }

  el.innerHTML = PENDING_SUGGESTIONS.map((s) => {
    const reg = regFor(s.registration_id);
    const label = reg ? `${escapeHtml(reg.team_name)} · Capt. ${escapeHtml(reg.captain_name)}` : "";
    let actions = "";
    if (s.suggestion_type === "approve_registration") {
      actions = `<button class="btn-verify" data-act="apply" data-id="${s.id}">Approve</button>
                 <button class="btn-reject" data-act="dismiss" data-id="${s.id}">Dismiss</button>`;
    } else if (s.suggestion_type === "reject_registration") {
      actions = `<button class="btn-reject" data-act="apply" data-id="${s.id}">Reject</button>
                 <button class="btn-verify" data-act="dismiss" data-id="${s.id}">Dismiss</button>`;
    } else if (s.suggestion_type === "flag_suspicious") {
      actions = `<button class="btn-reject" data-act="reject-flagged" data-id="${s.id}">Reject Registration</button>
                 <button class="btn-verify" data-act="clear-flag" data-id="${s.id}">Clear Flag</button>`;
    } else {
      actions = `<button class="btn-verify" data-act="dismiss" data-id="${s.id}">Dismiss</button>`;
    }
    return `
      <div class="sugg-card">
        <div class="type">${s.suggestion_type.replace(/_/g, " ")} · ${s.confidence} confidence</div>
        <div class="reason"><strong>${label}</strong>${label ? " — " : ""}${escapeHtml(s.reason)}</div>
        <div class="sugg-actions">${actions}</div>
      </div>`;
  }).join("");

  el.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => handleSuggestionAction(btn.dataset.id, btn.dataset.act));
  });
}

async function resolveSuggestion(id, status) {
  await window.db.from("ai_suggestions").update({ status, resolved_by: ADMIN_PROFILE.id, resolved_at: new Date().toISOString() }).eq("id", id);
}

async function handleSuggestionAction(id, act) {
  const s = PENDING_SUGGESTIONS.find((x) => x.id === id);
  if (!s) return;

  try {
    if (act === "dismiss") {
      await resolveSuggestion(id, "dismissed");
    } else if (act === "apply" && s.suggestion_type === "approve_registration") {
      await approveRegistration(s.registration_id);
      await resolveSuggestion(id, "accepted");
      await logAudit("Approved registration (AI suggestion accepted)", s.registration_id, null);
    } else if (act === "apply" && s.suggestion_type === "reject_registration") {
      await window.db.from("registrations").update({ status: "rejected" }).eq("id", s.registration_id);
      await resolveSuggestion(id, "accepted");
      await logAudit("Rejected registration (AI suggestion accepted)", s.registration_id, null);
    } else if (act === "reject-flagged") {
      await window.db.from("registrations").update({ status: "rejected" }).eq("id", s.registration_id);
      await resolveSuggestion(id, "accepted");
      await logAudit("Rejected flagged registration", s.registration_id, { reason: s.reason });
    } else if (act === "clear-flag") {
      await window.db.from("registrations").update({ ai_flagged: false, ai_flag_reason: null }).eq("id", s.registration_id);
      await resolveSuggestion(id, "dismissed");
      await logAudit("Cleared AI flag (confirmed not a duplicate)", s.registration_id, null);
    }
    toast("Done.");
    await refreshAll();
  } catch (e) {
    console.error(e);
    toast("Action failed.", true);
  }
}

async function approveRegistration(regId) {
  // Atomic — see migration_atomic_approve_rpc.sql. Replaces what used to
  // be 3 separate, unguarded writes here (this was the third place in the
  // codebase doing that same sequence — admin/registrations.js and the AI
  // agent edge function were the other two, both already fixed).
  const { error } = await window.db.rpc("approve_registration", { p_registration_id: regId });
  if (error) throw error;
}

async function bulkApplySafe() {
  const safe = PENDING_SUGGESTIONS.filter((s) => s.suggestion_type === "approve_registration" && s.confidence === "high");
  if (!safe.length) { toast("No high-confidence approve suggestions to apply."); return; }
  if (!confirm(`Apply ${safe.length} high-confidence approval(s)? Rejections and flags always need individual review.`)) return;
  let applied = 0;
  let stoppedEarly = null;
  for (const s of safe) {
    try {
      await approveRegistration(s.registration_id);
      await resolveSuggestion(s.id, "accepted");
      applied++;
    } catch (e) {
      // The RPC's own capacity check (via the team_slot_capacity_guard
      // trigger) is what actually stops overselling here — this loop has
      // no independent slot tracking of its own, so if the tournament
      // fills up partway through a bulk-apply, later iterations will
      // start failing. Stop rather than silently skip, so the admin sees
      // exactly how far it got instead of a partial result with no signal.
      console.error("bulk approve failed on", s.registration_id, e);
      stoppedEarly = e.message || "capacity or validation error";
      break;
    }
  }
  await logAudit(`Bulk-applied ${applied} of ${safe.length} AI approval suggestions`, null, stoppedEarly ? { stopped_early: stoppedEarly } : null);
  toast(stoppedEarly ? `Applied ${applied} of ${safe.length} — stopped: ${stoppedEarly}` : `Applied ${applied} approvals.`, !!stoppedEarly);
  await refreshAll();
}

/* ==========================================================================
   AI CHAT — deterministic Q&A engine over real Supabase data (no external
   LLM / API key required; every answer traces back to a live query).
   ========================================================================== */
function pushMsg(text, who) {
  const log = document.getElementById("aiChatLog");
  const div = document.createElement("div");
  div.className = "ai-msg " + who;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function answerQuery(qRaw) {
  const q = qRaw.trim().toLowerCase();
  if (!TOURNAMENT) return "No active tournament is set yet — nothing to report on.";

  const today = todayStr();
  const todays = ALL_REGS.filter((r) => (r.created_at || "").slice(0, 10) === today);
  const pending = ALL_REGS.filter((r) => r.status === "pending");
  const approved = ALL_REGS.filter((r) => r.status === "approved");
  const rejected = ALL_REGS.filter((r) => r.status === "rejected");
  const disqualified = ALL_REGS.filter((r) => r.status === "disqualified");
  const paid = ALL_REGS.filter((r) => r.payment_status === "verified");
  const unpaid = ALL_REGS.filter((r) => r.payment_status !== "verified");
  const flagged = ALL_REGS.filter((r) => r.ai_flagged);
  const slotsRemaining = Math.max((TOURNAMENT.total_team_slots || 0) - approved.length, 0);

  const listNames = (arr, n = 10) => arr.slice(0, n).map((r) => `• ${r.team_name} (Capt. ${r.captain_name})`).join("\n") || "None.";

  if (/today.?s registrations|show today/.test(q)) return `${todays.length} registration(s) today:\n${listNames(todays)}`;
  if (/how many registrations today/.test(q)) return `${todays.length} registration(s) today.`;
  if (/how many approved/.test(q)) return `${approved.length} approved team(s).`;
  if (/how many pending/.test(q)) return `${pending.length} pending team(s).`;
  if (/how many paid/.test(q)) return `${paid.length} team(s) with verified payment.`;
  if (/how many unpaid/.test(q)) return `${unpaid.length} team(s) unpaid / unverified.`;
  if (/slots remain|remaining slots/.test(q)) return `${slotsRemaining} of ${TOURNAMENT.total_team_slots || 0} slots remaining.`;
  if (/who registered last|last registration/.test(q)) {
    const last = ALL_REGS[0];
    return last ? `Last registered: ${last.team_name} (Capt. ${last.captain_name}) at ${fmtDate(last.created_at)}.` : "No registrations yet.";
  }
  if (/duplicate uid/.test(q)) return findDuplicates("uid");
  if (/duplicate whatsapp/.test(q)) return findDuplicates("whatsapp");
  if (/duplicate team/.test(q)) return findDuplicates("team_name");
  if (/suspicious/.test(q)) return `${flagged.length} flagged registration(s):\n${listNames(flagged)}`;
  if (/rejected teams|show rejected/.test(q)) return `${rejected.length} rejected team(s):\n${listNames(rejected)}`;
  if (/disqualified/.test(q)) return `${disqualified.length} disqualified team(s):\n${listNames(disqualified)}`;
  if (/player count/.test(q)) return `${approved.length * (TOURNAMENT.team_size || 4)} players across ${approved.length} approved team(s) (est. ${TOURNAMENT.team_size || 4}/team).`;
  if (/generate tournament report|tournament summary/.test(q)) {
    return [
      `TOURNAMENT REPORT — ${TOURNAMENT.name || "Active Tournament"}`,
      `Registrations today: ${todays.length} · Total: ${ALL_REGS.length}`,
      `Approved: ${approved.length} · Pending: ${pending.length} · Rejected: ${rejected.length}`,
      `Payment verified: ${paid.length} · Unpaid: ${unpaid.length}`,
      `Flagged: ${flagged.length} · Slots remaining: ${slotsRemaining}/${TOURNAMENT.total_team_slots || 0}`,
    ].join("\n");
  }
  if (/generate leaderboard|leaderboard summary/.test(q)) return "Leaderboard is recomputed automatically each agent run from the scores table — check the public Leaderboard page, or click \"Run Agent Now\" to refresh it immediately.";
  if (/create announcement/.test(q)) return "Go to Admin > Announcements to publish one (coming in the next phase) — the agent already drafts a daily report there automatically; it never auto-publishes text content, by design.";
  if (/today.?s matches|show matches/.test(q)) return "Match scheduling isn't wired into this dashboard yet (Phase: Live Control) — coming next.";
  if (/room details/.test(q)) return "Room ID/Password management isn't wired into this dashboard yet (Phase: Live Control) — coming next.";
  if (/^search /.test(q)) {
    const term = q.replace(/^search /, "").trim();
    const hits = ALL_REGS.filter((r) =>
      [r.team_name, r.captain_name, r.captain_uid, r.whatsapp].some((f) => (f || "").toLowerCase().includes(term))
    );
    return hits.length ? `${hits.length} match(es):\n${listNames(hits, 15)}` : `No registration matches "${term}".`;
  }

  const hits = ALL_REGS.filter((r) =>
    [r.team_name, r.captain_name, r.captain_uid, r.whatsapp].some((f) => (f || "").toLowerCase().includes(q))
  );
  if (hits.length) return `Found ${hits.length} match(es) for "${qRaw}":\n${listNames(hits, 15)}`;

  return `I didn't recognize that one. Try things like: "today's registrations", "how many pending teams", "slots remaining", "find duplicate UIDs", "suspicious registrations", "generate tournament report", or "search <name/UID/whatsapp>".`;
}

function findDuplicates(kind) {
  const map = new Map();
  ALL_REGS.forEach((r) => {
    let keys = [];
    if (kind === "uid") {
      if (r.captain_uid) keys.push(r.captain_uid);
      (Array.isArray(r.players) ? r.players : []).forEach((p) => { if (p?.uid) keys.push(p.uid); });
    } else if (kind === "whatsapp") {
      if (r.whatsapp) keys.push(r.whatsapp);
    } else if (kind === "team_name") {
      if (r.team_name) keys.push(r.team_name);
    }
    keys.forEach((k) => {
      const norm = String(k).trim().toLowerCase();
      if (!map.has(norm)) map.set(norm, new Set());
      map.get(norm).add(r.team_name);
    });
  });
  const dupes = Array.from(map.entries()).filter(([, teams]) => teams.size > 1);
  if (!dupes.length) return `No duplicate ${kind === "uid" ? "UIDs" : kind === "whatsapp" ? "WhatsApp numbers" : "team names"} found.`;
  return `Found ${dupes.length} duplicate(s):\n` + dupes.map(([val, teams]) => `• "${val}" → ${Array.from(teams).join(", ")}`).join("\n");
}

function initChat() {
  document.getElementById("aiChatSend").addEventListener("click", handleSend);
  document.getElementById("aiChatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") handleSend(); });
  document.querySelectorAll(".ai-suggest-chip").forEach((chip) => {
    chip.addEventListener("click", () => { document.getElementById("aiChatInput").value = chip.dataset.q; handleSend(); });
  });
  pushMsg("Ask me about registrations, payments, duplicates, or reports — I answer straight from your live Supabase data.", "bot");
}

function handleSend() {
  const input = document.getElementById("aiChatInput");
  const text = input.value.trim();
  if (!text) return;
  pushMsg(text, "user");
  input.value = "";
  setTimeout(() => pushMsg(answerQuery(text), "bot"), 150);
}

/* ==========================================================================
   INIT
   ========================================================================== */
async function refreshAll() {
  await Promise.all([loadTournamentAndRegs(), loadSettings()]);
  renderStats();
  await Promise.all([renderHealth(), renderRunLog(), loadSuggestions()]);
}

async function init() {
  ADMIN_PROFILE = await requireAdmin();
  if (!ADMIN_PROFILE) return;
  document.getElementById("adminUserLabel").textContent = `${ADMIN_PROFILE.email} · ${ADMIN_PROFILE.role.toUpperCase()}`;
  document.getElementById("logoutBtn").addEventListener("click", () => { logAudit("Admin Logout", ADMIN_PROFILE.id, null).finally(adminLogout); });

  document.querySelectorAll(".ai-mode-btn").forEach((btn) => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
  document.getElementById("aiRunNowBtn").addEventListener("click", runAgentNow);
  document.getElementById("aiBulkApplyBtn").addEventListener("click", bulkApplySafe);

  initChat();
  await refreshAll();
}

init();
