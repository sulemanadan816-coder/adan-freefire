let ADMIN_PROFILE = null;
let ACTIVE_TOURNAMENT_ID = null;
let ALL_TEAMS = [];
let PLAYER_COUNTS = {}; // team_id -> count
let FILTERED = [];
let PAGE = 1;
const PAGE_SIZE = 10;

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

  document.getElementById("searchInput").addEventListener("input", () => { PAGE = 1; applyFilters(); });
  document.getElementById("statusFilter").addEventListener("change", () => { PAGE = 1; applyFilters(); });
  document.getElementById("prevBtn").addEventListener("click", () => { if (PAGE > 1) { PAGE--; render(); } });
  document.getElementById("nextBtn").addEventListener("click", () => {
    const maxPage = Math.max(1, Math.ceil(FILTERED.length / PAGE_SIZE));
    if (PAGE < maxPage) { PAGE++; render(); }
  });

  document.getElementById("addTeamBtn").addEventListener("click", () => openEdit(null));
  document.getElementById("editCancel").addEventListener("click", closeEdit);
  document.getElementById("editSave").addEventListener("click", saveEdit);

  document.getElementById("mergeBtn").addEventListener("click", openMerge);
  document.getElementById("mergeCancel").addEventListener("click", () => document.getElementById("mergeOverlay").classList.remove("open"));
  document.getElementById("mergeConfirm").addEventListener("click", doMerge);

  await loadTeams();
  subscribeRealtime();
}

async function loadTeams() {
  const wrap = document.getElementById("tableWrap");
  wrap.innerHTML = `<div class="admin-loading">Loading…</div>`;

  let query = window.db.from("teams").select("*").order("created_at", { ascending: false });
  if (ACTIVE_TOURNAMENT_ID) query = query.eq("tournament_id", ACTIVE_TOURNAMENT_ID);
  const { data, error } = await query;

  if (error) {
    wrap.innerHTML = `<div style="color:var(--danger);">Failed to load teams: ${escapeHtml(error.message)}</div>`;
    return;
  }

  ALL_TEAMS = data || [];

  const { data: playerRows } = await window.db.from("players").select("team_id");
  PLAYER_COUNTS = {};
  (playerRows || []).forEach((p) => { PLAYER_COUNTS[p.team_id] = (PLAYER_COUNTS[p.team_id] || 0) + 1; });

  applyFilters();
}

function applyFilters() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;

  let rows = [...ALL_TEAMS];
  if (status) rows = rows.filter((t) => t.status === status);
  if (q) {
    rows = rows.filter((t) =>
      t.team_name.toLowerCase().includes(q) || t.captain_name.toLowerCase().includes(q)
    );
  }
  FILTERED = rows;
  render();
}

function render() {
  const wrap = document.getElementById("tableWrap");
  const pager = document.getElementById("pager");

  if (FILTERED.length === 0) {
    wrap.innerHTML = `<div style="padding:30px 0; text-align:center; color:var(--text-3);">No teams match your filters.</div>`;
    pager.style.display = "none";
    return;
  }

  const maxPage = Math.max(1, Math.ceil(FILTERED.length / PAGE_SIZE));
  if (PAGE > maxPage) PAGE = maxPage;
  const start = (PAGE - 1) * PAGE_SIZE;
  const pageRows = FILTERED.slice(start, start + PAGE_SIZE);

  wrap.innerHTML = `
    <table class="reg-table">
      <thead>
        <tr><th>Team</th><th>Captain</th><th>Players</th><th>Status</th><th>Created</th><th></th></tr>
      </thead>
      <tbody>
        ${pageRows.map((t) => `
          <tr>
            <td><strong>${escapeHtml(t.team_name)}</strong></td>
            <td>${escapeHtml(t.captain_name)}</td>
            <td>${PLAYER_COUNTS[t.id] || 0}</td>
            <td><span class="badge badge-${t.status}">${t.status}</span></td>
            <td>${new Date(t.created_at).toLocaleDateString()}</td>
            <td>
              <div class="row-actions">
                <button data-act="edit" data-id="${t.id}">Edit</button>
                ${t.status !== "approved" ? `<button data-act="approve" data-id="${t.id}">Approve</button>` : ""}
                ${t.status !== "rejected" ? `<button data-act="reject" data-id="${t.id}">Reject</button>` : ""}
                ${t.status !== "disqualified" ? `<button class="warn" data-act="dq" data-id="${t.id}">Disqualify</button>` : ""}
                <button class="danger" data-act="delete" data-id="${t.id}">Delete</button>
              </div>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  wrap.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => handleAction(btn.dataset.act, btn.dataset.id));
  });

  pager.style.display = "flex";
  document.getElementById("pageLabel").textContent = `Page ${PAGE} of ${maxPage} · ${FILTERED.length} teams`;
  document.getElementById("prevBtn").disabled = PAGE <= 1;
  document.getElementById("nextBtn").disabled = PAGE >= maxPage;
}

async function handleAction(act, id) {
  const team = ALL_TEAMS.find((t) => t.id === id);
  if (!team) return;

  if (act === "edit") return openEdit(team);

  if (act === "delete") {
    const ok = await confirmDialog("Delete team?", `${team.team_name} and all its players will be permanently deleted.`);
    if (!ok) return;
    const { error } = await window.db.from("teams").delete().eq("id", id);
    if (error) return toast(error.message, true);
    await logAudit("Deleted Team", id, { team_name: team.team_name });
    toast("Team deleted");
    await loadTeams();
    return;
  }

  const statusMap = { approve: "approved", reject: "rejected", dq: "disqualified" };
  if (statusMap[act]) {
    const newStatus = statusMap[act];
    const ok = await confirmDialog(`Mark as ${newStatus}?`, `${team.team_name} will be set to "${newStatus}".`);
    if (!ok) return;
    const { error } = await window.db.from("teams").update({ status: newStatus }).eq("id", id);
    if (error) return toast(error.message, true);
    await logAudit(`Team status → ${newStatus}`, id, { team_name: team.team_name });
    toast(`Team marked ${newStatus}`);
    await loadTeams();
  }
}

function openEdit(team) {
  document.getElementById("editTitle").textContent = team ? "Edit Team" : "Add Team";
  document.getElementById("editTeamName").value = team ? team.team_name : "";
  document.getElementById("editCaptainName").value = team ? team.captain_name : "";
  document.getElementById("editStatus").value = team ? team.status : "approved";
  document.getElementById("editOverlay").dataset.id = team ? team.id : "";
  document.getElementById("editOverlay").classList.add("open");
}

function closeEdit() {
  document.getElementById("editOverlay").classList.remove("open");
}

async function saveEdit() {
  const id = document.getElementById("editOverlay").dataset.id;
  const team_name = document.getElementById("editTeamName").value.trim();
  const captain_name = document.getElementById("editCaptainName").value.trim();
  const status = document.getElementById("editStatus").value;

  if (!team_name || !captain_name) return toast("Team name and captain name are required", true);

  if (id) {
    const { error } = await window.db.from("teams").update({ team_name, captain_name, status }).eq("id", id);
    if (error) return toast(error.message, true);
    await logAudit("Edited Team", id, { team_name, captain_name, status });
    toast("Team updated");
  } else {
    const { data, error } = await window.db.from("teams").insert([{
      tournament_id: ACTIVE_TOURNAMENT_ID, team_name, captain_name, status,
    }]).select().single();
    if (error) return toast(error.message, true);
    await logAudit("Created Team", data.id, { team_name, captain_name, status });
    toast("Team created");
  }
  closeEdit();
  await loadTeams();
}

function openMerge() {
  const options = ALL_TEAMS.map((t) => `<option value="${t.id}">${escapeHtml(t.team_name)}</option>`).join("");
  document.getElementById("mergeSource").innerHTML = options;
  document.getElementById("mergeTarget").innerHTML = options;
  document.getElementById("mergeOverlay").classList.add("open");
}

async function doMerge() {
  const sourceId = document.getElementById("mergeSource").value;
  const targetId = document.getElementById("mergeTarget").value;
  if (!sourceId || !targetId || sourceId === targetId) return toast("Choose two different teams", true);

  const source = ALL_TEAMS.find((t) => t.id === sourceId);
  const target = ALL_TEAMS.find((t) => t.id === targetId);
  const ok = await confirmDialog("Merge teams?", `All players from "${source.team_name}" will move to "${target.team_name}", then "${source.team_name}" will be deleted.`);
  if (!ok) return;

  const { error: moveErr } = await window.db.from("players").update({ team_id: targetId }).eq("team_id", sourceId);
  if (moveErr) return toast(moveErr.message, true);

  const { error: delErr } = await window.db.from("teams").delete().eq("id", sourceId);
  if (delErr) return toast(delErr.message, true);

  await logAudit("Merged Teams", targetId, { from: source.team_name, into: target.team_name });
  toast(`Merged "${source.team_name}" into "${target.team_name}"`);
  document.getElementById("mergeOverlay").classList.remove("open");
  await loadTeams();
}

function subscribeRealtime() {
  window.db
    .channel("teams_live")
    .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => loadTeams())
    .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => loadTeams())
    .subscribe();
}

init();
