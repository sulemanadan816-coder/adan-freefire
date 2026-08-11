let ADMIN_PROFILE = null;
let ALL_LOGS = [];
let FILTERED = [];
let PAGE = 1;
const PAGE_SIZE = 20;
let NEW_IDS = new Set(); // ids received via realtime this session, for the flash animation

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

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function deviceLabel(details) {
  const ua = details && details.device;
  if (!ua) return "—";
  if (/Mobile|Android|iPhone/i.test(ua)) return "📱 Mobile";
  if (/Tablet|iPad/i.test(ua)) return "📱 Tablet";
  return "💻 Desktop";
}

async function init() {
  ADMIN_PROFILE = await requireAdmin();
  if (!ADMIN_PROFILE) return;

  document.getElementById("adminUserLabel").textContent = `${ADMIN_PROFILE.email} · ${ADMIN_PROFILE.role.toUpperCase()}`;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    logAudit("Admin Logout", ADMIN_PROFILE.id, null).finally(adminLogout);
  });

  document.getElementById("searchInput").addEventListener("input", () => { PAGE = 1; applyFilters(); });
  document.getElementById("actionFilter").addEventListener("change", () => { PAGE = 1; applyFilters(); });
  document.getElementById("dateFilter").addEventListener("change", () => { PAGE = 1; applyFilters(); });
  document.getElementById("sortOrder").addEventListener("change", () => { PAGE = 1; applyFilters(); });
  document.getElementById("prevBtn").addEventListener("click", () => { if (PAGE > 1) { PAGE--; render(); } });
  document.getElementById("nextBtn").addEventListener("click", () => {
    const maxPage = Math.max(1, Math.ceil(FILTERED.length / PAGE_SIZE));
    if (PAGE < maxPage) { PAGE++; render(); }
  });
  document.getElementById("viewOverlay").addEventListener("click", (e) => {
    if (e.target.id === "viewOverlay") e.target.classList.remove("open");
  });

  await loadLogs();
  subscribeRealtime();
}

async function loadLogs() {
  const wrap = document.getElementById("tableWrap");
  wrap.innerHTML = `<div class="admin-loading">Loading…</div>`;

  const { data, error } = await window.db
    .from("audit_logs")
    .select("*, profiles:admin_id(email, full_name, role)")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    wrap.innerHTML = `<div style="color:var(--danger);">Failed to load audit log: ${escapeHtml(error.message)}</div>`;
    return;
  }

  ALL_LOGS = data || [];
  populateActionFilter();
  applyFilters();
}

function populateActionFilter() {
  const sel = document.getElementById("actionFilter");
  const current = sel.value;
  const actions = Array.from(new Set(ALL_LOGS.map((l) => l.action))).sort();
  sel.innerHTML = `<option value="">All actions</option>` +
    actions.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");
  sel.value = current;
}

function applyFilters() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const action = document.getElementById("actionFilter").value;
  const dateRange = document.getElementById("dateFilter").value;
  const sort = document.getElementById("sortOrder").value;

  let rows = [...ALL_LOGS];

  if (action) rows = rows.filter((r) => r.action === action);

  if (dateRange) {
    const now = new Date();
    let cutoff;
    if (dateRange === "today") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      cutoff = new Date(now.getTime() - Number(dateRange) * 24 * 60 * 60 * 1000);
    }
    rows = rows.filter((r) => new Date(r.created_at) >= cutoff);
  }

  if (q) {
    rows = rows.filter((r) => {
      const email = r.profiles?.email || "";
      return (
        (r.action || "").toLowerCase().includes(q) ||
        (r.record_id || "").toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        JSON.stringify(r.details || {}).toLowerCase().includes(q)
      );
    });
  }

  rows.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return sort === "asc" ? da - db : db - da;
  });

  FILTERED = rows;
  render();
}

function render() {
  const wrap = document.getElementById("tableWrap");
  const pager = document.getElementById("pager");

  if (FILTERED.length === 0) {
    wrap.innerHTML = `<div style="padding:30px 0; text-align:center; color:var(--text-3);">No audit entries match your filters.</div>`;
    pager.style.display = "none";
    return;
  }

  const maxPage = Math.max(1, Math.ceil(FILTERED.length / PAGE_SIZE));
  if (PAGE > maxPage) PAGE = maxPage;
  const start = (PAGE - 1) * PAGE_SIZE;
  const pageRows = FILTERED.slice(start, start + PAGE_SIZE);

  const rowsHtml = pageRows.map((r) => {
    const who = r.profiles?.email || "Unknown / deleted admin";
    const isNew = NEW_IDS.has(r.id);
    return `
      <tr${isNew ? ' class="live-row"' : ""}>
        <td>${fmtDateTime(r.created_at)}</td>
        <td><span class="action-pill">${escapeHtml(r.action)}</span></td>
        <td class="who">${escapeHtml(who)}<br><span style="opacity:0.6;">${escapeHtml(r.profiles?.role || "")}</span></td>
        <td>${r.record_id ? escapeHtml(r.record_id) : "—"}</td>
        <td>${deviceLabel(r.details)}</td>
        <td><button class="details-btn" data-id="${r.id}">Details</button></td>
      </tr>`;
  }).join("");

  wrap.innerHTML = `
    <table class="log-table">
      <thead>
        <tr>
          <th>Date &amp; Time</th>
          <th>Action</th>
          <th>Admin</th>
          <th>Record</th>
          <th>Device</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  wrap.querySelectorAll(".details-btn").forEach((btn) => {
    btn.addEventListener("click", () => showDetails(btn.dataset.id));
  });

  pager.style.display = "flex";
  document.getElementById("pageLabel").textContent = `Page ${PAGE} of ${maxPage} · ${FILTERED.length} entries`;
  document.getElementById("prevBtn").disabled = PAGE <= 1;
  document.getElementById("nextBtn").disabled = PAGE >= maxPage;
}

function showDetails(id) {
  const row = ALL_LOGS.find((r) => String(r.id) === String(id));
  if (!row) return;
  const who = row.profiles?.email || "Unknown / deleted admin";
  const box = document.getElementById("viewBox");
  box.innerHTML = `
    <h3 style="font-size:19px; margin-bottom:14px;">Audit Entry</h3>
    <div class="view-row"><span class="k">Action</span><span>${escapeHtml(row.action)}</span></div>
    <div class="view-row"><span class="k">Admin</span><span>${escapeHtml(who)}</span></div>
    <div class="view-row"><span class="k">Record ID</span><span>${row.record_id ? escapeHtml(row.record_id) : "—"}</span></div>
    <div class="view-row"><span class="k">Date &amp; Time</span><span>${fmtDateTime(row.created_at)}</span></div>
    <div class="view-row"><span class="k">Device</span><span>${escapeHtml(row.details?.device || "—")}</span></div>
    <pre>${escapeHtml(JSON.stringify(row.details || {}, null, 2))}</pre>
    <div class="actions" style="margin-top:20px;">
      <button class="btn btn-secondary" id="closeViewBtn" style="flex:1;">Close</button>
    </div>`;
  document.getElementById("closeViewBtn").addEventListener("click", () => {
    document.getElementById("viewOverlay").classList.remove("open");
  });
  document.getElementById("viewOverlay").classList.add("open");
}

function subscribeRealtime() {
  window.db
    .channel("audit_logs_live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, async (payload) => {
      // Fetch the row with its joined admin profile so the new entry displays fully
      const { data } = await window.db
        .from("audit_logs")
        .select("*, profiles:admin_id(email, full_name, role)")
        .eq("id", payload.new.id)
        .single();

      const entry = data || payload.new;
      if (ALL_LOGS.some((r) => r.id === entry.id)) return;

      ALL_LOGS.unshift(entry);
      NEW_IDS.add(entry.id);
      populateActionFilter();
      applyFilters();

      const dot = document.getElementById("liveDot");
      dot.style.display = "inline-block";
      toast(`New action logged: ${entry.action}`);
    })
    .subscribe();
}

init();
