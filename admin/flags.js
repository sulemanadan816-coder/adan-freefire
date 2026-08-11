function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function badgeClass(status) { return `badge badge-${status}`; }

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function renderRegRow(r) {
  return `
    <div class="flag-row">
      <span>${escapeHtml(r.team_name)} — <span style="color:var(--text-3);">${escapeHtml(r.captain_name)}</span></span>
      <span><span class="${badgeClass(r.status)}">${r.status}</span> <span style="color:var(--text-3); font-family:var(--f-mono); font-size:11px; margin-left:8px;">${escapeHtml(r.registration_code)}</span></span>
    </div>`;
}

function renderGroup(label, value, regs) {
  return `
    <div class="flag-group">
      <div class="flag-group-header"><span>${escapeHtml(label)}: <span class="val">${escapeHtml(value)}</span></span><span>${regs.length} matches</span></div>
      <div class="flag-rows">${regs.map(renderRegRow).join("")}</div>
    </div>`;
}

async function init() {
  const profile = await requireAdmin();
  if (!profile) return;

  document.getElementById("adminUserLabel").textContent = `${profile.email} · ${profile.role.toUpperCase()}`;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    logAudit("Admin Logout", profile.id, null).finally(adminLogout);
  });

  const resultsEl = document.getElementById("results");

  const { data: regs, error } = await window.db.from("registrations").select("*").order("created_at", { ascending: true });
  if (error) {
    resultsEl.textContent = "Failed to load registrations.";
    console.error(error);
    return;
  }

  resultsEl.classList.remove("admin-loading");

  if (!regs || regs.length === 0) {
    resultsEl.innerHTML = `<div class="clean-state">No registrations yet — nothing to check.</div>`;
    return;
  }

  let html = "";

  // 1. Duplicate captain Free Fire UID
  const byUid = groupBy(regs, r => (r.captain_uid || "").trim());
  const dupUid = [...byUid.entries()].filter(([, v]) => v.length > 1);
  html += `<div class="flag-section-title">Duplicate Captain Free Fire UIDs</div>`;
  html += dupUid.length
    ? dupUid.map(([uid, v]) => renderGroup("UID", uid, v)).join("")
    : `<div class="clean-state">✓ No duplicate captain UIDs found.</div>`;

  // 2. Duplicate player UIDs (any player, across all teams, including captains)
  const playerUidMap = new Map();
  for (const r of regs) {
    const players = Array.isArray(r.players) ? r.players : [];
    const allUids = new Set([r.captain_uid, ...players.map(p => p.uid)].filter(Boolean).map(u => String(u).trim()));
    for (const uid of allUids) {
      if (!playerUidMap.has(uid)) playerUidMap.set(uid, new Set());
      playerUidMap.get(uid).add(r.id);
    }
  }
  const dupPlayerUid = [...playerUidMap.entries()].filter(([, regSet]) => regSet.size > 1);
  html += `<div class="flag-section-title">Player UIDs Appearing on Multiple Teams</div>`;
  if (dupPlayerUid.length) {
    html += dupPlayerUid.map(([uid, regSet]) => {
      const matchedRegs = regs.filter(r => regSet.has(r.id));
      return renderGroup("Free Fire UID", uid, matchedRegs);
    }).join("");
  } else {
    html += `<div class="clean-state">✓ No player UID appears on more than one team.</div>`;
  }

  // 3. Duplicate WhatsApp numbers
  const byWhatsapp = groupBy(regs, r => (r.whatsapp || "").replace(/[\s\-]/g, ""));
  const dupWhatsapp = [...byWhatsapp.entries()].filter(([, v]) => v.length > 1);
  html += `<div class="flag-section-title">Duplicate WhatsApp Numbers</div>`;
  html += dupWhatsapp.length
    ? dupWhatsapp.map(([num, v]) => renderGroup("WhatsApp", num, v)).join("")
    : `<div class="clean-state">✓ No duplicate WhatsApp numbers found.</div>`;

  // 4. Duplicate team names (case-insensitive)
  const byTeamName = groupBy(regs, r => (r.team_name || "").trim().toLowerCase());
  const dupTeamName = [...byTeamName.entries()].filter(([, v]) => v.length > 1);
  html += `<div class="flag-section-title">Duplicate Team Names</div>`;
  html += dupTeamName.length
    ? dupTeamName.map(([name, v]) => renderGroup("Team Name", v[0].team_name, v)).join("")
    : `<div class="clean-state">✓ No duplicate team names found.</div>`;

  // 5. Duplicate email
  const byEmail = groupBy(regs, r => (r.email || "").trim().toLowerCase());
  const dupEmail = [...byEmail.entries()].filter(([, v]) => v.length > 1);
  html += `<div class="flag-section-title">Duplicate Emails</div>`;
  html += dupEmail.length
    ? dupEmail.map(([email, v]) => renderGroup("Email", email, v)).join("")
    : `<div class="clean-state">✓ No duplicate emails found.</div>`;

  resultsEl.innerHTML = html;
}

init();
