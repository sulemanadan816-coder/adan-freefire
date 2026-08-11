let ADMIN_PROFILE = null;
let ALL_REGS = [];
let FILTERED = [];
let PAGE = 1;
const PAGE_SIZE = 10;
let ACTIVE_TOURNAMENT_ID = null;

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

function badgeClass(status) {
  return `badge badge-${status}`;
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

  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("statusFilter").addEventListener("change", applyFilters);
  document.getElementById("sortOrder").addEventListener("change", applyFilters);
  document.getElementById("prevBtn").addEventListener("click", () => { PAGE--; render(); });
  document.getElementById("nextBtn").addEventListener("click", () => { PAGE++; render(); });

  await loadRegistrations();
}

async function loadRegistrations() {
  const wrap = document.getElementById("tableWrap");
  wrap.classList.add("admin-loading");
  wrap.textContent = "Loading…";

  const { data, error } = await window.db
    .from("registrations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    wrap.textContent = "Failed to load registrations.";
    console.error(error);
    return;
  }

  ALL_REGS = data || [];
  applyFilters();
}

function applyFilters() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;
  const sort = document.getElementById("sortOrder").value;

  FILTERED = ALL_REGS.filter((r) => {
    if (status && r.status !== status) return false;
    if (!q) return true;
    const hay = [r.team_name, r.captain_name, r.email, r.captain_uid, r.whatsapp, r.registration_code]
      .join(" ").toLowerCase();
    return hay.includes(q);
  });

  FILTERED.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return sort === "asc" ? ta - tb : tb - ta;
  });

  PAGE = 1;
  render();
}

function render() {
  const wrap = document.getElementById("tableWrap");
  wrap.classList.remove("admin-loading");

  if (FILTERED.length === 0) {
    wrap.textContent = ALL_REGS.length === 0 ? "No teams registered yet." : "No registrations match your filters.";
    document.getElementById("pager").style.display = "none";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(FILTERED.length / PAGE_SIZE));
  PAGE = Math.min(PAGE, totalPages);
  const start = (PAGE - 1) * PAGE_SIZE;
  const pageItems = FILTERED.slice(start, start + PAGE_SIZE);

  wrap.innerHTML = `
    <table class="reg-table">
      <thead>
        <tr>
          <th>Code</th><th>Team</th><th>Captain</th><th>Players</th>
          <th>Status</th><th>Payment</th><th>Submitted</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${pageItems.map(r => `
          <tr data-id="${r.id}">
            <td style="font-family:var(--f-mono);">${escapeHtml(r.registration_code)}</td>
            <td>${escapeHtml(r.team_name)}</td>
            <td>${escapeHtml(r.captain_name)}</td>
            <td>${r.player_count}</td>
            <td><span class="${badgeClass(r.status)}">${r.status}</span></td>
            <td>
              <span class="badge badge-${r.payment_status || 'unpaid'}">${(r.payment_status || 'unpaid').replace('_',' ')}</span>
              ${r.payment_transaction_id ? `<div style="font-family:var(--f-mono); font-size:10.5px; color:var(--text-3); margin-top:3px;">${escapeHtml(r.payment_transaction_id)}</div>` : ""}
            </td>
            <td style="color:var(--text-3); font-size:12.5px;">${new Date(r.created_at).toLocaleString()}</td>
            <td>
              <div class="row-actions">
                <button data-act="view">View</button>
                ${r.payment_status === "pending_verification" ? `<button data-act="verifypay" class="approve">Verify Payment</button>` : ""}
                ${r.payment_status === "pending_verification" ? `<button data-act="rejectpay" class="reject">Reject Payment</button>` : ""}
                ${r.status !== "approved" ? `<button data-act="approve" class="approve">Approve</button>` : ""}
                ${r.status !== "rejected" ? `<button data-act="reject" class="reject">Reject</button>` : ""}
                ${r.status !== "disqualified" ? `<button data-act="disqualify">Disqualify</button>` : ""}
                <button data-act="delete" class="delete">Delete</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const row = e.target.closest("tr");
      const id = row.getAttribute("data-id");
      const reg = ALL_REGS.find(r => r.id === id);
      const act = btn.getAttribute("data-act");
      if (act === "view") openView(reg);
      if (act === "verifypay") doVerifyPayment(reg);
      if (act === "rejectpay") doRejectPayment(reg);
      if (act === "approve") doApprove(reg);
      if (act === "reject") doReject(reg);
      if (act === "disqualify") doDisqualify(reg);
      if (act === "delete") doDelete(reg);
    });
  });

  const pager = document.getElementById("pager");
  pager.style.display = "flex";
  document.getElementById("pageLabel").textContent = `Page ${PAGE} of ${totalPages}`;
  document.getElementById("prevBtn").disabled = PAGE <= 1;
  document.getElementById("nextBtn").disabled = PAGE >= totalPages;
}

function openView(reg) {
  const overlay = document.getElementById("viewOverlay");
  const box = document.getElementById("viewBox");
  const players = Array.isArray(reg.players) ? reg.players : [];

  box.innerHTML = `
    <h3 style="font-size:22px; margin-bottom:4px;">${escapeHtml(reg.team_name)}</h3>
    <p style="color:var(--text-3); font-family:var(--f-mono); font-size:12px; margin-bottom:10px;">${escapeHtml(reg.registration_code)}</p>
    <div class="view-row"><span class="k">Captain</span><span>${escapeHtml(reg.captain_name)}</span></div>
    <div class="view-row"><span class="k">Captain IGN</span><span>${escapeHtml(reg.captain_ign)}</span></div>
    <div class="view-row"><span class="k">Captain UID</span><span>${escapeHtml(reg.captain_uid)}</span></div>
    <div class="view-row"><span class="k">WhatsApp</span><span>${escapeHtml(reg.whatsapp)}</span></div>
    <div class="view-row"><span class="k">Email</span><span>${escapeHtml(reg.email)}</span></div>
    <div class="view-row"><span class="k">City</span><span>${escapeHtml(reg.city || "—")}</span></div>
    <div class="view-row"><span class="k">Status</span><span class="${badgeClass(reg.status)}">${reg.status}</span></div>
    ${reg.entry_fee_amount > 0 ? `
    <div class="view-row"><span class="k">Entry Fee</span><span>PKR ${reg.entry_fee_amount}</span></div>
    <div class="view-row"><span class="k">Transaction ID</span><span style="font-family:var(--f-mono);">${escapeHtml(reg.payment_transaction_id || "—")}</span></div>
    <div class="view-row"><span class="k">Sent From</span><span>${escapeHtml(reg.payment_sender_number || "—")}</span></div>
    <div class="view-row"><span class="k">Payment Status</span><span class="badge badge-${reg.payment_status || 'unpaid'}">${(reg.payment_status || 'unpaid').replace('_',' ')}</span></div>
    ` : ""}
    <div class="view-row"><span class="k">Players (${players.length})</span><span></span></div>
    ${players.map(p => `<div class="view-row"><span>${escapeHtml(p.name)}</span><span style="font-family:var(--f-mono);">${escapeHtml(p.uid)}</span></div>`).join("")}
    <div class="view-row"><span class="k">Internal Notes</span><span></span></div>
    <textarea id="notesBox" style="width:100%; min-height:70px; margin-top:6px; background:var(--bg-panel-2); border:1px solid var(--border); border-radius:8px; color:var(--text-1); padding:10px; font-size:13px;">${escapeHtml(reg.internal_notes || "")}</textarea>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn btn-secondary" id="closeViewBtn" style="flex:1;">Close</button>
      <button class="btn btn-primary" id="saveNotesBtn" style="flex:1;">Save Notes</button>
    </div>
  `;

  overlay.classList.add("open");
  document.getElementById("closeViewBtn").addEventListener("click", () => overlay.classList.remove("open"));
  document.getElementById("saveNotesBtn").addEventListener("click", async () => {
    const notes = document.getElementById("notesBox").value;
    const { error } = await window.db.from("registrations").update({ internal_notes: notes }).eq("id", reg.id);
    if (error) { toast("Failed to save notes.", true); return; }
    reg.internal_notes = notes;
    await logAudit("Registration Notes Updated", reg.id, { notes });
    toast("Notes saved.");
    overlay.classList.remove("open");
  });
}

async function doVerifyPayment(reg) {
  const ok = await confirmDialog("Mark payment as verified?", `Confirm you've checked transaction ${reg.payment_transaction_id} in your Easypaisa account for ${reg.team_name} (${reg.entry_fee_amount || ""} PKR).`);
  if (!ok) return;
  const { data: { session } } = await window.db.auth.getSession();
  const { error } = await window.db.from("registrations").update({
    payment_status: "verified",
    payment_verified_by: session.user.id,
    payment_verified_at: new Date().toISOString(),
  }).eq("id", reg.id);
  if (error) { toast("Failed to mark payment verified.", true); return; }
  await logAudit("Payment Verified", reg.id, { team_name: reg.team_name, transaction_id: reg.payment_transaction_id });
  toast(`Payment verified for ${reg.team_name}.`);
  await loadRegistrations();
}

async function doRejectPayment(reg) {
  const ok = await confirmDialog("Reject this payment?", `${reg.team_name}'s transaction ${reg.payment_transaction_id} could not be verified. Registration stays pending team approval.`);
  if (!ok) return;
  const { error } = await window.db.from("registrations").update({ payment_status: "rejected" }).eq("id", reg.id);
  if (error) { toast("Failed to reject payment.", true); return; }
  await logAudit("Payment Rejected", reg.id, { team_name: reg.team_name, transaction_id: reg.payment_transaction_id });
  toast(`Payment marked rejected for ${reg.team_name}.`);
  await loadRegistrations();
}

async function doApprove(reg) {
  if (reg.entry_fee_amount > 0 && reg.payment_status !== "verified") {
    const proceed = await confirmDialog(
      "Payment not verified yet",
      `${reg.team_name}'s payment is "${(reg.payment_status || 'unpaid').replace('_',' ')}", not verified. Approve the team anyway?`
    );
    if (!proceed) return;
  }

  const { count: approvedCount } = await window.db
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", ACTIVE_TOURNAMENT_ID)
    .eq("status", "approved");
  const { data: tRow } = await window.db.from("tournaments").select("total_team_slots").eq("id", ACTIVE_TOURNAMENT_ID).single();
  const slotsFull = tRow && typeof tRow.total_team_slots === "number" && (approvedCount || 0) >= tRow.total_team_slots;
  if (slotsFull) {
    const proceed = await confirmDialog(
      "Tournament is at capacity",
      `${approvedCount}/${tRow.total_team_slots} slots are already approved. Approving ${reg.team_name} will exceed the configured capacity. Continue anyway?`
    );
    if (!proceed) return;
  }

  const ok = await confirmDialog("Approve this team?", `${reg.team_name} will be created as an approved team and their players will be added.`);
  if (!ok) return;

  // Atomic: team + players + registration status + audit log all happen
  // in one transaction inside the DB, or none of them do. See
  // migration_atomic_approve_rpc.sql for why this replaced 4 separate
  // client-side writes.
  const { error: rpcErr } = await window.db.rpc("approve_registration", { p_registration_id: reg.id });
  if (rpcErr) { toast(rpcErr.message || "Failed to approve registration.", true); console.error(rpcErr); return; }

  toast(`${reg.team_name} approved.`);
  await loadRegistrations();
}

async function doReject(reg) {
  const ok = await confirmDialog("Reject this registration?", `${reg.team_name} will be marked as rejected.`);
  if (!ok) return;
  const { error } = await window.db.from("registrations").update({ status: "rejected" }).eq("id", reg.id);
  if (error) { toast("Failed to reject.", true); return; }
  await logAudit("Registration Rejected", reg.id, { team_name: reg.team_name });
  toast(`${reg.team_name} rejected.`);
  await loadRegistrations();
}

async function doDisqualify(reg) {
  const ok = await confirmDialog("Disqualify this team?", `${reg.team_name} will be marked disqualified. Their team record (if approved) will also be disqualified.`);
  if (!ok) return;
  const { error } = await window.db.from("registrations").update({ status: "disqualified" }).eq("id", reg.id);
  if (error) { toast("Failed to disqualify.", true); return; }

  await window.db.from("teams").update({ status: "disqualified" }).eq("registration_id", reg.id);
  await logAudit("Team Disqualified", reg.id, { team_name: reg.team_name });
  toast(`${reg.team_name} disqualified.`);
  await loadRegistrations();
}

async function doDelete(reg) {
  const ok = await confirmDialog("Delete this registration?", "This permanently removes the registration record. This cannot be undone.");
  if (!ok) return;
  const { error } = await window.db.from("registrations").delete().eq("id", reg.id);
  if (error) { toast("Failed to delete.", true); return; }
  await logAudit("Registration Deleted", reg.id, { team_name: reg.team_name });
  toast(`Registration deleted.`);
  await loadRegistrations();
}

init();
