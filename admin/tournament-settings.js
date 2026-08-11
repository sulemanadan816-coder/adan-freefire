let PROFILE = null;
let TOURNAMENT = null;
let SCHEDULE = null;
let SPECIAL_DATES = [];
let PRIZE_POOL = null;
let PRIZE_DIST = [];
let REG_SETTINGS = null;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function toISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  return `${dateStr}T${timeStr}:00+05:00`;
}
function splitISO(iso) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  // render in PKT (UTC+5) regardless of browser timezone
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const pkt = new Date(utcMs + 5 * 3600000);
  return {
    date: `${pkt.getFullYear()}-${pad(pkt.getMonth()+1)}-${pad(pkt.getDate())}`,
    time: `${pad(pkt.getHours())}:${pad(pkt.getMinutes())}`,
  };
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

async function loadAll() {
  const { data: tournament } = await window.db.from("tournaments").select("*").eq("is_active", true).single();
  TOURNAMENT = tournament;
  if (!TOURNAMENT) return;

  const [scheduleRes, specialRes, prizeRes, distRes, regRes] = await Promise.all([
    window.db.from("tournament_schedules").select("*").eq("tournament_id", TOURNAMENT.id).maybeSingle(),
    window.db.from("special_dates").select("*").eq("tournament_id", TOURNAMENT.id).order("event_date", { ascending: true }),
    window.db.from("prize_pools").select("*").eq("tournament_id", TOURNAMENT.id).maybeSingle(),
    window.db.from("prize_distributions").select("*").eq("tournament_id", TOURNAMENT.id).order("sort_order", { ascending: true }),
    window.db.from("registration_settings").select("*").eq("tournament_id", TOURNAMENT.id).maybeSingle(),
  ]);

  SCHEDULE = scheduleRes.data || { days_of_week: [6,0], start_time: "20:00", end_time: "00:00", timezone: "Asia/Karachi", is_enabled: true };
  SPECIAL_DATES = specialRes.data || [];
  PRIZE_POOL = prizeRes.data || { total_pool: 0, currency: "PKR" };
  PRIZE_DIST = distRes.data || [];
  REG_SETTINGS = regRes.data || { status: "open", opens_at: null, closes_at: null };
}

function render() {
  const content = document.getElementById("settingsContent");
  if (!TOURNAMENT) {
    content.innerHTML = `<div class="admin-panel">No active tournament found in the database. Create one in Supabase Table Editor (a starter row was seeded by schema.sql) or ask me to build a Tournaments creation page.</div>`;
    return;
  }

  const startSplit = splitISO(TOURNAMENT.start_date);

  content.innerHTML = `
    <div class="settings-grid">
      <div class="admin-panel">
        <h2>Basic Information</h2>
        <div class="login-field"><label>Tournament Name</label><input id="fName" value="${escapeHtml(TOURNAMENT.name || "")}" /></div>
        <div class="login-field" style="margin-top:12px;"><label>Description</label><textarea id="fDesc" class="settings-textarea">${escapeHtml(TOURNAMENT.description || "")}</textarea></div>
        <div class="login-field" style="margin-top:12px;">
          <label>Status</label>
          <select id="fStatus" style="width:100%; padding:12px 14px; border-radius:8px; background:var(--bg-panel-2); border:1px solid var(--border); color:var(--text-1);">
            ${["upcoming","live","completed","cancelled"].map(s => `<option value="${s}" ${TOURNAMENT.status === s ? "selected" : ""}>${s.toUpperCase()}</option>`).join("")}
          </select>
        </div>
        <div class="login-field" style="margin-top:12px;"><label>YouTube Video ID (leave blank until live)</label><input id="fYtVideo" value="${escapeHtml(TOURNAMENT.youtube_video_id || "")}" placeholder="11-character ID from the watch URL" /></div>
        <div class="login-field" style="margin-top:12px;"><label>YouTube Channel URL</label><input id="fYtChannel" value="${escapeHtml(TOURNAMENT.youtube_channel_url || "")}" /></div>
        <div class="save-row"><button class="btn btn-primary" id="saveBasicBtn">Save Basic Info</button></div>
      </div>

      <div class="admin-panel">
        <h2>Specific Tournament Date &amp; Time</h2>
        <p style="color:var(--text-3); font-size:12.5px; margin-bottom:12px;">This drives the public countdown. Times are Pakistan Standard Time (PKT).</p>
        <div class="field-row">
          <div class="login-field"><label>Date</label><input type="date" id="fDate" value="${startSplit.date}" /></div>
          <div class="login-field"><label>Start Time</label><input type="time" id="fStartTime" value="${startSplit.time}" /></div>
        </div>
        <div class="save-row"><button class="btn btn-primary" id="saveDateBtn">Save Date &amp; Time</button></div>
      </div>

      <div class="admin-panel">
        <h2>Recurring Weekend Schedule</h2>
        <p style="color:var(--text-3); font-size:12.5px; margin-bottom:12px;">Displayed on the public site as your default room schedule. Does not drive the countdown — set the specific date above for that.</p>
        <div class="day-picker" id="dayPicker">
          ${DAY_NAMES.map((d, i) => `<span class="day-chip ${SCHEDULE.days_of_week.includes(i) ? "active" : ""}" data-day="${i}">${d}</span>`).join("")}
        </div>
        <div class="field-row">
          <div class="login-field"><label>Start Time</label><input type="time" id="fSchedStart" value="${(SCHEDULE.start_time || "20:00").slice(0,5)}" /></div>
          <div class="login-field"><label>End Time</label><input type="time" id="fSchedEnd" value="${(SCHEDULE.end_time || "00:00").slice(0,5)}" /></div>
        </div>
        <div class="toggle-row"><input type="checkbox" id="fSchedEnabled" ${SCHEDULE.is_enabled ? "checked" : ""} /><label for="fSchedEnabled">Recurring schedule enabled</label></div>
        <div class="save-row"><button class="btn btn-primary" id="saveScheduleBtn">Save Recurring Schedule</button></div>
      </div>

      <div class="admin-panel">
        <h2>Entry Fee &amp; Team Slots</h2>
        <div class="toggle-row"><input type="checkbox" id="fFreeEntry" ${TOURNAMENT.is_free_entry ? "checked" : ""} /><label for="fFreeEntry">Free entry (no payment required)</label></div>
        <div class="login-field"><label>Entry Fee (PKR)</label><input type="number" id="fEntryFee" value="${TOURNAMENT.entry_fee || 0}" /></div>
        <div class="login-field" style="margin-top:12px;"><label>Total Team Slots</label><input type="number" id="fSlots" value="${TOURNAMENT.total_team_slots || 50}" /></div>
        <div class="save-row"><button class="btn btn-primary" id="saveFeeBtn">Save Entry Fee &amp; Slots</button></div>
      </div>

      <div class="admin-panel">
        <h2>Registration Window</h2>
        <div class="login-field">
          <label>Status</label>
          <select id="fRegStatus" style="width:100%; padding:12px 14px; border-radius:8px; background:var(--bg-panel-2); border:1px solid var(--border); color:var(--text-1);">
            ${["open","closed","paused"].map(s => `<option value="${s}" ${REG_SETTINGS.status === s ? "selected" : ""}>${s.toUpperCase()}</option>`).join("")}
          </select>
        </div>
        <div class="save-row"><button class="btn btn-primary" id="saveRegBtn">Save Registration Status</button></div>
      </div>
    </div>

    <div class="settings-grid full">
      <div class="admin-panel">
        <h2>Prize Pool &amp; Distribution</h2>
        <div class="field-row">
          <div class="login-field"><label>Total Prize Pool</label><input type="number" id="fTotalPool" value="${PRIZE_POOL.total_pool || 0}" /></div>
          <div class="login-field"><label>Currency</label><input id="fCurrency" value="${escapeHtml(PRIZE_POOL.currency || "PKR")}" /></div>
        </div>
        <label style="font-family:var(--f-mono); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:var(--text-3); display:block; margin:14px 0 8px;">Distribution</label>
        <div id="distRows"></div>
        <button type="button" class="btn btn-secondary" id="addDistBtn" style="margin-top:6px;">+ Add Prize</button>
        <div class="dist-summary" id="distSummary"></div>
        <div class="save-row"><button class="btn btn-primary" id="savePrizeBtn">Save Prize Pool</button></div>
      </div>

      <div class="admin-panel">
        <h2>Special Date Overrides</h2>
        <p style="color:var(--text-3); font-size:12.5px; margin-bottom:12px;">Finals, rescheduled matches, or one-off events that override the normal weekend schedule.</p>
        <div id="specialRows"></div>
        <button type="button" class="btn btn-secondary" id="addSpecialBtn" style="margin-top:10px;">+ Add Special Date</button>
      </div>
    </div>
  `;

  renderDistRows();
  renderSpecialRows();
  wireEvents();
}

function renderDistRows() {
  const wrap = document.getElementById("distRows");
  wrap.innerHTML = PRIZE_DIST.map((d, i) => `
    <div class="dist-row" data-idx="${i}">
      <input class="dist-label" value="${escapeHtml(d.place_label)}" placeholder="e.g. 1st Place" />
      <input class="dist-amount" type="number" value="${d.amount}" placeholder="Amount" />
      <button type="button" class="dist-remove" data-remove="${i}">✕</button>
    </div>
  `).join("") || `<p style="color:var(--text-3); font-size:13px;">No prize items yet — add one below.</p>`;

  wrap.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      PRIZE_DIST.splice(Number(btn.getAttribute("data-remove")), 1);
      renderDistRows();
      updateDistSummary();
    });
  });
  wrap.querySelectorAll(".dist-label, .dist-amount").forEach(input => {
    input.addEventListener("input", updateDistSummary);
  });
  updateDistSummary();
}

function readDistRowsFromDOM() {
  const rows = document.querySelectorAll("#distRows .dist-row");
  return Array.from(rows).map((row, i) => ({
    place_label: row.querySelector(".dist-label").value.trim(),
    amount: Number(row.querySelector(".dist-amount").value) || 0,
    sort_order: i,
  }));
}

function updateDistSummary() {
  const totalPool = Number(document.getElementById("fTotalPool")?.value) || 0;
  const distributed = readDistRowsFromDOM().reduce((sum, d) => sum + d.amount, 0);
  const remaining = totalPool - distributed;
  const summary = document.getElementById("distSummary");
  summary.innerHTML = `
    <span>Total: ${totalPool.toLocaleString()}</span>
    <span>Distributed: ${distributed.toLocaleString()}</span>
    <span class="${remaining < 0 ? "warn" : ""}">${remaining < 0 ? `Exceeds pool by ${Math.abs(remaining).toLocaleString()}` : `Remaining: ${remaining.toLocaleString()}`}</span>
  `;
}

function renderSpecialRows() {
  const wrap = document.getElementById("specialRows");
  wrap.innerHTML = SPECIAL_DATES.map(d => `
    <div class="special-row" data-id="${d.id}">
      <input class="sp-label" value="${escapeHtml(d.label)}" placeholder="Label" />
      <input class="sp-date" type="date" value="${d.event_date}" />
      <input class="sp-start" type="time" value="${(d.start_time || "").slice(0,5)}" />
      <input class="sp-end" type="time" value="${(d.end_time || "").slice(0,5)}" />
      <button type="button" class="dist-remove" data-del="${d.id}">✕</button>
    </div>
  `).join("") || `<p style="color:var(--text-3); font-size:13px;">No special dates yet.</p>`;

  wrap.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      const { error } = await window.db.from("special_dates").delete().eq("id", id);
      if (error) { toast("Failed to delete special date.", true); return; }
      await logAudit("Schedule Changed", TOURNAMENT.id, { action: "special_date_deleted", id });
      SPECIAL_DATES = SPECIAL_DATES.filter(d => d.id !== id);
      renderSpecialRows();
      toast("Special date removed.");
    });
  });
}

function wireEvents() {
  document.getElementById("dayPicker").addEventListener("click", (e) => {
    const chip = e.target.closest(".day-chip");
    if (!chip) return;
    chip.classList.toggle("active");
  });

  document.getElementById("addDistBtn").addEventListener("click", () => {
    PRIZE_DIST.push({ place_label: "", amount: 0, sort_order: PRIZE_DIST.length });
    renderDistRows();
  });

  document.getElementById("addSpecialBtn").addEventListener("click", async () => {
    const { data, error } = await window.db.from("special_dates").insert([{
      tournament_id: TOURNAMENT.id, label: "New Special Date",
      event_date: new Date().toISOString().slice(0, 10), start_time: "20:00", end_time: "23:00",
    }]).select().single();
    if (error) { toast("Failed to add special date.", true); return; }
    SPECIAL_DATES.push(data);
    await logAudit("Schedule Changed", TOURNAMENT.id, { action: "special_date_added", id: data.id });
    renderSpecialRows();
  });

  document.getElementById("saveBasicBtn").addEventListener("click", async () => {
    const updates = {
      name: document.getElementById("fName").value.trim(),
      description: document.getElementById("fDesc").value.trim(),
      status: document.getElementById("fStatus").value,
      youtube_video_id: document.getElementById("fYtVideo").value.trim(),
      youtube_channel_url: document.getElementById("fYtChannel").value.trim(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await window.db.from("tournaments").update(updates).eq("id", TOURNAMENT.id);
    if (error) { toast("Failed to save.", true); return; }
    Object.assign(TOURNAMENT, updates);
    await logAudit("Tournament Updated", TOURNAMENT.id, updates);
    toast("Basic info saved. Public site will reflect this on next page load.");
  });

  document.getElementById("saveDateBtn").addEventListener("click", async () => {
    const iso = toISO(document.getElementById("fDate").value, document.getElementById("fStartTime").value);
    if (!iso) { toast("Pick both a date and a time.", true); return; }
    const { error } = await window.db.from("tournaments").update({ start_date: iso, updated_at: new Date().toISOString() }).eq("id", TOURNAMENT.id);
    if (error) { toast("Failed to save date.", true); return; }
    TOURNAMENT.start_date = iso;
    await logAudit("Tournament Date Changed", TOURNAMENT.id, { start_date: iso });
    toast("Tournament date saved. Countdown will update on next page load.");
  });

  document.getElementById("saveScheduleBtn").addEventListener("click", async () => {
    const days = Array.from(document.querySelectorAll("#dayPicker .day-chip.active")).map(c => Number(c.getAttribute("data-day")));
    const payload = {
      tournament_id: TOURNAMENT.id,
      days_of_week: days,
      start_time: document.getElementById("fSchedStart").value,
      end_time: document.getElementById("fSchedEnd").value,
      is_enabled: document.getElementById("fSchedEnabled").checked,
      updated_at: new Date().toISOString(),
    };
    const { error } = SCHEDULE.id
      ? await window.db.from("tournament_schedules").update(payload).eq("id", SCHEDULE.id)
      : await window.db.from("tournament_schedules").insert([payload]);
    if (error) { toast("Failed to save schedule.", true); return; }
    await logAudit("Schedule Changed", TOURNAMENT.id, payload);
    toast("Recurring schedule saved.");
    await loadAll();
    render();
  });

  document.getElementById("saveFeeBtn").addEventListener("click", async () => {
    const isFree = document.getElementById("fFreeEntry").checked;
    const fee = Number(document.getElementById("fEntryFee").value) || 0;
    const slots = Number(document.getElementById("fSlots").value) || 0;
    const { error } = await window.db.from("tournaments").update({
      is_free_entry: isFree, entry_fee: isFree ? 0 : fee, total_team_slots: slots, updated_at: new Date().toISOString(),
    }).eq("id", TOURNAMENT.id);
    if (error) { toast("Failed to save.", true); return; }
    Object.assign(TOURNAMENT, { is_free_entry: isFree, entry_fee: fee, total_team_slots: slots });
    await logAudit("Entry Fee Changed", TOURNAMENT.id, { is_free_entry: isFree, entry_fee: fee, total_team_slots: slots });
    toast("Entry fee & slots saved.");
  });

  document.getElementById("saveRegBtn").addEventListener("click", async () => {
    const status = document.getElementById("fRegStatus").value;
    const payload = { tournament_id: TOURNAMENT.id, status, updated_at: new Date().toISOString() };
    const { error } = REG_SETTINGS.id
      ? await window.db.from("registration_settings").update(payload).eq("id", REG_SETTINGS.id)
      : await window.db.from("registration_settings").insert([payload]);
    if (error) { toast("Failed to save.", true); return; }
    await logAudit("Registration Status Changed", TOURNAMENT.id, payload);
    toast("Registration status saved.");
    await loadAll();
  });

  document.getElementById("savePrizeBtn").addEventListener("click", async () => {
    const totalPool = Number(document.getElementById("fTotalPool").value) || 0;
    const currency = document.getElementById("fCurrency").value.trim() || "PKR";
    const distRows = readDistRowsFromDOM().filter(d => d.place_label);

    const poolPayload = { tournament_id: TOURNAMENT.id, total_pool: totalPool, currency, updated_at: new Date().toISOString() };
    const poolRes = PRIZE_POOL.id
      ? await window.db.from("prize_pools").update(poolPayload).eq("id", PRIZE_POOL.id)
      : await window.db.from("prize_pools").insert([poolPayload]);
    if (poolRes.error) { toast("Failed to save prize pool.", true); return; }

    // simplest safe strategy: delete all existing distribution rows, reinsert current set
    await window.db.from("prize_distributions").delete().eq("tournament_id", TOURNAMENT.id);
    if (distRows.length > 0) {
      const rows = distRows.map(d => ({ ...d, tournament_id: TOURNAMENT.id }));
      const { error: insErr } = await window.db.from("prize_distributions").insert(rows);
      if (insErr) { toast("Prize pool saved, but distribution failed.", true); return; }
    }

    await logAudit("Prize Pool Changed", TOURNAMENT.id, { totalPool, currency, distRows });
    toast("Prize pool saved.");
    await loadAll();
    render();
  });
}

init();
