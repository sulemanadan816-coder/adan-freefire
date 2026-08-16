/* =========================================================================
   GAMING ZONE — frontend orchestrator
   -------------------------------------------------------------------------
   What this file does NOT do, on purpose:
     - It never sets a "verified" flag itself. The only source of truth is
       the database, read through check_youtube_verification() (a public,
       read-only function — see migration_gaming_zone.sql).
     - It never stores subscription proof in localStorage. The one thing
       it puts in localStorage is an anonymous visitor id — a lookup key,
       not proof of anything. Losing/clearing it just means re-verifying.

   CONFIG below needs your Google OAuth client id and your deployed
   Edge Function URL — see supabase/functions/youtube-verify/index.ts's
   header comment for the full setup walkthrough. Until both are filled
   in, the Gaming Zone correctly stays locked (never fakes success).
   ========================================================================= */
(function () {
  "use strict";

  const CONFIG = {
    // Public OAuth client id (safe to expose — the SECRET never goes here
    // or anywhere else in the browser). Same value you set as
    // GOOGLE_OAUTH_CLIENT_ID on the Edge Function.
    GOOGLE_OAUTH_CLIENT_ID: "",
    // Deployed URL of the youtube-verify Edge Function, e.g.
    // "https://your-project-ref.supabase.co/functions/v1/youtube-verify"
    YOUTUBE_VERIFY_FUNCTION_URL: "",
  };

  const VISITOR_ID_KEY = "adanVisitorId";
  const GAMES = [
    { id: "snake", label: "🐍 Snake", file: "js/games/snake.js", mount: "SnakeGame" },
    { id: "flappy", label: "🐤 Flappy Dash", file: "js/games/flappy.js", mount: "FlappyGame" },
    { id: "reaction", label: "⚡ Reaction Test", file: "js/games/reaction.js", mount: "ReactionGame" },
    { id: "aim", label: "🎯 Aim/Reflex Test", file: "js/games/aim-reflex.js", mount: "AimReflexGame" },
    { id: "memory", label: "🃏 Memory Cards", file: "js/games/memory.js", mount: "MemoryGame" },
    { id: "tictactoe", label: "⭕ Tic-Tac-Toe", file: "js/games/tictactoe.js", mount: "TicTacToeGame" },
    { id: "number", label: "🔢 Number Challenge", file: "js/games/number.js", mount: "NumberGame" },
    { id: "quicktap", label: "👆 Quick Tap Challenge", file: "js/games/quicktap.js", mount: "QuickTapGame" },
    { id: "duckhunt", label: "🦆 Duck Hunt", file: "js/games/duckhunt.js", mount: "DuckHuntGame" },
    { id: "spaceshooter", label: "🚀 Space Shooter", file: "js/games/spaceshooter.js", mount: "SpaceShooterGame" },
    { id: "tank", label: "🎮 Tank Battle", file: "js/games/tank.js", mount: "TankBattleGame" },
  ];

  let FEATURES = null; // gaming_features row (or safe defaults if none)
  let ORG_ID = null;
  let VISITOR_ID = null;
  const loadedScripts = new Set();
  let activeGame = null;

  function safeGetVisitorId() {
    try {
      let id = localStorage.getItem(VISITOR_ID_KEY);
      if (!id) {
        id = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(VISITOR_ID_KEY, id);
      }
      return id;
    } catch (e) {
      // localStorage blocked — fall back to an in-memory id for this page
      // view only; verification will just need to happen again next visit.
      return "v_session_" + Math.random().toString(36).slice(2);
    }
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  function getRequestedTournamentSlug() {
    // Mirrors js/app.js's own helper of the same name exactly, kept as a
    // separate copy on purpose: this file must resolve the tournament
    // independently, not depend on app.js's internal state or timing —
    // see the loadFeatures() comment below for why.
    const pathMatch = window.location.pathname.match(/\/t\/([a-z0-9-]+)\/?$/i);
    if (pathMatch) return pathMatch[1];
    const qsSlug = new URLSearchParams(window.location.search).get("t");
    return qsSlug || null;
  }

  async function loadFeatures() {
    try {
      if (!window.db) return null;

      // FIX: this used to read window.CONFIG.tournament.organization_id.
      // Two separate bugs made that never work:
      //  1) config.js declares `const CONFIG = {...}` — plain top-level
      //     const/let in a classic <script> never becomes a `window`
      //     property, so `window.CONFIG` was always undefined (bare
      //     `CONFIG` works fine elsewhere on the page, `window.CONFIG`
      //     does not — this is a real, easy-to-miss JS gotcha).
      //  2) Even fixing that, js/app.js fetches the tournament's
      //     organization_id from Supabase but only ever passes it
      //     straight into hydrateBranding() — it never stores it back
      //     onto CONFIG.tournament for other scripts to read. So that
      //     field flat-out doesn't exist there, timing aside.
      // Fetching it here directly sidesteps both problems and removes
      // any dependency on app.js's internal state or load order.
      const requestedSlug = getRequestedTournamentSlug();
      const { data: tournament, error: tErr } = requestedSlug
        ? await window.db.from("tournaments").select("id, organization_id").eq("slug", requestedSlug).maybeSingle()
        : await window.db.from("tournaments").select("id, organization_id").eq("is_active", true).single();

      if (tErr || !tournament || !tournament.organization_id) {
        if (tErr) console.error("gaming-zone: tournament lookup failed:", tErr);
        return null;
      }
      ORG_ID = tournament.organization_id;

      const { data, error } = await window.db.from("gaming_features").select("*").eq("organization_id", ORG_ID).maybeSingle();
      if (error) { console.error("gaming_features load failed:", error); return null; }
      return data;
    } catch (e) {
      console.error("loadFeatures failed:", e);
      return null;
    }
  }

  async function checkVerified() {
    if (!window.db || !ORG_ID || !VISITOR_ID) return false;
    try {
      const { data, error } = await window.db.rpc("check_youtube_verification", {
        p_org_id: ORG_ID,
        p_visitor_id: VISITOR_ID,
      });
      if (error) { console.error("check_youtube_verification failed:", error); return false; }
      return !!data;
    } catch (e) {
      console.error("checkVerified failed:", e);
      return false;
    }
  }

  function startYoutubeOAuth(channelId) {
    if (!CONFIG.GOOGLE_OAUTH_CLIENT_ID || !CONFIG.YOUTUBE_VERIFY_FUNCTION_URL) {
      showToast("YouTube verification isn't configured yet on this site. Contact the organizer.");
      return;
    }
    const state = [VISITOR_ID, ORG_ID, channelId].map(encodeURIComponent).join(".");
    const params = new URLSearchParams({
      client_id: CONFIG.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: CONFIG.YOUTUBE_VERIFY_FUNCTION_URL,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.readonly openid",
      access_type: "online",
      prompt: "consent",
      state,
    });
    window.location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
  }

  function showToast(msg) {
    // Reuses the site's existing toast pattern if present; otherwise a
    // silent no-op fallback so this never throws.
    try {
      const stack = document.getElementById("toastStack");
      if (!stack) { console.log(msg); return; }
      const el = document.createElement("div");
      el.className = "toast";
      el.textContent = msg;
      stack.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    } catch (e) { /* no-op */ }
  }

  function cleanUrlParam(names) {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      names.forEach((n) => { if (url.searchParams.has(n)) { url.searchParams.delete(n); changed = true; } });
      if (changed) window.history.replaceState({}, "", url.toString());
    } catch (e) { /* no-op */ }
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (loadedScripts.has(src)) { resolve(); return; }
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => { loadedScripts.add(src); resolve(); };
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.body.appendChild(s);
    });
  }

  function renderLocked(container, channelUrl) {
    container.innerHTML = `
      <div class="gz-locked">
        <div class="gz-locked-icon">🔒</div>
        <h3>Gaming Zone Locked</h3>
        <p>Subscribe to our YouTube channel to unlock free games and gaming resources.</p>
        <div class="gz-locked-actions">
          <a href="${channelUrl || "#"}" target="_blank" rel="noopener" class="btn btn-primary" id="gzSubscribeBtn">Subscribe on YouTube</a>
          <button type="button" class="btn btn-secondary" id="gzCheckBtn">Check Subscription</button>
        </div>
        <p class="gz-locked-note">Verification happens securely through YouTube's own API — we never take your word for it, and we never ask for your password.</p>
      </div>`;
    $("#gzCheckBtn", container).addEventListener("click", () => {
      startYoutubeOAuth(FEATURES.youtube_channel_id);
    });
  }

  function renderUnlocked(container) {
    container.innerHTML = `
      <div class="gz-unlocked-banner">🎉 Gaming Zone Unlocked</div>
      <div class="gz-games-grid" id="gzGamesGrid"></div>
      <div class="gz-game-stage" id="gzGameStage" hidden>
        <div class="gz-game-stage-head">
          <span id="gzGameTitle"></span>
          <button type="button" class="btn btn-secondary btn-sm" id="gzCloseGameBtn">← Back to games</button>
        </div>
        <div id="gzGameMount"></div>
      </div>`;

    const grid = $("#gzGamesGrid", container);
    const enabled = (FEATURES && FEATURES.games_enabled) || {};
    GAMES.filter((g) => enabled[g.id] !== false).forEach((g) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "gz-game-card";
      card.textContent = g.label;
      card.addEventListener("click", () => openGame(g, container));
      grid.appendChild(card);
    });

    $("#gzCloseGameBtn", container).addEventListener("click", () => closeGame(container));
  }

  async function openGame(game, container) {
    const stage = $("#gzGameStage", container);
    const grid = $("#gzGamesGrid", container);
    const mount = $("#gzGameMount", container);
    const title = $("#gzGameTitle", container);

    title.textContent = game.label;
    mount.innerHTML = `<div class="gz-loading">Loading…</div>`;
    stage.hidden = false;
    grid.style.display = "none";

    try {
      await loadScriptOnce(game.file);
      mount.innerHTML = "";
      const GameClass = window[game.mount];
      if (!GameClass) throw new Error("Game module didn't register " + game.mount);
      activeGame = new GameClass(mount);
      activeGame.start();
    } catch (e) {
      console.error(e);
      mount.innerHTML = `<div class="gz-loading">Couldn't load this game right now.</div>`;
    }
  }

  function closeGame(container) {
    if (activeGame && typeof activeGame.destroy === "function") {
      try { activeGame.destroy(); } catch (e) { /* no-op */ }
    }
    activeGame = null;
    $("#gzGameStage", container).hidden = true;
    $("#gzGamesGrid", container).style.display = "";
  }

  async function renderGamingZone() {
    const container = document.getElementById("gamingZoneBody");
    if (!container) return; // section not present on this page — nothing to do

    if (!FEATURES || !FEATURES.gaming_zone_enabled) {
      const section = document.getElementById("gamingZone");
      if (section) section.style.display = "none";
      return;
    }

    if (FEATURES.youtube_required) {
      const verified = await checkVerified();
      if (!verified) {
        const channelUrl = FEATURES.youtube_channel_url ||
          (typeof CONFIG !== "undefined" && CONFIG.youtube && CONFIG.youtube.channelUrl) || "#";
        renderLocked(container, channelUrl);
        return;
      }
    }
    renderUnlocked(container);
  }

  async function initStandaloneAimTrainer() {
    const section = document.getElementById("aimTrainerSection");
    const launchBtn = document.getElementById("aimTrainerLaunchBtn");
    const mount = document.getElementById("aimTrainerMount");
    if (!section || !launchBtn || !mount) return;
    launchBtn.addEventListener("click", async () => {
      launchBtn.disabled = true;
      launchBtn.textContent = "Loading…";
      try {
        await loadScriptOnce("js/games/aim-reflex.js");
        mount.innerHTML = "";
        launchBtn.style.display = "none";
        const game = new window.AimReflexGame(mount);
        game.start();
      } catch (e) {
        console.error(e);
        mount.innerHTML = `<div class="gz-loading">Couldn't load the trainer right now.</div>`;
      }
    });
  }

  async function init() {
    try {
      VISITOR_ID = safeGetVisitorId();
      FEATURES = await loadFeatures();

      const params = new URLSearchParams(window.location.search);
      if (params.get("yt_check")) {
        const status = params.get("yt_status");
        if (status === "verified") showToast("YouTube subscription verified — Gaming Zone unlocked!");
        else if (status === "not_subscribed") showToast("We couldn't find a subscription to this channel yet.");
        else if (status === "declined") showToast("Subscription check was cancelled.");
        else if (status === "error") showToast("Verification failed — please try again in a moment.");
        cleanUrlParam(["yt_check", "yt_status"]);
      }

      await renderGamingZone();
      await initStandaloneAimTrainer();

      if (FEATURES && FEATURES.sensitivity_finder_enabled === false) {
        const el = document.getElementById("sensitivityFinder");
        if (el) el.style.display = "none";
      }
      if (FEATURES && FEATURES.aim_trainer_enabled === false) {
        const el = document.getElementById("aimTrainerSection");
        if (el) el.style.display = "none";
      }
      if (FEATURES && FEATURES.tips_enabled === false) {
        const el = document.getElementById("ffTipsSection");
        if (el) el.style.display = "none";
      }
    } catch (e) {
      console.error("Gaming Zone init failed:", e);
      // Fail closed — never leave a half-broken unlocked state visible.
      const section = document.getElementById("gamingZone");
      if (section) section.style.display = "none";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
