/* =========================================================================
   ADAN FREE FIRE TOURNAMENT — APP LOGIC
   Reads everything from CONFIG (config.js). No tournament data is
   hard-coded here — edit config.js to change what the site shows.
   ========================================================================= */
(function () {
  "use strict";

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const fmtMoney = (n) => CONFIG.prize.currency + " " + Number(n).toLocaleString("en-US");
  const isPlaceholder = (v) => !v || String(v).includes("EDIT_ME");

  // Escape any value that came from the database (team names, captain names,
  // etc. are user-submitted at registration time) before it's ever placed
  // into innerHTML. Without this, a malicious team_name like
  // "<img src=x onerror=...>" would execute in every visitor's browser once
  // an admin approves that team and it reaches the public leaderboard.
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ----------------------------------------------------------------------
     TOASTS
     -------------------------------------------------------------------- */
  function toast(msg, isErr) {
    const stack = $("#toastStack");
    const el = document.createElement("div");
    el.className = "toast" + (isErr ? " err" : "");
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  function initWhatsappLinks() {
    const url = CONFIG.social && CONFIG.social.whatsapp;
    const floatBtn = $("#whatsappFloatBtn");
    if (!url || isPlaceholder(url)) {
      if (floatBtn) floatBtn.style.display = "none";
      return;
    }
    if (floatBtn) floatBtn.href = url;
    const footerBtn = $("#footerWhatsappBtn");
    if (footerBtn) footerBtn.href = url;
    const modalBtn = $("#modalWhatsappBtn");
    if (modalBtn) modalBtn.href = url;
  }

  /* ----------------------------------------------------------------------
     NAV: sticky highlight, mobile menu, smooth scroll offset
     -------------------------------------------------------------------- */
  function initNav() {
    const hamburger = $("#hamburger");
    const mobileMenu = $("#mobileMenu");
    hamburger.addEventListener("click", () => {
      const open = mobileMenu.classList.toggle("open");
      hamburger.classList.toggle("open", open);
      hamburger.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    $$("#mobileMenu a").forEach((a) =>
      a.addEventListener("click", () => {
        mobileMenu.classList.remove("open");
        hamburger.classList.remove("open");
        document.body.style.overflow = "";
      })
    );

    const sections = $$("main section[id], header[id], section[id]");
    const navLinks = $$("#navLinks a");
    const map = new Map(navLinks.map((a) => [a.getAttribute("href").slice(1), a]));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = map.get(entry.target.id);
          if (!link) return;
          if (entry.isIntersecting) {
            navLinks.forEach((a) => a.classList.remove("active"));
            link.classList.add("active");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    $$("[id]").forEach((sec) => {
      if (map.has(sec.id)) observer.observe(sec);
    });
  }

  /* ----------------------------------------------------------------------
     BACK TO TOP
     -------------------------------------------------------------------- */
  function initBackToTop() {
    const btn = $("#backToTop");
    window.addEventListener("scroll", () => {
      btn.classList.toggle("show", window.scrollY > 600);
    });
    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* ----------------------------------------------------------------------
     RIPPLE EFFECT on .btn
     -------------------------------------------------------------------- */
  function initRipples() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement("span");
      const size = Math.max(rect.width, rect.height);
      ripple.className = "ripple";
      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left = e.clientX - rect.left - size / 2 + "px";
      ripple.style.top = e.clientY - rect.top - size / 2 + "px";
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    });
  }

  /* ----------------------------------------------------------------------
     SCROLL REVEAL
     -------------------------------------------------------------------- */
  function initReveal() {
    const els = $$(".reveal, .card, .match-card, .acc-item, .prize-card, .social-btn, .podium-card, .stat-cell");
    els.forEach((el, i) => {
      el.classList.add("reveal", "reveal-stagger");
      el.style.setProperty("--i", i % 8);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
  }

  /* ----------------------------------------------------------------------
     TICKER BAR
     -------------------------------------------------------------------- */
  function initTicker() {
    const t = CONFIG.tournament, s = CONFIG.slots, p = CONFIG.prize;
    const items = [
      escapeHtml(t.name.toUpperCase()),
      s.registrationOpen ? `REGISTRATION OPEN — ${s.registeredTeams}/${s.totalTeams} TEAMS IN` : `REGISTRATION CLOSED`,
      `PRIZE POOL: ${escapeHtml(fmtMoney(p.totalPool))}`,
      `LIVE ON YOUTUBE`,
      p.isFreeEntry ? "FREE ENTRY" : `ENTRY FEE: ${escapeHtml(fmtMoney(p.entryFee))}`,
      `ORGANIZED BY ${CONFIG.organizer.name.toUpperCase()}`,
    ];
    const track = $("#tickerTrack");
    const full = [...items, ...items];
    track.innerHTML = full.map((i) => `<span>${i}</span>`).join("");
  }

  /* ----------------------------------------------------------------------
     COUNTDOWN
     -------------------------------------------------------------------- */
  let countdownDone = false;
  function initCountdown() {
    const target = new Date(CONFIG.schedule.startDateISO).getTime();
    const dEl = $("#cdDays"), hEl = $("#cdHours"), mEl = $("#cdMins"), sEl = $("#cdSecs");
    const offlineCd = $("#offlineCountdown");

    $("#heroDateLabel").textContent = new Date(target).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    }) + " " + CONFIG.schedule.timezoneLabel;

    function tick() {
      const now = Date.now();
      let diff = target - now;
      if (diff <= 0) {
        diff = 0;
        if (!countdownDone) {
          countdownDone = true;
          onTournamentGoesLive();
        }
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const pad = (n) => String(n).padStart(2, "0");
      if (dEl) dEl.textContent = pad(days);
      if (hEl) hEl.textContent = pad(hours);
      if (mEl) mEl.textContent = pad(mins);
      if (sEl) sEl.textContent = pad(secs);
      $$(".cd-mini-d").forEach((e) => (e.textContent = pad(days)));
      $$(".cd-mini-h").forEach((e) => (e.textContent = pad(hours)));
      $$(".cd-mini-m").forEach((e) => (e.textContent = pad(mins)));
      $$(".cd-mini-s").forEach((e) => (e.textContent = pad(secs)));
    }
    tick();
    setInterval(tick, 1000);
  }

  function onTournamentGoesLive() {
    CONFIG.tournament.status = "live";
    renderStatusPills();
    renderWatchPlayer();
    toast("🔴 The tournament is now LIVE!");
    const panel = $("#heroPanel");
    panel.style.animation = "none";
    requestAnimationFrame(() => {
      panel.style.boxShadow = "0 0 0 2px var(--danger), 0 30px 80px -30px rgba(255,92,92,0.5)";
    });
  }

  /* ----------------------------------------------------------------------
     STATUS PILLS (hero + watch section)
     -------------------------------------------------------------------- */
  function renderStatusPills() {
    const live = CONFIG.tournament.status === "live";
    const pills = [$("#heroStatusPill"), $("#watchStatusPill")];
    pills.forEach((pill) => {
      if (!pill) return;
      pill.classList.toggle("is-live", live);
      pill.classList.toggle("is-upcoming", !live);
      pill.innerHTML = `<span class="live-dot"></span> ${live ? "Live Now" : "Upcoming Live"}`;
    });
    const heroBtn = $("#watchLiveBtnHero");
    if (heroBtn) heroBtn.textContent = live ? "▶ Watch Live Now" : "▶ Watch Live";
  }

  /* ----------------------------------------------------------------------
     YOUTUBE WATCH SECTION
     -------------------------------------------------------------------- */
  function renderWatchPlayer() {
    const holder = $("#watchPlayer");
    const y = CONFIG.youtube;
    const live = CONFIG.tournament.status === "live";
    const hasVideo = !isPlaceholder(y.videoId);

    if (live && hasVideo) {
      // youtube_video_id is admin-editable (tournament-settings.js) and was
      // rendered here unescaped — a compromised or careless admin account
      // could break out of the src="..." attribute and inject markup that
      // runs in every visitor's browser. Validate it looks like an actual
      // YouTube video ID (11 chars, [A-Za-z0-9_-]) and escape it regardless,
      // same defense-in-depth pattern used for registration_code.
      const idPattern = /^[A-Za-z0-9_-]{6,20}$/;
      const safeId = idPattern.test(y.videoId) ? escapeHtml(y.videoId) : "";
      if (safeId) {
        holder.innerHTML = `<iframe src="https://www.youtube.com/embed/${safeId}?autoplay=0&rel=0" title="Live stream" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      } else {
        holder.innerHTML = `<div class="watch-offline"><h3>Video ID not valid</h3><p>Check CONFIG.youtube.videoId / the tournament's YouTube Video ID setting.</p></div>`;
      }
    } else {
      holder.innerHTML = `
        <div class="watch-offline">
          <span class="status-pill is-upcoming"><span class="live-dot"></span> Stream Starting Soon</span>
          <h3>The broadcast hasn't started yet</h3>
          <p>${hasVideo ? "The player will switch on automatically once the tournament goes live." : "YouTube video ID not configured yet — set CONFIG.youtube.videoId in config.js."}</p>
          <div class="offline-countdown">
            <span class="cd-mini"><span class="cd-mini-d">00</span>d</span>
            <span class="cd-mini"><span class="cd-mini-h">00</span>h</span>
            <span class="cd-mini"><span class="cd-mini-m">00</span>m</span>
            <span class="cd-mini"><span class="cd-mini-s">00</span>s</span>
          </div>
        </div>`;
    }

    $("#watchTitle").textContent = `${CONFIG.tournament.name} — Live Stream`;
    const viewerCount = $("#viewerCount");
    if (live) {
      viewerCount.innerHTML = `<span class="live-dot"></span> <span class="demo-badge">Demo Count</span> 1.2K watching`;
    } else {
      viewerCount.textContent = "";
    }

    const channelUrl = isPlaceholder(y.channelUrl) ? "#" : y.channelUrl;
    $("#subscribeBtn").href = channelUrl;
    $("#watchOnYtBtn").href = hasVideo ? `https://youtube.com/watch?v=${y.videoId}` : channelUrl;
    if (channelUrl === "#") {
      $("#subscribeBtn").addEventListener("click", (e) => {
        e.preventDefault();
        toast("Organizer hasn't linked a YouTube channel yet.", true);
      });
    }
  }

  /* ----------------------------------------------------------------------
     HERO FACTS / INFO GRID / STATS STRIP
     -------------------------------------------------------------------- */
  function renderOverview() {
    const t = CONFIG.tournament, p = CONFIG.prize, s = CONFIG.slots;

    $("#factPrize").textContent = fmtMoney(p.totalPool);
    $("#factEntry").textContent = p.isFreeEntry ? "Free" : fmtMoney(p.entryFee);
    $("#factSlots").textContent = `${s.registeredTeams}/${s.totalTeams}`;

    $("#hpGame").textContent = t.game;
    $("#hpMode").textContent = t.mode;
    $("#hpReg").textContent = s.registrationOpen ? "Open" : "Closed";
    $("#hpSlotsText").textContent = `${s.registeredTeams} / ${s.totalTeams} teams`;
    requestAnimationFrame(() => {
      $("#slotsBarFill").style.width = Math.min(100, (s.registeredTeams / s.totalTeams) * 100) + "%";
    });

    // stats strip with animated counters
    const stats = [
      { num: CONFIG.stats.players, suffix: "+", label: "Players" },
      { num: CONFIG.stats.teams, suffix: "", label: "Teams" },
      { num: CONFIG.stats.prizePool, suffix: "", label: "Prize Pool", money: true },
      { num: CONFIG.stats.competitiveRating, suffix: "%", label: "Competitive" },
    ];
    const strip = $("#statsStrip");
    strip.innerHTML = stats
      .map(
        (s, i) => `
      <div class="stat-cell">
        ${CONFIG.stats.isDemo ? '<span class="demo-badge">Demo</span>' : ""}
        <div class="stat-num" data-count="${s.num}" data-suffix="${s.suffix}" data-money="${s.money ? "1" : "0"}">0</div>
        <div class="stat-label">${s.label}</div>
      </div>`
      )
      .join("");

    // info grid
    const info = [
      { k: "Tournament", v: t.name },
      { k: "Game", v: t.game },
      { k: "Mode", v: t.mode },
      { k: "Date", v: new Date(CONFIG.schedule.startDateISO).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
      { k: "Time", v: new Date(CONFIG.schedule.startDateISO).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) + " " + CONFIG.schedule.timezoneLabel },
      { k: "Entry Fee", v: p.isFreeEntry ? "Free" : fmtMoney(p.entryFee) },
      { k: "Prize Pool", v: fmtMoney(p.totalPool) },
      { k: "Total Slots", v: s.totalTeams + " Teams" },
      { k: "Registered", v: s.registeredTeams + " Teams" },
      { k: "Status", v: t.status === "live" ? "Live Now" : "Upcoming" },
    ];
    $("#infoGrid").innerHTML = info
      .map(
        (item) => `
      <div class="card">
        <div class="hero-fact-label" style="margin-bottom:8px;">${item.k}</div>
        <div style="font-family:var(--f-display);font-size:22px;">${escapeHtml(item.v)}</div>
      </div>`
      )
      .join("");
  }

  function animateCounters() {
    const els = $$("[data-count]");
    els.forEach((el) => {
      if (el.dataset.animated) return;
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || "";
      const isMoney = el.dataset.money === "1";
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !el.dataset.animated) {
              el.dataset.animated = "1";
              const dur = 1400;
              const start = performance.now();
              function step(now) {
                const p = Math.min(1, (now - start) / dur);
                const eased = 1 - Math.pow(1 - p, 3);
                const val = Math.floor(eased * target);
                el.textContent = (isMoney ? CONFIG.prize.currency + " " : "") + val.toLocaleString("en-US") + suffix;
                if (p < 1) requestAnimationFrame(step);
              }
              requestAnimationFrame(step);
              io.unobserve(el);
            }
          });
        },
        { threshold: 0.4 }
      );
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------------------
     REGISTRATION FORM
     -------------------------------------------------------------------- */
  let playerCount = 0;
  function addPlayerRow() {
    playerCount++;
    const wrap = document.createElement("div");
    wrap.className = "player-row";
    wrap.innerHTML = `
      <div class="field">
        <label>Player ${playerCount} Name</label>
        <input type="text" class="player-name" placeholder="In-game name">
      </div>
      <div class="field">
        <label>Player ${playerCount} UID</label>
        <input type="text" class="player-uid" inputmode="numeric" placeholder="Free Fire UID">
        <div class="err"></div>
      </div>
      <button type="button" class="rm" aria-label="Remove player">✕</button>`;
    wrap.querySelector(".rm").addEventListener("click", () => wrap.remove());
    $("#playerRows").appendChild(wrap);
  }

  function validateField(id, condition, msg) {
    const field = $("#" + id).closest(".field");
    const err = field.querySelector(".err");
    if (!condition) {
      field.classList.add("has-error");
      err.textContent = msg;
      return false;
    }
    field.classList.remove("has-error");
    err.textContent = "";
    return true;
  }

  // Same as validateField(), but for the dynamically-created Player 2/3/4
  // UID inputs, which don't have stable IDs to look up by (see addPlayerRow()).
  function validatePlayerUidField(fieldEl, condition, msg) {
    const err = fieldEl.querySelector(".err");
    if (!condition) {
      fieldEl.classList.add("has-error");
      if (err) err.textContent = msg;
      return false;
    }
    fieldEl.classList.remove("has-error");
    if (err) err.textContent = "";
    return true;
  }

  function initPaymentCard() {
    const card = $("#payCard");
    if (!card) return;
    const p = CONFIG.prize;

    if (p.isFreeEntry) {
      card.style.display = "none";
      $("#txnId") && ($("#txnId").required = false);
      $("#payerNumber") && ($("#payerNumber").required = false);
      return;
    }

    const pay = CONFIG.payment || {};
    const paymentConfigured = !isPlaceholder(pay.accountNumber) && !isPlaceholder(pay.accountName);

    if (!paymentConfigured) {
      card.innerHTML = `<p style="color:var(--text-3);font-family:var(--f-mono);font-size:13px;">
        Payment details haven't been configured yet. Registration is temporarily unavailable — check back soon.
      </p>`;
      const submitBtn = $("#regSubmitBtn");
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Registration unavailable"; }
      return;
    }

    $("#payMethodBadge").textContent = pay.method || "Payment";
    $("#payAmount").textContent = fmtMoney(p.entryFee);
    $("#payNumber").textContent = pay.accountNumber;
    $("#payAccountName").textContent = pay.accountName;
    $("#payInstructions").textContent = pay.instructions || "";

    $("#payCopyBtn").addEventListener("click", () => {
      const num = (pay.accountNumber || "").replace(/\D/g, "");
      navigator.clipboard.writeText(num).then(() => {
        const btn = $("#payCopyBtn");
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        toast("Easypaisa number copied.");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1800);
      });
    });
  }

  function initRegistrationForm() {
    initPaymentCard();
    for (let i = 0; i < 3; i++) addPlayerRow();
    $("#addPlayerBtn").addEventListener("click", addPlayerRow);

    $("#regForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const teamName = $("#teamName").value.trim();
      const captainName = $("#captainName").value.trim();
      const ign = $("#ign").value.trim();
      const uid = $("#uid").value.trim();
      const whatsapp = $("#whatsapp").value.trim();
      const email = $("#email").value.trim();
      const city = $("#city").value.trim();
      const txnId = $("#txnId") ? $("#txnId").value.trim() : "";
      const payerNumber = $("#payerNumber") ? $("#payerNumber").value.trim() : "";
      const isFreeEntry = CONFIG.prize.isFreeEntry;

      let ok = true;
      ok = validateField("teamName", teamName.length >= 3, "Team name must be at least 3 characters.") && ok;
      ok = validateField("captainName", captainName.length >= 2, "Enter the captain's full name.") && ok;
      ok = validateField("ign", ign.length >= 2, "Enter a valid in-game name.") && ok;
      ok = validateField("uid", /^\d{6,12}$/.test(uid), "UID should be 6–12 digits.") && ok;
      ok = validateField("whatsapp", /^[\d+\-\s]{9,15}$/.test(whatsapp), "Enter a valid WhatsApp number.") && ok;
      ok = validateField("email", email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter a valid email address.") && ok;
      ok = validateField("city", city.length >= 2, "Enter your city.") && ok;
      if (!isFreeEntry) {
        ok = validateField("txnId", txnId.length >= 4, "Enter your Easypaisa Transaction ID.") && ok;
        ok = validateField("payerNumber", /^[\d+\-\s]{9,15}$/.test(payerNumber), "Enter the number payment was sent from.") && ok;
      }

      // Player 2/3/4 UID validation. The captain (Player 1) is already
      // validated above via #uid. Exactly 3 additional player rows are
      // rendered by addPlayerRow() in initRegistrationForm() — captain + 3
      // = 4 players total, per the squad size.
      const playerRowEls = Array.from(document.querySelectorAll(".player-row"));
      playerRowEls.forEach((row, idx) => {
        const uidInput = row.querySelector(".player-uid");
        const uidField = uidInput.closest(".field");
        const playerNum = idx + 2; // captain is Player 1
        ok = validatePlayerUidField(
          uidField,
          /^\d{6,12}$/.test(uidInput.value.trim()),
          `Player ${playerNum} UID is required.`
        ) && ok;
      });

      if (!ok) {
        toast("Please fix the highlighted fields.", true);
        return;
      }

      if (!CONFIG.slots.registrationOpen) {
        toast("Registration is currently closed.", true);
        return;
      }
      if (CONFIG.slots.registeredTeams >= CONFIG.slots.totalTeams) {
        toast("Registration is full — no slots remaining.", true);
        return;
      }

      const submitBtn = $("#regSubmitBtn");

   submitBtn.disabled = true;
submitBtn.textContent = "Submitting...";

const regId = "AFFT-" + Date.now().toString(36).toUpperCase().slice(-6);

// Collect players
const players = [];

document.querySelectorAll(".player-row").forEach((row) => {
    const name = row.querySelector(".player-name").value;
    const uid = row.querySelector(".player-uid").value;

    players.push({
        name,
        uid
    });
});

if (!window.db) {
  submitBtn.disabled = false;
  submitBtn.textContent = "Submit Registration";
  toast("Registration is temporarily unavailable. Please try again in a moment.", true);
  return;
}

const { data, error } = await window.db
.from("registrations")
.insert([
{
registration_code: regId,
tournament_id: window.ACTIVE_TOURNAMENT_ID || null,
team_name: teamName,
captain_name: captainName,
captain_ign: ign,
captain_uid: uid,
whatsapp: whatsapp,
email: email,
city: city,
player_count: players.length,
players: players,
entry_fee_amount: isFreeEntry ? 0 : CONFIG.prize.entryFee,
payment_transaction_id: isFreeEntry ? null : txnId,
payment_sender_number: isFreeEntry ? null : payerNumber,
payment_status: isFreeEntry ? "unpaid" : "pending_verification"
}
]);

submitBtn.disabled = false;
submitBtn.textContent = "Submit Registration";

if (error) {
    console.error(error);
    // Never show raw Postgres/Supabase error text to the user.
    let friendly = "Something went wrong submitting your registration. Please try again.";
    if (error.code === "23505") {
      friendly = "It looks like this team or transaction ID has already been registered.";
    } else if (error.code === "42501") {
      friendly = "Registration is closed or the tournament is full.";
    } else if (error.message && /network|fetch/i.test(error.message)) {
      friendly = "Network error — check your connection and try again.";
    }
    toast(friendly, true);
    return;
}

$("#modalRegId").textContent = regId;
$("#modalTeamName").textContent = teamName;
$("#modalCaptainName").textContent = captainName;
$("#modalTournamentName").textContent = CONFIG.tournament.name;

openModal($("#regModal"));

$("#regForm").reset();
$("#playerRows").innerHTML = "";
playerCount = 0;

for (let i = 0; i < 3; i++) addPlayerRow();
    });
  }

  /* ----------------------------------------------------------------------
     MODAL
     -------------------------------------------------------------------- */
  function openModal(modal) {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeModal(modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }
  function initModal() {
    const modal = $("#regModal");
    $("#regModalClose").addEventListener("click", () => closeModal(modal));
    $("#regModalOkBtn").addEventListener("click", () => closeModal(modal));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal(modal);
    });
  }

  /* ----------------------------------------------------------------------
     LEADERBOARD
     -------------------------------------------------------------------- */
  let lbSortKey = "totalPts";
  let lbSortDir = "desc";
  let lbQuery = "";

  function renderPodium() {
    const top3 = [...CONFIG.leaderboard.teams].sort((a, b) => b.totalPts - a.totalPts).slice(0, 3);
    const medals = ["🥇", "🥈", "🥉"];
    const classes = ["p1", "p2", "p3"];
    if (!top3.length) {
      $("#podium").innerHTML = `<div class="lb-empty">Standings will appear here once the admin publishes results.</div>`;
      return;
    }
    $("#podium").innerHTML = top3
      .map(
        (team, i) => `
      <div class="podium-card ${classes[i]}">
        <div class="podium-medal">${medals[i]}</div>
        <div class="podium-team">${escapeHtml(team.team)}</div>
        <div class="podium-pts"><b>${team.totalPts}</b> pts · ${team.kills} kills</div>
      </div>`
      )
      .join("");
  }

  function renderLeaderboard() {
    if (!CONFIG.leaderboard.teams.length) {
      $("#lbBody").innerHTML = `<tr><td colspan="6" class="lb-empty">No published standings yet. Check back once matches have been scored.</td></tr>`;
      return;
    }
    let rows = CONFIG.leaderboard.teams.filter((t) => t.team.toLowerCase().includes(lbQuery.toLowerCase()));
    rows.sort((a, b) => {
      const dir = lbSortDir === "asc" ? 1 : -1;
      return a[lbSortKey] > b[lbSortKey] ? dir : a[lbSortKey] < b[lbSortKey] ? -dir : 0;
    });
    const body = $("#lbBody");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="lb-empty">No teams match "${escapeHtml(lbQuery)}"</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map(
        (t) => `
      <tr>
        <td class="rank-cell">#${t.rank}</td>
        <td>${escapeHtml(t.team)}</td>
        <td>${t.matches}</td>
        <td>${t.kills}</td>
        <td>${t.placementPts}</td>
        <td class="pts-cell">${t.totalPts}</td>
      </tr>`
      )
      .join("");
  }

  function initLeaderboard() {
    renderPodium();
    renderLeaderboard();
    $("#lbDemoBadge").style.display = CONFIG.leaderboard.isDemo ? "inline-flex" : "none";
    $("#lbUpdatedText").textContent = CONFIG.leaderboard.lastUpdatedAt
      ? `Updated ${new Date(CONFIG.leaderboard.lastUpdatedAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}`
      : "Not published yet";

    $("#lbSearch").addEventListener("input", (e) => {
      lbQuery = e.target.value;
      renderLeaderboard();
    });

    $("#lbSorts").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      $$(".chip", $("#lbSorts")).forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      lbSortKey = chip.dataset.sort;
      renderLeaderboard();
    });

    $$(".lb-table th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (lbSortKey === key) {
          lbSortDir = lbSortDir === "asc" ? "desc" : "asc";
        } else {
          lbSortKey = key;
          lbSortDir = "desc";
        }
        renderLeaderboard();
      });
    });
  }

  /* ----------------------------------------------------------------------
     MATCH CENTER
     -------------------------------------------------------------------- */
  function renderMatches() {
    const grid = $("#matchGrid");
    if (!CONFIG.matches.list.length) {
      grid.innerHTML = `<div class="lb-empty">No matches scheduled yet. Check back closer to tournament day.</div>`;
      return;
    }
    grid.innerHTML = CONFIG.matches.list
      .map(
        (m) => `
      <div class="match-card ${m.status === "live" ? "is-live" : ""}">
        <div class="match-num">${escapeHtml(m.label)}</div>
        <div class="match-map">${escapeHtml(m.map)}</div>
        <div class="match-detail">${escapeHtml(m.mode)} · Starts ${escapeHtml(m.time)}</div>
        <div class="match-status-row">
          <span class="status-tag ${m.status}">${m.status === "live" ? "● Live" : m.status === "completed" ? "✓ Completed" : "Upcoming"}</span>
          ${CONFIG.matches.isDemo ? '<span class="demo-badge">Demo</span>' : ""}
        </div>
      </div>`
      )
      .join("");
  }

  /* ----------------------------------------------------------------------
     SCHEDULE TIMELINE
     -------------------------------------------------------------------- */
  function renderTimeline() {
    const stages = CONFIG.schedule.stages;
    const currentIdx = stages.findIndex((s) => s.id === CONFIG.schedule.currentStageId);
    const html = stages
      .map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current open" : "";
        return `
        <div class="tl-item ${state}" data-idx="${i}">
          <div class="tl-dot"></div>
          <div class="tl-head">${s.label} ${i === currentIdx ? '<span class="tl-tag">Now</span>' : ""}</div>
          <div class="tl-detail">${s.detail}</div>
        </div>`;
      })
      .join("");
    const timeline = $("#timeline");
    timeline.innerHTML = html;
    $$(".tl-item", timeline).forEach((item) => {
      item.addEventListener("click", () => item.classList.toggle("open"));
    });
  }

  /* ----------------------------------------------------------------------
     ROOM DETAILS
     -------------------------------------------------------------------- */
  function renderRoom() {
    const r = CONFIG.room;
    const card = $("#roomCard");
    if (!r.released) {
      card.innerHTML = `
        <div class="room-locked-icon">🔒</div>
        <h3>Room Details Locked</h3>
        <p>Room ID and password will appear here once released by the organizer, shortly before your match. Registered captains are also notified directly.</p>`;
      return;
    }
    card.innerHTML = `
      <div class="room-locked-icon">🔓</div>
      <h3>Room Details — ${escapeHtml(r.matchNumber)}</h3>
      <p>Join promptly. Room closes 3 minutes after release.</p>
      <div class="room-grid">
        <div class="room-field"><div class="k">Room ID</div><div class="v">${escapeHtml(r.roomId)} <button class="copy-btn" data-copy="${escapeHtml(r.roomId)}">Copy</button></div></div>
        <div class="room-field"><div class="k">Password</div><div class="v">${escapeHtml(r.password)} <button class="copy-btn" data-copy="${escapeHtml(r.password)}">Copy</button></div></div>
        <div class="room-field"><div class="k">Map</div><div class="v">${escapeHtml(r.map)}</div></div>
      </div>`;
    $$(".copy-btn", card).forEach((btn) =>
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(btn.dataset.copy).then(() => toast("Copied to clipboard"));
      })
    );
  }

  /* ----------------------------------------------------------------------
     RULEBOOK + FAQ (accordions)
     -------------------------------------------------------------------- */
  const RULES = [
    { title: "General Rules", items: [
      "All players must use their registered Free Fire UID for the entire tournament.",
      "Teams must be ready to join the room within 3 minutes of ID release.",
      "The organizer's decisions on rule interpretation are final.",
    ]},
    { title: "Team Rules", items: [
      "Each squad consists of 4 main players and up to 1 substitute.",
      "Substitutes must be registered before the tournament starts — no mid-tournament swaps.",
      "Playing under someone else's registered UID results in disqualification.",
    ]},
    { title: "Gameplay Rules", items: [
      "Squad mode, classic battle royale rules apply.",
      "Teaming with opposing squads is strictly forbidden.",
      "Exploiting map glitches or out-of-bounds areas is not allowed.",
    ]},
    { title: "Anti-Cheat Rules", items: [
      "No hacks, aimbots, wallhacks, macros, or unauthorized third-party tools.",
      "No emulator settings that provide an unfair advantage over mobile players, where mode-restricted.",
      "Suspected cheaters may be asked for a live verification check.",
    ]},
    { title: "Disqualification Rules", items: [
      "Confirmed cheating results in immediate disqualification and forfeiture of prizes.",
      "Toxic behavior or harassment of other players/organizers results in a warning, then removal.",
      "No-shows at check-in forfeit the team's slot to the waitlist.",
    ]},
    { title: "Match Rules", items: [
      "Matches start on time — late joiners are not guaranteed a slot in that match.",
      "Disconnections mid-match are not replayed unless caused by a verified server-side issue.",
      "Points are calculated from placement + kills as shown on the leaderboard.",
    ]},
    { title: "Prize Rules", items: [
      "Prizes are paid out to the winning team's designated captain.",
      "Winning teams must provide accurate payout details within 48 hours of results being finalized.",
      "Disqualified teams forfeit any prize money regardless of final placement.",
    ]},
    { title: "Dispute Rules", items: [
      "Disputes must be raised within 30 minutes of match end, with evidence (clip/screenshot).",
      "The organizer reviews evidence before making a final ruling.",
      "Decisions made after dispute review are final and not open to further appeal.",
    ]},
  ];

  const FAQS = [
    { q: "How do I register?", a: "Scroll to the Register section, fill in your team and player details, and submit. You'll get a Registration ID instantly." },
    { q: "What is the entry fee?", a: CONFIG.prize.isFreeEntry ? "Entry is free for this tournament." : `Entry fee is ${fmtMoney(CONFIG.prize.entryFee)} per team.` },
    { q: "When is the tournament?", a: `The tournament starts ${new Date(CONFIG.schedule.startDateISO).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })} ${CONFIG.schedule.timezoneLabel}.` },
    { q: "Where can I watch the tournament?", a: "Every match streams live on YouTube — see the Watch Live section on this page." },
    { q: "How do I get the room ID?", a: "Room ID and password are posted in the Room Details section and sent to your captain shortly before your match." },
    { q: "What happens if I disconnect?", a: "Matches are not replayed for individual disconnections unless it's a verified server-wide issue. See the Match Rules." },
    { q: "What are the anti-cheat rules?", a: "No hacks, aimbots, macros, or unauthorized tools of any kind. Suspected cheaters may be asked for a live check. See the full Rulebook." },
    { q: "How are winners selected?", a: "Winners are decided by total points (placement + kills) across all matches, shown live on the Leaderboard." },
    { q: "When will prizes be distributed?", a: "Prizes are distributed after final results are verified — see the Schedule section for the current stage." },
  ];

  function renderAccordion(containerId, items, isRules) {
    const container = $(containerId);
    container.innerHTML = items
      .map((item, i) => {
        const title = isRules ? item.title : item.q;
        const bodyHtml = isRules
          ? `<ul>${item.items.map((r) => `<li>${r}</li>`).join("")}</ul>`
          : `<p style="margin:0;">${item.a}</p>`;
        return `
        <div class="acc-item" data-idx="${i}">
          <button class="acc-trigger" aria-expanded="false">
            <span>${title}</span>
            <span class="plus">+</span>
          </button>
          <div class="acc-panel"><div class="acc-panel-inner">${bodyHtml}</div></div>
        </div>`;
      })
      .join("");

    $$(".acc-trigger", container).forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const item = trigger.closest(".acc-item");
        const wasOpen = item.classList.contains("open");
        item.classList.toggle("open", !wasOpen);
        trigger.setAttribute("aria-expanded", String(!wasOpen));
      });
    });
  }

  /* ----------------------------------------------------------------------
     FAIR PLAY
     -------------------------------------------------------------------- */
  function renderFairPlay() {
    const points = [
      "Zero tolerance for cheating, hacks, or scripts of any kind",
      "No aimbots, wallhacks, or unauthorized third-party tools",
      "No teaming with rival squads during matches",
      "Every ruling is backed by clip or screenshot evidence, not guesswork",
      "Admin decisions are final but always explained on request",
      "Fair competition for every registered team, no exceptions",
    ];
    $("#fairplayGrid").innerHTML = points
      .map((p) => `<div class="fp-item"><span class="fp-check">✕</span><p>${p}</p></div>`)
      .join("");
  }

  /* ----------------------------------------------------------------------
     PRIZE POOL
     -------------------------------------------------------------------- */
  function renderPrizes() {
    $("#prizeTotalInline").textContent = fmtMoney(CONFIG.prize.totalPool);
    $("#prizeDemoBadge").style.display = CONFIG.prize.isDemo ? "inline-flex" : "none";
    const medals = { gold: "🥇", silver: "🥈", bronze: "🥉" };
    $("#prizePodium").innerHTML = CONFIG.prize.breakdown
      .map(
        (p) => `
      <div class="prize-card ${p.icon}">
        <div class="prize-medal">${medals[p.icon]}</div>
        <div class="prize-place">${escapeHtml(p.place)}</div>
        <div class="prize-amount">${escapeHtml(fmtMoney(p.amount))}</div>
      </div>`
      )
      .join("");
    $("#bonusGrid").innerHTML = CONFIG.prize.bonusAwards
      .map(
        (b) => `
      <div class="card">
        <div class="card-icon">★</div>
        <h3>${escapeHtml(b.title)}</h3>
        <p>${escapeHtml(b.detail)}</p>
      </div>`
      )
      .join("");
  }

  /* ----------------------------------------------------------------------
     SOCIAL / COMMUNITY
     -------------------------------------------------------------------- */
  function renderSocial() {
    const icons = { youtube: "▶", whatsapp: "💬", discord: "🎮", instagram: "📷", tiktok: "🎵", facebook: "👍" };
    const labels = { youtube: "YouTube", whatsapp: "WhatsApp", discord: "Discord", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
    const grid = $("#socialGrid");
    const entries = Object.entries(CONFIG.social).filter(([, url]) => url && !isPlaceholder(url));
    if (!entries.length) {
      grid.innerHTML = `<p style="color:var(--text-3);font-family:var(--f-mono);font-size:13px;">Social links haven't been added yet — set them in config.js.</p>`;
      return;
    }
    grid.innerHTML = entries
      .map(
        ([key, url]) => `
      <a class="social-btn social-${key}" href="${url}" target="_blank" rel="noopener" aria-label="Follow on ${labels[key]}">
        <span class="ic">${icons[key]}</span>
        <span>${labels[key]}</span>
      </a>`
      )
      .join("");
  }

  /* ----------------------------------------------------------------------
     SHARE
     -------------------------------------------------------------------- */
  async function shareTournament() {
    const shareData = { title: CONFIG.share.title, text: `Check out the ${CONFIG.tournament.name} — live on YouTube!`, url: CONFIG.share.url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        /* user cancelled — no-op */
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        toast("Link copied!");
      } catch (e) {
        toast("Couldn't copy the link.", true);
      }
    }
  }

  function initShare() {
    $("#shareStreamBtn").addEventListener("click", shareTournament);
    $("#shareFooterBtn").addEventListener("click", shareTournament);
  }

  /* ----------------------------------------------------------------------
     MULTI-TENANT SLUG RESOLUTION
     If the URL is /t/<slug> (or ?t=<slug> on hosts without a rewrite
     rule configured yet — see _redirects / vercel.json), that specific
     tournament is loaded instead of the single legacy is_active=true one.
     Returns null when there's no slug in the URL, so the root site
     (index.html with no path segment) behaves exactly as before.
     -------------------------------------------------------------------- */
  function getRequestedTournamentSlug() {
    const pathMatch = window.location.pathname.match(/\/t\/([a-z0-9-]+)\/?$/i);
    if (pathMatch) return pathMatch[1];
    const qsSlug = new URLSearchParams(window.location.search).get("t");
    return qsSlug || null;
  }

  // Applies an organization's white-label branding (name, logo, colors,
  // socials) to CONFIG and to the page's CSS variables. Only called when
  // a specific tournament was resolved by slug — the default legacy site
  // never calls this, so its look is untouched.
  async function hydrateBranding(organizationId, tournamentName) {
    if (!organizationId) return;
    try {
      const { data: branding } = await window.db
        .from("organization_branding")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (!branding) return;

      if (branding.primary_color) {
        document.documentElement.style.setProperty("--ember", branding.primary_color);
      }
      if (branding.secondary_color) {
        document.documentElement.style.setProperty("--cyan", branding.secondary_color);
      }

      if (branding.socials && typeof branding.socials === "object") {
        CONFIG.social = Object.assign({}, CONFIG.social, branding.socials);
      }

      // Swap the brand mark/name in nav + footer to the organizer's own
      // tournament, so a white-labeled page doesn't say "ADAN FF".
      $$(".brand-name").forEach((el) => { el.textContent = tournamentName || el.textContent; });
      if (branding.logo_url) {
        $$(".brand-mark").forEach((el) => {
          const img = document.createElement("img");
          img.src = branding.logo_url;
          img.alt = tournamentName || "Organizer logo";
          img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;";
          el.textContent = "";
          el.appendChild(img);
        });
      }
    } catch (err) {
      console.error("Branding hydration failed, falling back to default look.", err);
    }
  }

  /* ----------------------------------------------------------------------
     LIVE DATABASE HYDRATION
     Pulls the active tournament + prize pool + entry fee + team slots +
     registration status from Supabase and overwrites the matching CONFIG
     fields in place, so every render function below (which all read from
     CONFIG) automatically shows live data instead of the config.js demo
     values, with zero changes needed to those functions.
     -------------------------------------------------------------------- */
  async function hydrateConfigFromDatabase() {
    if (!window.db) return; // supabase.js not loaded — fall back to config.js only

    try {
      const requestedSlug = getRequestedTournamentSlug();

      const { data: tournament } = requestedSlug
        ? await window.db.from("tournaments").select("*").eq("slug", requestedSlug).maybeSingle()
        : await window.db.from("tournaments").select("*").eq("is_active", true).single();

      if (!tournament) {
        if (requestedSlug) {
          // A slug was requested but doesn't exist (or belongs to a
          // suspended org, once that check exists) — say so plainly
          // instead of silently showing the legacy demo tournament.
          CONFIG.tournament.name = "Tournament Not Found";
          CONFIG.tournament.status = "upcoming";
          toast("No tournament found for this link.", true);
        }
        return;
      }

      window.ACTIVE_TOURNAMENT_ID = tournament.id;

      CONFIG.tournament.name = tournament.name || CONFIG.tournament.name;
      CONFIG.tournament.status = tournament.status || CONFIG.tournament.status;
      CONFIG.tournament.isDemoStatus = false;

      if (tournament.organization_id) {
        await hydrateBranding(tournament.organization_id, tournament.name);
      }

      if (tournament.start_date) {
        CONFIG.schedule.startDateISO = tournament.start_date;
      }

      if (tournament.youtube_video_id && !isPlaceholder(tournament.youtube_video_id)) {
        CONFIG.youtube.videoId = tournament.youtube_video_id;
      }
      if (tournament.youtube_channel_url) {
        CONFIG.youtube.channelUrl = tournament.youtube_channel_url;
      }

      CONFIG.prize.entryFee = Number(tournament.entry_fee) || 0;
      CONFIG.prize.isFreeEntry = !!tournament.is_free_entry;
      CONFIG.slots.totalTeams = tournament.total_team_slots || CONFIG.slots.totalTeams;
      CONFIG.slots.isDemo = false;

      const [prizePoolRes, prizeDistRes, regSettingsRes, teamsCountRes, scheduleRes, leaderboardRes, matchesRes] = await Promise.all([
        window.db.from("prize_pools").select("*").eq("tournament_id", tournament.id).maybeSingle(),
        window.db.from("prize_distributions").select("*").eq("tournament_id", tournament.id).order("sort_order", { ascending: true }),
        window.db.from("registration_settings").select("*").eq("tournament_id", tournament.id).maybeSingle(),
        window.db.from("teams").select("id", { count: "exact", head: true }).eq("tournament_id", tournament.id).eq("status", "approved"),
        window.db.from("tournament_schedules").select("*").eq("tournament_id", tournament.id).maybeSingle(),
        // Only PUBLISHED leaderboard rows are readable by anon users (see RLS policy on `leaderboard`).
        window.db.from("leaderboard").select("*, teams(team_name)").eq("tournament_id", tournament.id).eq("is_published", true).order("rank", { ascending: true }),
        window.db.from("matches").select("*").eq("tournament_id", tournament.id).order("match_number", { ascending: true }),
      ]);

      // LEADERBOARD — replace the config.js demo rows with real, published
      // standings. If nothing has been published yet, show an honest empty
      // state instead of the fake demo teams.
      if (leaderboardRes && !leaderboardRes.error) {
        CONFIG.leaderboard.teams = (leaderboardRes.data || []).map((row) => ({
          rank: row.rank || 0,
          team: (row.teams && row.teams.team_name) || "Unknown Team",
          matches: row.matches_played || 0,
          kills: row.kills || 0,
          placementPts: row.placement_points || 0,
          totalPts: row.total_points || 0,
        }));
        CONFIG.leaderboard.isDemo = false;
        CONFIG.leaderboard.lastUpdatedAt = leaderboardRes.data && leaderboardRes.data.length
          ? leaderboardRes.data.reduce((latest, r) => (r.updated_at > latest ? r.updated_at : latest), leaderboardRes.data[0].updated_at)
          : null;
      }

      // MATCH CENTER — replace demo fixtures with real scheduled matches.
      if (matchesRes && !matchesRes.error) {
        CONFIG.matches.list = (matchesRes.data || []).map((m) => ({
          id: m.id,
          label: m.label,
          map: m.map || "TBA",
          mode: m.mode || "Squad",
          time: m.scheduled_time
            ? new Date(m.scheduled_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) + " " + CONFIG.schedule.timezoneLabel
            : "TBA",
          status: ["live", "completed"].includes(m.status) ? m.status : "upcoming",
        }));
        CONFIG.matches.isDemo = false;
      }

      if (prizePoolRes.data) {
        CONFIG.prize.totalPool = Number(prizePoolRes.data.total_pool) || 0;
        CONFIG.prize.currency = prizePoolRes.data.currency || CONFIG.prize.currency;
        CONFIG.stats.prizePool = CONFIG.prize.totalPool;
      }
      CONFIG.prize.isDemo = false;

      if (prizeDistRes.data && prizeDistRes.data.length > 0) {
        const podium = prizeDistRes.data.filter(d => /1st|2nd|3rd/i.test(d.place_label)).slice(0, 3);
        const bonus = prizeDistRes.data.filter(d => !/1st|2nd|3rd/i.test(d.place_label));
        if (podium.length) {
          CONFIG.prize.breakdown = podium.map(d => ({
            place: d.place_label,
            amount: Number(d.amount),
            icon: /1st/i.test(d.place_label) ? "gold" : /2nd/i.test(d.place_label) ? "silver" : "bronze",
          }));
        }
        if (bonus.length) {
          CONFIG.prize.bonusAwards = bonus.map(d => ({ title: d.place_label, detail: fmtMoney(d.amount) }));
        }
      }

      if (regSettingsRes.data) {
        CONFIG.slots.registrationOpen = regSettingsRes.data.status === "open";
        CONFIG.registrationStatusLabel = regSettingsRes.data.status;
      }

      if (typeof teamsCountRes.count === "number") {
        CONFIG.slots.registeredTeams = teamsCountRes.count;
        CONFIG.stats.teams = teamsCountRes.count;
        CONFIG.stats.players = teamsCountRes.count * (CONFIG.slots.playersPerTeam || 4);
      }
      CONFIG.stats.isDemo = false;

      if (scheduleRes.data) {
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const days = (scheduleRes.data.days_of_week || []).map(d => dayNames[d]).join(" & ");
        CONFIG.recurringScheduleLabel = scheduleRes.data.is_enabled
          ? `Every ${days} · ${scheduleRes.data.start_time?.slice(0,5)} — ${scheduleRes.data.end_time?.slice(0,5)} (${scheduleRes.data.timezone})`
          : null;
      }

      const { data: room } = await window.db
        .from("room_details")
        .select("*")
        .eq("tournament_id", tournament.id)
        .eq("is_published", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (room) {
        CONFIG.room.released = true;
        CONFIG.room.matchNumber = room.map ? `Match — ${room.map}` : "Room Released";
        CONFIG.room.map = room.map;
        CONFIG.room.roomId = room.room_id;
        CONFIG.room.password = room.room_password;
      } else {
        CONFIG.room.released = false;
      }
    } catch (err) {
      console.error("Live data hydration failed, falling back to config.js demo values.", err);
    }
  }

  /* ----------------------------------------------------------------------
     INIT
     -------------------------------------------------------------------- */
  async function init() {
    await hydrateConfigFromDatabase();

    initTicker();
    initNav();
    initBackToTop();
    initRipples();
    renderStatusPills();
    initCountdown();
    renderWatchPlayer();
    renderOverview();
    initRegistrationForm();
    initModal();
    initLeaderboard();
    renderMatches();
    renderTimeline();
    renderRoom();
    renderAccordion("#rulesAccordion", RULES, true);
    renderAccordion("#faqAccordion", FAQS, false);
    renderFairPlay();
    renderPrizes();
    renderSocial();
    initWhatsappLinks();
    initShare();
    initReveal();
    animateCounters();

    // Exposes a narrow, read-only refresh hook for js/realtime.js to call
    // after it updates CONFIG from a live Supabase subscription. Nothing
    // outside this file can read app.js's internals otherwise.
    window.__liveRefresh = {
      leaderboard: () => { renderPodium(); renderLeaderboard(); },
      matches: renderMatches,
      room: renderRoom,
      statusPills: renderStatusPills,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
