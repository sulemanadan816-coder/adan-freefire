/* =========================================================================
   ADAN FREE FIRE TOURNAMENT — VIEW SWITCH (Desktop View / Mobile View)
   MOBILE UPGRADE — new file, does not touch app.js / effects.js /
   realtime.js / donation.js / admin / Supabase logic in any way.

   What this does:
   - Reads/writes ONE localStorage key ("adanViewMode": "mobile"|"desktop").
   - Adds/removes "view-mobile" / "view-desktop" on <html>. All the actual
     mobile layout rules live in css/mobile.css, keyed off those classes —
     this file only flips the class and keeps the two buttons' pressed
     state in sync with it.
   - The initial class on <html> is already set by a tiny inline script in
     index.html's <head> (runs before first paint, before this file even
     loads) — this file just takes over from there for clicks/keys.

   Fail-safe: every entry point is wrapped so a DOM surprise here can never
   break registration, the admin panel, or anything else on the page.
   ========================================================================= */
(function () {
  "use strict";

  var STORAGE_KEY = "adanViewMode";

  function safeSetStorage(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
      /* localStorage blocked (private mode, disabled, etc.) — the toggle
         still works for this page view, it just won't be remembered on
         reload. Never let this throw and break the click. */
    }
  }

  function currentMode() {
    return document.documentElement.classList.contains("view-mobile") ? "mobile" : "desktop";
  }

  function applyMode(mode, buttons) {
    var root = document.documentElement;
    root.classList.toggle("view-mobile", mode === "mobile");
    root.classList.toggle("view-desktop", mode === "desktop");
    if (buttons) {
      buttons.desktopBtn.setAttribute("aria-pressed", mode === "desktop" ? "true" : "false");
      buttons.mobileBtn.setAttribute("aria-pressed", mode === "mobile" ? "true" : "false");
    }
  }

  function init() {
    try {
      var desktopBtn = document.getElementById("viewSwitchDesktop");
      var mobileBtn = document.getElementById("viewSwitchMobile");
      if (!desktopBtn || !mobileBtn) return; // switch markup not present — nothing to wire up

      var buttons = { desktopBtn: desktopBtn, mobileBtn: mobileBtn };

      // Sync initial pressed state to whatever the inline head script
      // already decided (auto-detected or restored from localStorage).
      applyMode(currentMode(), buttons);

      desktopBtn.addEventListener("click", function () {
        applyMode("desktop", buttons);
        safeSetStorage("desktop");
      });

      mobileBtn.addEventListener("click", function () {
        applyMode("mobile", buttons);
        safeSetStorage("mobile");
      });
    } catch (err) {
      /* Never let a view-switch problem affect the rest of the site. */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
