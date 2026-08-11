/* =========================================================================
   ADAN FREE FIRE TOURNAMENT — DONATIONS + WHATSAPP COMMUNITY
   Self-contained module. Reads CONFIG.donation / CONFIG.social from
   config.js. Writes real rows to Supabase `donations` table (see
   migration_donations.sql). Nothing here is fake — the public total comes
   from the `donation_totals()` RPC, which only counts admin-verified rows.
   ========================================================================= */
(function () {
  "use strict";

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const isPlaceholder = (v) => !v || String(v).includes("EDIT_ME");

  function toast(msg, isErr) {
    const stack = $("#toastStack");
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

  function fmtMoney(n) {
    const currency = (window.CONFIG && CONFIG.prize && CONFIG.prize.currency) || "PKR";
    return currency + " " + Number(n || 0).toLocaleString("en-US");
  }

  /* ----------------------------------------------------------------------
     WHATSAPP COMMUNITY BUTTONS
     -------------------------------------------------------------------- */
  function initWhatsapp() {
    const url = window.CONFIG && CONFIG.social && CONFIG.social.whatsapp;
    const targets = ["#fabWhatsapp", "#footerWaLink", "#waStripBtn", "#regModalWaBtn"];

    if (isPlaceholder(url)) {
      targets.forEach((sel) => { const el = $(sel); if (el) el.style.display = "none"; });
      return;
    }
    targets.forEach((sel) => { const el = $(sel); if (el) el.href = url; });
  }

  /* ----------------------------------------------------------------------
     DONATE MENU
     -------------------------------------------------------------------- */
  let selectedAmount = null;

  function renderAmountChips() {
    const wrap = $("#donateAmounts");
    if (!wrap) return;
    const amounts = (CONFIG.donation && CONFIG.donation.suggestedAmounts) || [100, 200, 500, 1000];
    wrap.innerHTML = amounts.map((a, i) =>
      `<button type="button" class="donate-chip${i === 0 ? " active" : ""}" data-amount="${a}">${fmtMoney(a)}</button>`
    ).join("");
    selectedAmount = amounts[0] || null;

    $$(".donate-chip", wrap).forEach((chip) => {
      chip.addEventListener("click", () => {
        $$(".donate-chip", wrap).forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        selectedAmount = Number(chip.dataset.amount);
        $("#donateCustomAmount").value = "";
      });
    });

    $("#donateCustomAmount").addEventListener("input", (e) => {
      $$(".donate-chip", wrap).forEach((c) => c.classList.remove("active"));
      selectedAmount = e.target.value ? Number(e.target.value) : null;
    });
  }

  function renderPaymentInfo() {
    const d = CONFIG.donation || {};
    $("#donatePayNumber").textContent = d.accountNumber || "—";
    $("#donatePayName").textContent = (d.accountName || "—") + " · " + (d.method || "Easypaisa");
    if (d.title) $("#donateTitle").textContent = d.title;
    if (d.tagline) $("#donateTagline").textContent = d.tagline;
  }

  async function refreshTotals() {
    const totalEl = $("#donateTotalAmount");
    const countEl = $("#donateDonorCount");
    if (!totalEl || !window.db) return;
    try {
      const { data, error } = await window.db.rpc("donation_totals");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      totalEl.textContent = fmtMoney(row ? row.total_amount : 0);
      countEl.textContent = row ? row.donor_count : "0";
    } catch (e) {
      console.error("donation_totals failed", e);
      totalEl.textContent = fmtMoney(0);
      countEl.textContent = "0";
    }
  }

  function openDonateModal() {
    $("#donateFormWrap").style.display = "";
    $("#donateSuccessWrap").style.display = "none";
    $("#donateOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
    refreshTotals();
  }

  function closeDonateModal() {
    $("#donateOverlay").classList.remove("open");
    document.body.style.overflow = "";
  }

  async function submitDonation() {
    const btn = $("#donateSubmitBtn");
    const txnId = $("#donateTxnId").value.trim();
    const senderNumber = $("#donateSenderNumber").value.trim();
    const amount = selectedAmount || Number($("#donateCustomAmount").value);
    const minAmount = (CONFIG.donation && CONFIG.donation.minAmount) || 20;

    if (!amount || amount < minAmount) {
      toast(`Enter a valid amount (minimum ${fmtMoney(minAmount)}).`, true);
      return;
    }
    if (!txnId) { toast("Enter the Easypaisa Transaction ID.", true); return; }
    if (!/^[\d+\-\s]{9,15}$/.test(senderNumber)) { toast("Enter a valid sender number.", true); return; }

    btn.disabled = true;
    btn.textContent = "Submitting…";

    const payload = {
      donor_name: $("#donateName").value.trim() || "Anonymous",
      donor_whatsapp: $("#donateWhatsapp").value.trim() || null,
      amount,
      message: $("#donateMessage").value.trim() || null,
      payment_method: (CONFIG.donation && CONFIG.donation.method) || "Easypaisa",
      transaction_id: txnId,
      sender_number: senderNumber,
      is_public: $("#donatePublic").checked,
      status: "pending",
    };

    try {
      const { error } = await window.db.from("donations").insert([payload]);
      if (error) throw error;
      $("#donateFormWrap").style.display = "none";
      $("#donateSuccessWrap").style.display = "";
      [
        "#donateName", "#donateWhatsapp", "#donateTxnId", "#donateSenderNumber", "#donateMessage", "#donateCustomAmount",
      ].forEach((sel) => { $(sel).value = ""; });
    } catch (e) {
      console.error(e);
      toast("Couldn't submit donation. Please try again.", true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirm My Donation";
    }
  }

  function initDonate() {
    if (!(CONFIG.donation && CONFIG.donation.enabled)) {
      const fab = $("#fabDonate"); if (fab) fab.style.display = "none";
      const link = $("#footerDonateLink"); if (link) link.style.display = "none";
      return;
    }

    renderAmountChips();
    renderPaymentInfo();

    $("#fabDonate").addEventListener("click", openDonateModal);
    $("#footerDonateLink").addEventListener("click", (e) => { e.preventDefault(); openDonateModal(); });
    $("#donateClose").addEventListener("click", closeDonateModal);
    $("#donateOverlay").addEventListener("click", (e) => { if (e.target.id === "donateOverlay") closeDonateModal(); });
    $("#donateDoneBtn").addEventListener("click", closeDonateModal);
    $("#donateSubmitBtn").addEventListener("click", submitDonation);

    $("#donateCopyBtn").addEventListener("click", () => {
      const num = $("#donatePayNumber").textContent;
      navigator.clipboard.writeText(num).then(() => toast("Easypaisa number copied.")).catch(() => toast("Copy failed — select manually.", true));
    });

    refreshTotals();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initWhatsapp();
    initDonate();
  });
})();
