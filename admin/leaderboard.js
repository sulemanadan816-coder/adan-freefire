let ADMIN_PROFILE = null;
let ACTIVE_TOURNAMENT_ID = null;
let ROWS = []; // leaderboard rows joined with team_name
let ALL_TEAMS = [];
let LAST_LOCAL_EDIT_AT = 0; // suppress realtime self-echo flash right after our own save

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

  document.getElementById("addRowBtn").addEventListener("click", openAdd);
  document.getElementById("addCancel").addEventListener("click", () => document.getElementById("addOverlay").classList.remove("open"));
  document.getElementById("addConfirm").addEventListener("click", confirmAdd);
  document.getElementById("publishAllBtn").addEventListener("click", publishAll);

  await loadBoard();
  subscribeRealtime();
}

async function loadBoard() {
  const wrap = document.getElementById("tableWrap");
  wrap.innerHTML = `<div class="admin-loading">Loading…</div>`;

  const [{ data: lb, error }, { data: teams }] = await Promise.all([
    window.db.from("leaderboard").select("*").eq("tournament_id", ACTIVE_TOURNAMENT_ID).order("rank", { ascending: true }),
    window.db.from("teams").select("id, team_name").eq("status", "approved").order("team_name"),
  ]);

  if (error) { wrap.innerHTML = `<div style="color:var(--danger);">${escapeHtml(error.message)}</div>`; return; }

  ALL_TEAMS = teams || [];
  const teamMap = {};
  ALL_TEAMS.forEach((t) => { teamMap[t.id] = t.team_name; });

  ROWS = (lb || []).map((r) => ({ ...r, team_name: teamMap[r.team_id] || "Unknown team" }));
  render();
}

function render() {
  const wrap = document.getElementById("tableWrap");
  if (ROWS.length === 0) {
    wrap.innerHTML = `<div style="padding:30px 0; text-align:center; color:var(--text-3);">No teams on the leaderboard yet. Add one, or publish match results to populate it automatically.</div>`;
    return;
  }

  const sorted = [...ROWS].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  wrap.innerHTML = `
    <table class="reg-table">
      <thead>
        <tr><th>Rank</th><th>Team</th><th>Matches</th><th>Kills</th><th>Placement Pts</th><th>Total</th><th>Published</th><th></th></tr>
      </thead>
      <tbody>
        ${sorted.map((r) => `
          <tr data-id="${r.id}">
            <td class="rank-cell ${r.rank === 1 ? "top1" : r.rank === 2 ? "top2" : r.rank === 3 ? "top3" : ""}">#${r.rank ?? "—"}</td>
            <td><strong>${escapeHtml(r.team_name)}</strong></td>
            <td>${r.matches_played || 0}</td>
            <td><input type="number" min="0" class="num-input kills-input" value="${r.kills || 0}" /></td>
            <td><input type="number" min="0" class="num-input placement-input" value="${r.placement_points || 0}" /></td>
            <td style="font-family:var(--f-mono); font-weight:700;">${r.total_points || 0}</td>
            <td>
              <span class="pub-toggle" data-act="togglepub" data-id="${r.id}">
                <span class="pub-dot ${r.is_published ? "on" : ""}"></span> ${r.is_published ? "Live" : "Hidden"}
              </span>
            </td>
            <td>
              <div class="row-actions">
                <button data-act="save" data-id="${r.id}">Save</button>
                <button class="danger" data-act="remove" data-id="${r.id}">Remove</button>
              </div>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  wrap.querySelectorAll("button[data-act='save']").forEach((btn) => {
    btn.addEventListener("click", () => saveRow(btn.dataset.id));
  });
  wrap.querySelectorAll("button[data-act='remove']").forEach((btn) => {
    btn.addEventListener("click", () => removeRow(btn.dataset.id));
  });
  wrap.querySelectorAll("[data-act='togglepub']").forEach((el) => {
    el.addEventListener("click", () => togglePublish(el.dataset.id));
  });
}

async function saveRow(id) {
  const row = ROWS.find((r) => r.id === id);
  if (!row) return;
  const tr = document.querySelector(`tr[data-id="${id}"]`);
  const kills = Number(tr.querySelector(".kills-input").value) || 0;
  const placement_points = Number(tr.querySelector(".placement-input").value) || 0;
  const total_points = kills + placement_points;

  const { error } = await window.db.from("leaderboard").update({ kills, placement_points, total_points }).eq("id", id);
  if (error) return toast(error.message, true);

  await logAudit("Edited Leaderboard", id, { team: row.team_name, kills, placement_points, total_points });
  LAST_LOCAL_EDIT_AT = Date.now();
  await reRank();
  toast(`${row.team_name} updated — leaderboard reordered`);
}

async function reRank() {
  const { data: lb } = await window.db.from("leaderboard").select("id, total_points").eq("tournament_id", ACTIVE_TOURNAMENT_ID);
  const sorted = [...(lb || [])].sort((a, b) => b.total_points - a.total_points);
  const updates = sorted.map((r, i) => ({ id: r.id, rank: i + 1 }));
  for (const u of updates) {
    await window.db.from("leaderboard").update({ rank: u.rank }).eq("id", u.id);
  }
  await loadBoard();
}

async function togglePublish(id) {
  const row = ROWS.find((r) => r.id === id);
  if (!row) return;
  const newVal = !row.is_published;
  const { error } = await window.db.from("leaderboard").update({ is_published: newVal }).eq("id", id);
  if (error) return toast(error.message, true);
  await logAudit(newVal ? "Published Leaderboard Row" : "Hid Leaderboard Row", id, { team: row.team_name });
  toast(`${row.team_name} is now ${newVal ? "visible" : "hidden"} on the public site`);
  LAST_LOCAL_EDIT_AT = Date.now();
  await loadBoard();
}

async function publishAll() {
  const ok = await confirmDialog("Publish entire leaderboard?", "Every team currently on this leaderboard will become visible on the public site.");
  if (!ok) return;
  const { error } = await window.db.from("leaderboard").update({ is_published: true }).eq("tournament_id", ACTIVE_TOURNAMENT_ID);
  if (error) return toast(error.message, true);
  await logAudit("Published Full Leaderboard", ACTIVE_TOURNAMENT_ID, { count: ROWS.length });
  toast("Leaderboard published");
  LAST_LOCAL_EDIT_AT = Date.now();
  await loadBoard();
}

async function removeRow(id) {
  const row = ROWS.find((r) => r.id === id);
  const ok = await confirmDialog("Remove from leaderboard?", `${row.team_name} will be removed from the leaderboard (the team itself is not deleted).`);
  if (!ok) return;
  const { error } = await window.db.from("leaderboard").delete().eq("id", id);
  if (error) return toast(error.message, true);
  await logAudit("Removed Leaderboard Row", id, { team: row.team_name });
  toast(`${row.team_name} removed from leaderboard`);
  LAST_LOCAL_EDIT_AT = Date.now();
  await reRank();
}

function openAdd() {
  const existingTeamIds = new Set(ROWS.map((r) => r.team_id));
  const available = ALL_TEAMS.filter((t) => !existingTeamIds.has(t.id));
  if (available.length === 0) return toast("Every approved team is already on the leaderboard", true);
  document.getElementById("addTeamSelect").innerHTML = available.map((t) => `<option value="${t.id}">${escapeHtml(t.team_name)}</option>`).join("");
  document.getElementById("addOverlay").classList.add("open");
}

async function confirmAdd() {
  const teamId = document.getElementById("addTeamSelect").value;
  const team = ALL_TEAMS.find((t) => t.id === teamId);
  const { data, error } = await window.db.from("leaderboard").insert([{
    tournament_id: ACTIVE_TOURNAMENT_ID, team_id: teamId, matches_played: 0, kills: 0, placement_points: 0, total_points: 0, is_published: false,
  }]).select().single();
  if (error) return toast(error.message, true);
  await logAudit("Added Team to Leaderboard", data.id, { team: team.team_name });
  toast(`${team.team_name} added to leaderboard`);
  document.getElementById("addOverlay").classList.remove("open");
  LAST_LOCAL_EDIT_AT = Date.now();
  await reRank();
}

function subscribeRealtime() {
  window.db
    .channel("leaderboard_live")
    .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard" }, async () => {
      await loadBoard();
      // Skip the flash right after our own edit — it already has visible feedback via toast
      if (Date.now() - LAST_LOCAL_EDIT_AT > 800) {
        document.querySelectorAll(".reg-table tbody tr").forEach((tr) => tr.classList.add("row-flash"));
      }
    })
    .subscribe();
}

init();
