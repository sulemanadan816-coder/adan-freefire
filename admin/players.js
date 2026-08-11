let ADMIN_PROFILE = null;
let ALL_PLAYERS = [];
let ALL_TEAMS = [];
let TEAM_MAP = {};
let FILTERED = [];
let PAGE = 1;
const PAGE_SIZE = 12;

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

  document.getElementById("searchInput").addEventListener("input", () => { PAGE = 1; applyFilters(); });
  document.getElementById("teamFilter").addEventListener("change", () => { PAGE = 1; applyFilters(); });
  document.getElementById("statusFilter").addEventListener("change", () => { PAGE = 1; applyFilters(); });
  document.getElementById("prevBtn").addEventListener("click", () => { if (PAGE > 1) { PAGE--; render(); } });
  document.getElementById("nextBtn").addEventListener("click", () => {
    const maxPage = Math.max(1, Math.ceil(FILTERED.length / PAGE_SIZE));
    if (PAGE < maxPage) { PAGE++; render(); }
  });
  document.getElementById("editCancel").addEventListener("click", () => document.getElementById("editOverlay").classList.remove("open"));
  document.getElementById("editSave").addEventListener("click", saveEdit);

  await loadData();
  subscribeRealtime();
}

async function loadData() {
  const wrap = document.getElementById("tableWrap");
  wrap.innerHTML = `<div class="admin-loading">Loading…</div>`;

  const [{ data: players, error: pErr }, { data: teams, error: tErr }] = await Promise.all([
    window.db.from("players").select("*").order("created_at", { ascending: false }),
    window.db.from("teams").select("id, team_name").order("team_name"),
  ]);

  if (pErr) { wrap.innerHTML = `<div style="color:var(--danger);">${escapeHtml(pErr.message)}</div>`; return; }
  if (tErr) { wrap.innerHTML = `<div style="color:var(--danger);">${escapeHtml(tErr.message)}</div>`; return; }

  ALL_PLAYERS = players || [];
  ALL_TEAMS = teams || [];
  TEAM_MAP = {};
  ALL_TEAMS.forEach((t) => { TEAM_MAP[t.id] = t.team_name; });

  const teamFilter = document.getElementById("teamFilter");
  const currentVal = teamFilter.value;
  teamFilter.innerHTML = `<option value="">All teams</option>` +
    ALL_TEAMS.map((t) => `<option value="${t.id}">${escapeHtml(t.team_name)}</option>`).join("");
  teamFilter.value = currentVal;

  applyFilters();
}

function applyFilters() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const team = document.getElementById("teamFilter").value;
  const status = document.getElementById("statusFilter").value;

  let rows = [...ALL_PLAYERS];
  if (team) rows = rows.filter((p) => p.team_id === team);
  if (status) rows = rows.filter((p) => p.status === status);
  if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q) || p.free_fire_uid.toLowerCase().includes(q));

  FILTERED = rows;
  render();
}

function render() {
  const wrap = document.getElementById("tableWrap");
  const pager = document.getElementById("pager");

  if (FILTERED.length === 0) {
    wrap.innerHTML = `<div style="padding:30px 0; text-align:center; color:var(--text-3);">No players match your filters.</div>`;
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
        <tr><th>Name</th><th>UID</th><th>Team</th><th>K / HS</th><th>Matches</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${pageRows.map((p) => `
          <tr>
            <td>${escapeHtml(p.name)}${p.is_captain ? '<span class="cap-star" title="Captain">★</span>' : ""}</td>
            <td style="font-family:var(--f-mono);">${escapeHtml(p.free_fire_uid)}</td>
            <td>${escapeHtml(TEAM_MAP[p.team_id] || "—")}</td>
            <td>${p.kills || 0} / ${p.headshots || 0}</td>
            <td>${p.matches_played || 0}</td>
            <td><span class="badge badge-${p.status}">${p.status}</span></td>
            <td>
              <div class="row-actions">
                <button data-act="edit" data-id="${p.id}">Edit</button>
                ${p.status === "banned"
                  ? `<button data-act="unban" data-id="${p.id}">Unban</button>`
                  : `<button data-act="ban" data-id="${p.id}">Ban</button>`}
                <button class="danger" data-act="remove" data-id="${p.id}">Remove</button>
              </div>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  wrap.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => handleAction(btn.dataset.act, btn.dataset.id));
  });

  pager.style.display = "flex";
  document.getElementById("pageLabel").textContent = `Page ${PAGE} of ${maxPage} · ${FILTERED.length} players`;
  document.getElementById("prevBtn").disabled = PAGE <= 1;
  document.getElementById("nextBtn").disabled = PAGE >= maxPage;
}

async function handleAction(act, id) {
  const player = ALL_PLAYERS.find((p) => p.id === id);
  if (!player) return;

  if (act === "edit") return openEdit(player);

  if (act === "remove") {
    const ok = await confirmDialog("Remove player?", `${player.name} will be permanently removed from ${TEAM_MAP[player.team_id] || "their team"}.`);
    if (!ok) return;
    const { error } = await window.db.from("players").delete().eq("id", id);
    if (error) return toast(error.message, true);
    await logAudit("Removed Player", id, { name: player.name });
    toast("Player removed");
    await loadData();
    return;
  }

  if (act === "ban" || act === "unban") {
    const newStatus = act === "ban" ? "banned" : "active";
    const { error } = await window.db.from("players").update({ status: newStatus }).eq("id", id);
    if (error) return toast(error.message, true);
    await logAudit(`Player ${act === "ban" ? "Banned" : "Unbanned"}`, id, { name: player.name });
    toast(`${player.name} ${act === "ban" ? "banned" : "unbanned"}`);
    await loadData();
  }
}

function openEdit(player) {
  document.getElementById("editOverlay").dataset.id = player.id;
  document.getElementById("editName").value = player.name;
  document.getElementById("editUid").value = player.free_fire_uid;
  document.getElementById("editTeam").innerHTML = ALL_TEAMS.map((t) =>
    `<option value="${t.id}" ${t.id === player.team_id ? "selected" : ""}>${escapeHtml(t.team_name)}</option>`
  ).join("");
  document.getElementById("editCaptain").checked = !!player.is_captain;
  document.getElementById("editKills").value = player.kills || 0;
  document.getElementById("editHeadshots").value = player.headshots || 0;
  document.getElementById("editMatches").value = player.matches_played || 0;
  document.getElementById("editStatus").value = player.status || "active";
  document.getElementById("editOverlay").classList.add("open");
}

async function saveEdit() {
  const id = document.getElementById("editOverlay").dataset.id;
  const name = document.getElementById("editName").value.trim();
  const free_fire_uid = document.getElementById("editUid").value.trim();
  const team_id = document.getElementById("editTeam").value;
  const is_captain = document.getElementById("editCaptain").checked;
  const kills = Number(document.getElementById("editKills").value) || 0;
  const headshots = Number(document.getElementById("editHeadshots").value) || 0;
  const matches_played = Number(document.getElementById("editMatches").value) || 0;
  const status = document.getElementById("editStatus").value;

  if (!name || !free_fire_uid) return toast("Name and UID are required", true);

  const player = ALL_PLAYERS.find((p) => p.id === id);
  const transferred = player && player.team_id !== team_id;

  // If setting this player as captain, unset any other captain on the same team first
  if (is_captain) {
    await window.db.from("players").update({ is_captain: false }).eq("team_id", team_id).neq("id", id);
  }

  const { error } = await window.db.from("players").update({
    name, free_fire_uid, team_id, is_captain, kills, headshots, matches_played, status,
  }).eq("id", id);

  if (error) return toast(error.message, true);
  await logAudit(transferred ? "Transferred Player" : "Edited Player", id, { name, team_id });
  toast(transferred ? `${name} transferred to ${TEAM_MAP[team_id]}` : "Player updated");
  document.getElementById("editOverlay").classList.remove("open");
  await loadData();
}

function subscribeRealtime() {
  window.db
    .channel("players_live")
    .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => loadData())
    .subscribe();
}

init();
