let ADMIN_PROFILE = null;
let ACTIVE_TOURNAMENT_ID = null;
let ALL_MATCHES = [];
let ALL_TEAMS = [];
let FILTERED = [];

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
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function confirmDialog(title, msg) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirmOverlay");
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmMsg").textContent = msg;
    overlay.classList.add("open");
    const cleanup = (result) => {
      overlay.classList.remove("open");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const okBtn = document.getElementById("confirmOk");
    const cancelBtn = document.getElementById("confirmCancel");
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

async function init() {
  ADMIN_PROFILE = await requireAdmin();
  if (!ADMIN_PROFILE) return;

  document.getElementById("adminUserLabel").textContent = `${ADMIN_PROFILE.email} · ${ADMIN_PROFILE.role.toUpperCase()}`;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    logAudit("Admin Logout", ADMIN_PROFILE.id, null).finally(adminLogout);
  });

  const { data: tournament } = await window.db.from("tournaments").select("id").eq("is_active", true).single();
  ACTIVE_TOURNAMENT_ID = tournament ? tournament.id : null;

  document.getElementById("statusFilter").addEventListener("change", applyFilters);
  document.getElementById("addMatchBtn").addEventListener("click", () => openEdit(null));
  document.getElementById("editCancel").addEventListener("click", () => document.getElementById("editOverlay").classList.remove("open"));
  document.getElementById("editSave").addEventListener("click", saveEdit);
  document.getElementById("scoresCancel").addEventListener("click", () => document.getElementById("scoresOverlay").classList.remove("open"));
  document.getElementById("scoresSave").addEventListener("click", saveScores);

  await loadMatches();
  subscribeRealtime();
}

async function loadMatches() {
  const wrap = document.getElementById("tableWrap");
  wrap.innerHTML = `<div class="admin-loading">Loading…</div>`;

  let query = window.db.from("matches").select("*").order("match_number", { ascending: true });
  if (ACTIVE_TOURNAMENT_ID) query = query.eq("tournament_id", ACTIVE_TOURNAMENT_ID);
  const { data, error } = await query;
  if (error) { wrap.innerHTML = `<div style="color:var(--danger);">${escapeHtml(error.message)}</div>`; return; }
  ALL_MATCHES = data || [];

  const { data: teams } = await window.db.from("teams").select("id, team_name").eq("status", "approved").order("team_name");
  ALL_TEAMS = teams || [];

  applyFilters();
}

function applyFilters() {
  const status = document.getElementById("statusFilter").value;
  FILTERED = status ? ALL_MATCHES.filter((m) => m.status === status) : [...ALL_MATCHES];
  render();
}

function render() {
  const wrap = document.getElementById("tableWrap");
  if (FILTERED.length === 0) {
    wrap.innerHTML = `<div style="padding:30px 0; text-align:center; color:var(--text-3);">No matches yet — create one to get started.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="reg-table">
      <thead><tr><th>#</th><th>Label</th><th>Map / Mode</th><th>Scheduled</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${FILTERED.map((m) => `
          <tr>
            <td>${m.match_number}</td>
            <td><strong>${escapeHtml(m.label)}</strong></td>
            <td>${escapeHtml(m.map || "—")} · ${escapeHtml(m.mode || "Squad")}</td>
            <td>${m.scheduled_time ? new Date(m.scheduled_time).toLocaleString() : "—"}</td>
            <td><span class="badge badge-${m.status}">${m.status.replace("_", " ")}</span></td>
            <td>
              <div class="row-actions">
                <button data-act="edit" data-id="${m.id}">Edit</button>
                <button data-act="scores" data-id="${m.id}">Scores</button>
                ${m.status !== "live" ? `<button data-act="start" data-id="${m.id}">Start</button>` : `<button data-act="finish" data-id="${m.id}">Finish</button>`}
                <button class="danger" data-act="delete" data-id="${m.id}">Delete</button>
              </div>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  wrap.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => handleAction(btn.dataset.act, btn.dataset.id));
  });
}

async function handleAction(act, id) {
  const match = ALL_MATCHES.find((m) => m.id === id);
  if (!match) return;

  if (act === "edit") return openEdit(match);
  if (act === "scores") return openScores(match);

  if (act === "delete") {
    const ok = await confirmDialog("Delete match?", `${match.label} and its scores will be permanently deleted.`);
    if (!ok) return;
    await window.db.from("scores").delete().eq("match_id", id);
    const { error } = await window.db.from("matches").delete().eq("id", id);
    if (error) return toast(error.message, true);
    await logAudit("Deleted Match", id, { label: match.label });
    toast("Match deleted");
    await loadMatches();
    return;
  }

  if (act === "start" || act === "finish") {
    const newStatus = act === "start" ? "live" : "completed";
    const { error } = await window.db.from("matches").update({ status: newStatus }).eq("id", id);
    if (error) return toast(error.message, true);
    await logAudit(`Match ${act === "start" ? "Started" : "Finished"}`, id, { label: match.label });
    toast(`${match.label} ${newStatus}`);
    await loadMatches();
  }
}

function openEdit(match) {
  document.getElementById("editTitle").textContent = match ? "Edit Match" : "Create Match";
  document.getElementById("editOverlay").dataset.id = match ? match.id : "";
  document.getElementById("editNumber").value = match ? match.match_number : (ALL_MATCHES.length + 1);
  document.getElementById("editLabel").value = match ? match.label : `Match ${String(ALL_MATCHES.length + 1).padStart(2, "0")}`;
  document.getElementById("editMap").value = match ? (match.map || "") : "";
  document.getElementById("editMode").value = match ? (match.mode || "Squad") : "Squad";
  document.getElementById("editTime").value = match && match.scheduled_time ? toLocalInput(match.scheduled_time) : "";
  document.getElementById("editStatus").value = match ? match.status : "upcoming";
  document.getElementById("editOverlay").classList.add("open");
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function saveEdit() {
  const id = document.getElementById("editOverlay").dataset.id;
  const match_number = Number(document.getElementById("editNumber").value) || 1;
  const label = document.getElementById("editLabel").value.trim();
  const map = document.getElementById("editMap").value.trim();
  const mode = document.getElementById("editMode").value.trim() || "Squad";
  const timeVal = document.getElementById("editTime").value;
  const scheduled_time = timeVal ? new Date(timeVal).toISOString() : null;
  const status = document.getElementById("editStatus").value;

  if (!label) return toast("Label is required", true);

  if (id) {
    const { error } = await window.db.from("matches").update({ match_number, label, map, mode, scheduled_time, status }).eq("id", id);
    if (error) return toast(error.message, true);
    await logAudit("Edited Match", id, { label });
    toast("Match updated");
  } else {
    const { data, error } = await window.db.from("matches").insert([{
      tournament_id: ACTIVE_TOURNAMENT_ID, match_number, label, map, mode, scheduled_time, status,
    }]).select().single();
    if (error) return toast(error.message, true);
    await logAudit("Created Match", data.id, { label });
    toast("Match created");
  }
  document.getElementById("editOverlay").classList.remove("open");
  await loadMatches();
}

async function openScores(match) {
  document.getElementById("scoresTitle").textContent = `Scores — ${match.label}`;
  document.getElementById("scoresOverlay").dataset.matchId = match.id;

  const { data: existing } = await window.db.from("scores").select("*").eq("match_id", match.id);
  const scoreMap = {};
  (existing || []).forEach((s) => { scoreMap[s.team_id] = s; });

  const wrap = document.getElementById("scoresTableWrap");
  wrap.innerHTML = `
    <table class="score-table">
      <thead><tr><th>Team</th><th>Kills</th><th>Placement Pts</th></tr></thead>
      <tbody>
        ${ALL_TEAMS.map((t) => `
          <tr data-team-id="${t.id}">
            <td>${escapeHtml(t.team_name)}</td>
            <td><input type="number" min="0" class="kills-input" value="${scoreMap[t.id]?.kills ?? 0}" /></td>
            <td><input type="number" min="0" class="placement-input" value="${scoreMap[t.id]?.placement_points ?? 0}" /></td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  document.getElementById("scoresOverlay").classList.add("open");
}

async function saveScores() {
  const matchId = document.getElementById("scoresOverlay").dataset.matchId;
  const match = ALL_MATCHES.find((m) => m.id === matchId);
  const rows = Array.from(document.querySelectorAll("#scoresTableWrap tr[data-team-id]"));

  const upserts = rows.map((row) => ({
    match_id: matchId,
    team_id: row.dataset.teamId,
    kills: Number(row.querySelector(".kills-input").value) || 0,
    placement_points: Number(row.querySelector(".placement-input").value) || 0,
  }));

  const { error } = await window.db.from("scores").upsert(upserts, { onConflict: "match_id,team_id" });
  if (error) return toast(error.message, true);

  await window.db.from("matches").update({ status: "completed" }).eq("id", matchId);
  await recalcLeaderboard();

  await logAudit("Published Match Results", matchId, { label: match?.label, teams: upserts.length });
  toast(`Results published for ${match?.label || "match"} — leaderboard updated`);
  document.getElementById("scoresOverlay").classList.remove("open");
  await loadMatches();
}

// Recompute every team's aggregate leaderboard row from raw scores, then re-rank.
async function recalcLeaderboard() {
  if (!ACTIVE_TOURNAMENT_ID) return;

  const { data: allScores } = await window.db
    .from("scores")
    .select("team_id, kills, placement_points, matches(tournament_id)")
    .eq("matches.tournament_id", ACTIVE_TOURNAMENT_ID);

  const totals = {};
  (allScores || []).forEach((s) => {
    if (!s.matches) return; // filtered join miss
    if (!totals[s.team_id]) totals[s.team_id] = { kills: 0, placement_points: 0, matches_played: 0 };
    totals[s.team_id].kills += s.kills || 0;
    totals[s.team_id].placement_points += s.placement_points || 0;
    totals[s.team_id].matches_played += 1;
  });

  const rows = Object.entries(totals).map(([team_id, t]) => ({
    tournament_id: ACTIVE_TOURNAMENT_ID,
    team_id,
    kills: t.kills,
    placement_points: t.placement_points,
    matches_played: t.matches_played,
    total_points: t.kills + t.placement_points,
  }));

  if (rows.length === 0) return;

  // Preserve existing is_published flags
  const { data: existingLb } = await window.db.from("leaderboard").select("team_id, is_published").eq("tournament_id", ACTIVE_TOURNAMENT_ID);
  const publishedMap = {};
  (existingLb || []).forEach((r) => { publishedMap[r.team_id] = r.is_published; });
  rows.forEach((r) => { r.is_published = publishedMap[r.team_id] ?? false; });

  rows.sort((a, b) => b.total_points - a.total_points);
  rows.forEach((r, i) => { r.rank = i + 1; });

  await window.db.from("leaderboard").upsert(rows, { onConflict: "tournament_id,team_id" });
}

function subscribeRealtime() {
  window.db
    .channel("matches_live")
    .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => loadMatches())
    .subscribe();
}

init();
