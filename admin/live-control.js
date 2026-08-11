let PROFILE = null;
let TOURNAMENT = null;
let ROOM = null;

function toast(msg, isErr) {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add("leaving"); setTimeout(() => el.remove(), 300); }, 3200);
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

const WA_TEMPLATES = {
  registration_open: (t) => `🔥 Registration is now OPEN for ${t.name}!\n\nEntry Fee: ${t.is_free_entry ? "FREE" : "PKR " + t.entry_fee}\nSlots: ${t.total_team_slots} teams\n\nRegister now: ${SITE_URL}\n\nGood luck! 🎮`,
  registration_closed: (t) => `📢 Registration for ${t.name} is now CLOSED.\n\nThanks to everyone who signed up! Check-in details coming soon.`,
  room_published: (t) => `🔓 Room Details for ${t.name} are LIVE now!\n\nCheck the website: ${SITE_URL}\n\nJoin promptly — room closes a few minutes after release.`,
  tournament_live: (t) => `🔴 ${t.name} is LIVE right now!\n\nWatch here: ${SITE_URL}\n\nDon't miss it!`,
  results_published: (t) => `🏆 Final results for ${t.name} are out!\n\nCheck the leaderboard: ${SITE_URL}\n\nCongratulations to our winners! 🎉`,
};
const SITE_URL = (typeof CONFIG !== "undefined" && CONFIG.share && CONFIG.share.url) || "https://your-tournament-site.com";

async function init() {
  PROFILE = await requireAdmin();
  if (!PROFILE) return;
  document.getElementById("adminUserLabel").textContent = `${PROFILE.email} · ${PROFILE.role.toUpperCase()}`;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    logAudit("Admin Logout", PROFILE.id, null).finally(adminLogout);
  });

  const { data: tournament } = await window.db.from("tournaments").select("*").eq("is_active", true).single();
  TOURNAMENT = tournament;
  if (!TOURNAMENT) {
    document.getElementById("content").innerHTML = `<div class="admin-panel">No active tournament found.</div>`;
    return;
  }

  const { data: room } = await window.db
    .from("room_details").select("*").eq("tournament_id", TOURNAMENT.id)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  ROOM = room || { room_id: "", room_password: "", map: "", is_published: false };

  render();
}

function render() {
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="settings-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div class="admin-panel">
        <h2>Tournament Status</h2>
        <p style="color:var(--text-3); font-size:12.5px; margin-bottom:14px;">Controls the LIVE badge and status shown across the public site.</p>
        <div class="status-row" id="statusRow">
          ${["upcoming","live","completed","cancelled"].map(s => `<button data-status="${s}" class="${TOURNAMENT.status === s ? "current" : ""}">${s.toUpperCase()}</button>`).join("")}
        </div>
        <p style="color:var(--text-3); font-size:12px;">Current: <strong style="color:var(--text-1);">${TOURNAMENT.status.toUpperCase()}</strong></p>
      </div>

      <div class="admin-panel">
        <h2>Room Control</h2>
        <div class="room-pub-status ${ROOM.is_published ? "on" : "off"}" id="roomPubStatus">
          ${ROOM.is_published ? "● Published — visible on public site" : "● Hidden from public site"}
        </div>
        <div class="login-field"><label>Room ID</label><input id="fRoomId" value="${escapeHtml(ROOM.room_id || "")}" /></div>
        <div class="login-field" style="margin-top:10px;"><label>Password</label><input id="fRoomPass" value="${escapeHtml(ROOM.room_password || "")}" /></div>
        <div class="login-field" style="margin-top:10px;"><label>Map</label><input id="fRoomMap" value="${escapeHtml(ROOM.map || "")}" /></div>
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button class="btn btn-secondary" id="saveRoomBtn" style="flex:1;">Save Details</button>
          <button class="btn btn-primary" id="togglePublishBtn" style="flex:1;">${ROOM.is_published ? "Hide Room" : "Publish Room"}</button>
        </div>
      </div>
    </div>

    <div class="admin-panel" style="margin-top:20px;">
      <h2>WhatsApp Announcement</h2>
      <p style="color:var(--text-3); font-size:12.5px; margin-bottom:14px;">
        Pick an event, review the prepared message, then click Send — it opens WhatsApp with the message ready, you just choose your community/group and hit send.
        (WhatsApp doesn't allow fully automatic group posting without the official Business API — this is the closest one-click legal option.)
      </p>
      <div class="status-row" id="waTemplateRow">
        <button data-tpl="registration_open">Registration Open</button>
        <button data-tpl="registration_closed">Registration Closed</button>
        <button data-tpl="room_published">Room Published</button>
        <button data-tpl="tournament_live">Tournament Live</button>
        <button data-tpl="results_published">Results Published</button>
      </div>
      <textarea id="waPreview" class="wa-preview" style="width:100%; min-height:120px; background:var(--bg-panel-2); border:1px solid var(--border); border-radius:8px; color:var(--text-2); padding:14px; font-family:var(--f-mono); font-size:13px;" placeholder="Pick an event above to generate a message, or write your own here."></textarea>
      <button class="btn wa-btn" id="sendWaBtn" style="margin-top:10px;">💬 Open WhatsApp to Send</button>
    </div>
  `;

  document.getElementById("statusRow").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-status]");
    if (!btn) return;
    const status = btn.getAttribute("data-status");
    const { error } = await window.db.from("tournaments").update({ status, updated_at: new Date().toISOString() }).eq("id", TOURNAMENT.id);
    if (error) { toast("Failed to update status.", true); return; }
    TOURNAMENT.status = status;
    await logAudit("Tournament Status Changed", TOURNAMENT.id, { status });
    toast(`Tournament status set to ${status.toUpperCase()}.`);
    render();
  });

  document.getElementById("saveRoomBtn").addEventListener("click", async () => {
    await saveRoom(ROOM.is_published);
  });

  document.getElementById("togglePublishBtn").addEventListener("click", async () => {
    await saveRoom(!ROOM.is_published);
  });

  document.getElementById("waTemplateRow").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tpl]");
    if (!btn) return;
    const tpl = WA_TEMPLATES[btn.getAttribute("data-tpl")];
    document.getElementById("waPreview").value = tpl(TOURNAMENT);
  });

  document.getElementById("sendWaBtn").addEventListener("click", async () => {
    const text = document.getElementById("waPreview").value.trim();
    if (!text) { toast("Write or pick a message first.", true); return; }
    await logAudit("WhatsApp Announcement Prepared", TOURNAMENT.id, { text });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  });
}

async function saveRoom(publish) {
  const payload = {
    tournament_id: TOURNAMENT.id,
    room_id: document.getElementById("fRoomId").value.trim(),
    room_password: document.getElementById("fRoomPass").value.trim(),
    map: document.getElementById("fRoomMap").value.trim(),
    is_published: publish,
    updated_at: new Date().toISOString(),
  };
  const { error } = ROOM.id
    ? await window.db.from("room_details").update(payload).eq("id", ROOM.id)
    : await window.db.from("room_details").insert([payload]).select().single().then(r => { if (r.data) ROOM.id = r.data.id; return r; });

  if (error) { toast("Failed to save room.", true); return; }
  ROOM = { ...ROOM, ...payload };
  await logAudit(publish ? "Room Published" : "Room Hidden", TOURNAMENT.id, payload);
  toast(publish ? "Room published — now visible on public site." : "Room hidden from public site.");
  render();
}

init();
