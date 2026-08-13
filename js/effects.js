/* =========================================================================
   ADAN FREE FIRE TOURNAMENT — 3D EFFECTS (intro + card tilt)
   -------------------------------------------------------------------------
   Self-contained. Does not read/write CONFIG, does not touch Supabase, and
   never calls anything in js/app.js — this only adds decorative behavior
   on top of the DOM app.js already builds. Safe to remove this file and
   its <script> tag with zero effect on registration, admin, or data.
   ========================================================================= */
(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasFinePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

  /* ----------------------------------------------------------------------
     INTRO SEQUENCE
     -------------------------------------------------------------------- */
  function initIntro() {
    // FIX (black-screen bug): the intro is decorative only and must never
    // be able to trap a visitor on a black screen. Everything below is
    // wrapped defensively: if #introOverlay is missing we no-op, if
    // anything throws we tear the overlay down instead of leaving it
    // stuck, and a hard 4s safety timer guarantees dismissal even if the
    // CSS animation never fires (disabled, throttled, or just slow).
    try {
      var overlay = document.getElementById("introOverlay");
      if (!overlay) return; // no intro in this page — nothing to do

      // Respect reduced motion by skipping the gate entirely rather than
      // showing a static screen someone still has to click through — the
      // intro is decorative, not content, so there's nothing lost by not
      // showing it.
      if (prefersReducedMotion) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        return;
      }

      document.body.classList.add("intro-active");
      spawnEmbers(overlay.querySelector(".intro-embers"), 14);

      var enterBtn = document.getElementById("enterTournamentBtn");
      var dismissed = false;      // guards against dismiss() running twice
      var safetyTimer = null;     // declared before use; set just below

      function dismiss() {
        if (dismissed) return;
        dismissed = true;

        if (safetyTimer !== null) {
          clearTimeout(safetyTimer);
          safetyTimer = null;
        }

        window.removeEventListener("keydown", onKey);

        try {
          overlay.classList.add("intro-exit");
          document.body.classList.remove("intro-active");
        } catch (e) {
          // Styling failed for some reason — fall through to the hard
          // removal below so the visitor is never stuck either way.
        }

        setTimeout(function () {
          try {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          } catch (e) {
            /* overlay already gone — nothing to do */
          }
        }, 650); // matches the CSS opacity/visibility transition duration
      }

      function onKey(e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") dismiss();
      }

      if (enterBtn) enterBtn.addEventListener("click", dismiss);
      window.addEventListener("keydown", onKey);

      // Hard fail-safe: no matter what else happens (stalled animation,
      // backgrounded tab throttling, a JS error elsewhere on the page),
      // the intro auto-dismisses after ~4 seconds.
      safetyTimer = setTimeout(dismiss, 4000);
    } catch (err) {
      // Last resort: if anything above threw, forcibly remove the overlay
      // so the real site is never hidden behind it.
      try {
        var stuckOverlay = document.getElementById("introOverlay");
        if (stuckOverlay && stuckOverlay.parentNode) {
          stuckOverlay.parentNode.removeChild(stuckOverlay);
        }
        document.body.classList.remove("intro-active");
      } catch (e2) {
        /* nothing more we can do from here */
      }
    }
  }

  function spawnEmbers(container, count) {
    if (!container) return;
    for (var i = 0; i < count; i++) {
      var p = document.createElement("span");
      p.className = "ember-particle";
      var left = Math.random() * 100;
      var size = 2 + Math.random() * 4;
      var dur = 5 + Math.random() * 5;
      var delay = Math.random() * 6;
      var drift = (Math.random() - 0.5) * 80;
      p.style.left = left + "%";
      p.style.setProperty("--size", size.toFixed(1) + "px");
      p.style.setProperty("--dur", dur.toFixed(1) + "s");
      p.style.setProperty("--delay", delay.toFixed(1) + "s");
      p.style.setProperty("--drift", drift.toFixed(0) + "px");
      container.appendChild(p);
    }
  }

  /* ----------------------------------------------------------------------
     CARD TILT — pointer-tracked --tiltX/--tiltY custom properties that
     css/gaming-3d.css's :hover rule consumes. Desktop/mouse only: touch
     doesn't get real hover tracking, and binding pointermove there just
     produces a stuck tilt after a tap, which css/gaming-3d.css already
     neutralizes defensively — this is the other half of that same guard.
     -------------------------------------------------------------------- */
  function initTilt() {
    if (prefersReducedMotion || !hasFinePointer) return;

    var selector = ".card, .match-card, .prize-card, .room-card, .pay-card, .podium-card";
    var maxTilt = 6; // degrees — subtle, per the brief's "slight card perspective/tilt"

    document.addEventListener("pointermove", function (e) {
      var el = e.target.closest ? e.target.closest(selector) : null;
      if (!el) return;
      var rect = el.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width;  // 0..1
      var py = (e.clientY - rect.top) / rect.height;  // 0..1
      var tiltX = (px - 0.5) * maxTilt * 2;
      var tiltY = (0.5 - py) * maxTilt * 2;
      el.style.setProperty("--tiltX", tiltX.toFixed(2) + "deg");
      el.style.setProperty("--tiltY", tiltY.toFixed(2) + "deg");
    }, { passive: true });

    document.addEventListener("pointerout", function (e) {
      var el = e.target.closest ? e.target.closest(selector) : null;
      if (!el) return;
      el.style.setProperty("--tiltX", "0deg");
      el.style.setProperty("--tiltY", "0deg");
    }, { passive: true });
  }

  function boot() {
    // Each init function already guards itself internally, but this outer
    // try/catch is a second safety net: a decorative-effects bug must
    // never be able to break the rest of the page.
    try { initIntro(); } catch (e) { /* never let this break the site */ }
    try { initTilt(); } catch (e) { /* never let this break the site */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
