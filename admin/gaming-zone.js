let PROFILE = null;
let TOURNAMENT = null;
let FEATURES = null;

const GAME_LIST = [
  { id: "snake", label: "Snake" },
  { id: "flappy", label: "Flappy-style Game" },
  { id: "reaction", label: "Reaction Test" },
  { id: "aim", label: "Aim/Reflex Test" },
  { id: "memory", label: "Memory Cards" },
  { id: "tictactoe", label: "Tic-Tac-Toe" },
  { id: "number", label: "Number Challenge" },
  { id: "quicktap", label: "Quick Tap Challenge" },
  { id: "duckhunt", label: "Duck Hunt" },
  { id: "spaceshooter", label: "Space Shooter" },
  { id: "tank", label: "Tank Battle" },
];

function toast(msg, isErr) {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add("leaving"); setTimeout(() => el.remove(), 300); }, 3200);
}

function switchHtml(id, checked) {
  return `<label class="switch"><input type="checkbox" id="${id}" ${checked ? "checked" : ""}><span class="slider"></span></label>`;
}

async function loadAll() {
  const { data: tournament } = await window.db.from("tournaments").select("*").eq("is_active", true).single();
  TOURNAMENT = tournament;
  if (!TOURNAMENT || !TOURNAMENT.organization_id) return;

  const { data: features } = await window.db
    .from("gaming_features")
    .select("*")
    .eq("organization_id", TOURNAMENT.organization_id)
    .maybeSingle();

  FEATURES = features || {
    organization_id: TOURNAMENT.organization_id,
    gaming_zone_enabled: false,
    youtube_required: true,
    youtube_channel_id: "",
    youtube_channel_url: "",
    games_enabled: { snake: true, flappy: true, reaction: true, aim: true, memory: true, tictactoe: true, number: true, quicktap: true },
    sensitivity_finder_enabled: true,
    aim_trainer_enabled: true,
    tips_enabled: true,
  };
}

function render() {
  const content = document.getElementById("gzContent");

  if (!TOURNAMENT) {
    content.innerHTML = `<div class="admin-panel">No active tournament found in the database.</div>`;
    return;
  }
  if (!TOURNAMENT.organization_id) {
    content.innerHTML = `<div class="admin-panel">
      <h2>Gaming Zone</h2>
      <p style="color:var(--text-3); font-size:12.5px;">
        This needs <code>migration_saas_foundation.sql</code> to have been run
        (it's what adds <code>tournaments.organization_id</code>). Run it once
        in the Supabase SQL editor, then reload this page.
      </p></div>`;
    return;
  }

  const games = FEATURES.games_enabled || {};

  content.innerHTML = `
    <div class="settings-grid">
      <div class="admin-panel">
        <h2>Gaming Zone</h2>
        <div class="toggle-row">
          <span class="label">Gaming Zone<span class="hint">Master switch — turns the whole public section on/off.</span></span>
          ${switchHtml("fGzEnabled", FEATURES.gaming_zone_enabled)}
        </div>
        <div class="toggle-row">
          <span class="label">Require YouTube Subscription<span class="hint">If off, games unlock for everyone with no verification.</span></span>
          ${switchHtml("fYtRequired", FEATURES.youtube_required)}
        </div>
        <div class="login-field" style="margin-top:14px;">
          <label>YouTube Channel ID <span style="color:var(--text-3); font-weight:400;">(starts with "UC…" — required for real verification)</span></label>
          <input type="text" id="fYtChannelId" placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" value="${FEATURES.youtube_channel_id ? escapeHtml(FEATURES.youtube_channel_id) : ""}" />
        </div>
        <div class="login-field">
          <label>Subscribe Button Link <span style="color:var(--text-3); font-weight:400;">(optional — falls back to your Tournament Settings YouTube URL)</span></label>
          <input type="text" id="fYtChannelUrl" placeholder="https://youtube.com/@yourchannel" value="${FEATURES.youtube_channel_url ? escapeHtml(FEATURES.youtube_channel_url) : ""}" />
        </div>
        <p style="color:var(--text-3); font-size:11.5px;">Don't know your Channel ID? Open your channel on desktop YouTube → About → Share channel → Copy channel ID.</p>
      </div>

      <div class="admin-panel">
        <h2>Other Sections</h2>
        <div class="toggle-row">
          <span class="label">Sensitivity Finder</span>
          ${switchHtml("fSensEnabled", FEATURES.sensitivity_finder_enabled)}
        </div>
        <div class="toggle-row">
          <span class="label">Aim Trainer<span class="hint">Standalone — not YouTube-gated.</span></span>
          ${switchHtml("fAimEnabled", FEATURES.aim_trainer_enabled)}
        </div>
        <div class="toggle-row">
          <span class="label">Free Fire Tips &amp; Tricks</span>
          ${switchHtml("fTipsEnabled", FEATURES.tips_enabled)}
        </div>
      </div>
    </div>

    <div class="admin-panel">
      <h2>Available Games</h2>
      <div class="games-toggle-grid">
        ${GAME_LIST.map((g) => `
          <div class="toggle-row">
            <span class="label">${escapeHtml(g.label)}</span>
            ${switchHtml("fGame_" + g.id, games[g.id] !== false)}
          </div>`).join("")}
      </div>
    </div>

    <div class="setup-note">
      Real YouTube verification also needs the <code>youtube-verify</code> Edge Function deployed with your Google OAuth credentials, and the same Client ID + function URL set at the top of <code>js/gaming-zone.js</code>. See that function's file header for the full walkthrough. Until that's done, "Require YouTube Subscription" stays effectively locked for everyone — it never fakes a pass.
    </div>

    <div class="save-row"><button class="btn btn-primary" id="saveGzBtn">Save Gaming Zone Settings</button></div>
  `;

  document.getElementById("saveGzBtn").addEventListener("click", saveSettings);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

async function saveSettings() {
  const btn = document.getElementById("saveGzBtn");
  btn.disabled = true;

  const gamesEnabled = {};
  GAME_LIST.forEach((g) => { gamesEnabled[g.id] = document.getElementById("fGame_" + g.id).checked; });

  const payload = {
    organization_id: TOURNAMENT.organization_id,
    gaming_zone_enabled: document.getElementById("fGzEnabled").checked,
    youtube_required: document.getElementById("fYtRequired").checked,
    youtube_channel_id: document.getElementById("fYtChannelId").value.trim(),
    youtube_channel_url: document.getElementById("fYtChannelUrl").value.trim(),
    games_enabled: gamesEnabled,
    sensitivity_finder_enabled: document.getElementById("fSensEnabled").checked,
    aim_trainer_enabled: document.getElementById("fAimEnabled").checked,
    tips_enabled: document.getElementById("fTipsEnabled").checked,
    updated_at: new Date().toISOString(),
  };

  const { error } = FEATURES.id
    ? await window.db.from("gaming_features").update(payload).eq("id", FEATURES.id)
    : await window.db.from("gaming_features").insert([payload]);

  btn.disabled = false;
  if (error) { toast("Failed to save.", true); console.error(error); return; }

  await logAudit("Gaming Zone Settings Updated", TOURNAMENT.id, { action: "gaming_features_saved" });
  toast("Gaming Zone settings saved.");
  await loadAll();
  render();
}

async function init() {
  PROFILE = await requireAdmin();
  if (!PROFILE) return;

  document.getElementById("adminUserLabel").textContent = `${PROFILE.email} · ${PROFILE.role.toUpperCase()}`;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    logAudit("Admin Logout", PROFILE.id, null).finally(adminLogout);
  });

  await loadAll();
  render();
}

init();
