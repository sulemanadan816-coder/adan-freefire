function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function fmtMoney(n) {
  const currency = (window.CONFIG && CONFIG.prize && CONFIG.prize.currency) || "PKR";
  return currency + " " + Number(n || 0).toLocaleString("en-US");
}

function toast(msg, isErr) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

let currentProfile = null;
let currentTab = "pending";
let allDonations = [];

function renderRow(d) {
  const actions = d.status === "pending"
    ? `<div class="don-actions">
         <button class="btn-verify" data-action="verify" data-id="${d.id}">Verify</button>
         <button class="btn-reject" data-action="reject" data-id="${d.id}">Reject</button>
       </div>`
    : `<span style="color:var(--text-3); font-size:11.5px;">${d.status === "verified" ? "✓ Verified" : "✕ Rejected"}${d.verified_at ? " · " + fmtDate(d.verified_at) : ""}</span>`;

  return `
    <div class="don-row">
      <div>
        <div class="name">${escapeHtml(d.donor_name)}</div>
        <div class="sub">${d.donor_whatsapp ? escapeHtml(d.donor_whatsapp) : "no contact"}${d.message ? " · \u201c" + escapeHtml(d.message) + "\u201d" : ""}</div>
      </div>
      <div class="don-amount">${fmtMoney(d.amount)}</div>
      <div>
        <div>${escapeHtml(d.transaction_id || "—")}</div>
        <div class="sub">TXN ID</div>
      </div>
      <div>
        <div>${escapeHtml(d.sender_number || "—")}</div>
        <div class="sub">${fmtDate(d.created_at)}</div>
      </div>
      ${actions}
    </div>`;
}

function renderList() {
  const listEl = document.getElementById("donList");
  const rows = allDonations.filter((d) => d.status === currentTab);

  if (rows.length === 0) {
    listEl.innerHTML = `<div class="don-empty">No ${currentTab} donations.</div>`;
    return;
  }
  listEl.innerHTML = rows.map(renderRow).join("");

  listEl.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleAction(btn.dataset.id, btn.dataset.action));
  });
}

async function handleAction(id, action) {
  const status = action === "verify" ? "verified" : "rejected";
  const { error } = await window.db
    .from("donations")
    .update({ status, verified_by: currentProfile.id, verified_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error(error);
    toast("Action failed.", true);
    return;
  }

  await logAudit(`Donation ${status}`, id, null);
  toast(`Donation ${status}.`);
  await loadDonations();
}

async function loadDonations() {
  const { data, error } = await window.db.from("donations").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    toast("Failed to load donations.", true);
    return;
  }
  allDonations = data || [];
  renderList();
  renderStats();
}

function renderStats() {
  const cards = document.querySelectorAll("#donStats .stat-card .value");
  const [verifiedCard, pendingCard, rejectedCard, supportersCard] = cards;

  const verified = allDonations.filter((d) => d.status === "verified");
  const pending = allDonations.filter((d) => d.status === "pending");
  const rejected = allDonations.filter((d) => d.status === "rejected");

  const setCard = (el, text) => { el.textContent = text; el.classList.remove("admin-loading"); };
  setCard(verifiedCard, fmtMoney(verified.reduce((s, d) => s + Number(d.amount), 0)));
  setCard(pendingCard, String(pending.length));
  setCard(rejectedCard, String(rejected.length));
  setCard(supportersCard, String(verified.length));
}

async function init() {
  currentProfile = await requireAdmin();
  if (!currentProfile) return;

  document.getElementById("adminUserLabel").textContent = `${currentProfile.email} · ${currentProfile.role.toUpperCase()}`;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    logAudit("Admin Logout", currentProfile.id, null).finally(adminLogout);
  });

  document.querySelectorAll(".don-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".don-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.status;
      renderList();
    });
  });

  await loadDonations();
}

init();
