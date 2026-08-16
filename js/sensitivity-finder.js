/* =========================================================================
   FREE FIRE SENSITIVITY FINDER — UI + calculator
   -------------------------------------------------------------------------
   The formula in computeSensitivity() is a deterministic set of base
   values + adjustments (refresh rate, play style, FPS, drag style) — not
   an AI prediction, not a guarantee. Every result is labeled "optimized
   starting sensitivity" in the UI, on purpose, per the brief.
   ========================================================================= */
(function () {
  "use strict";

  const TIER_BASE = {
    entry:    { general: 90,  redDot: 85,  scope2x: 60, scope4x: 45, sniper: 35, freeLook: 95,  fireBtn: 60 },
    mid:      { general: 95,  redDot: 90,  scope2x: 65, scope4x: 50, sniper: 38, freeLook: 100, fireBtn: 58 },
    high:     { general: 100, redDot: 95,  scope2x: 70, scope4x: 55, sniper: 40, freeLook: 105, fireBtn: 55 },
    flagship: { general: 105, redDot: 100, scope2x: 75, scope4x: 58, sniper: 42, freeLook: 110, fireBtn: 52 },
  };

  // Play-style multipliers, applied to the tier base above. Headshot Focus
  // trades scope stability for faster general/red-dot tracking and a
  // slightly smaller fire button (more thumb room for aim drags) — matches
  // the "short upward drag, fast target acquisition" brief.
  const STYLE_ADJUST = {
    balanced:  { general: 1.00, redDot: 1.00, scope: 1.00, fireBtn: 1.00 },
    aggressive:{ general: 1.08, redDot: 1.08, scope: 0.97, fireBtn: 1.03 },
    headshot:  { general: 1.10, redDot: 1.10, scope: 0.95, fireBtn: 0.93 },
    smooth:    { general: 0.92, redDot: 0.92, scope: 1.05, fireBtn: 1.00 },
  };

  function clamp(v, min, max) { return Math.max(min, Math.min(max, Math.round(v))); }

  function computeSensitivity({ tier, refreshHz, playStyle, fps, dragFingers }) {
    const base = TIER_BASE[tier] || TIER_BASE.mid;
    const style = STYLE_ADJUST[playStyle] || STYLE_ADJUST.balanced;

    // Higher refresh rate = smoother tracking, small deterministic bump.
    let refreshBonus = 0;
    if (refreshHz >= 120) refreshBonus = 5;
    else if (refreshHz >= 90) refreshBonus = 2;

    // Low, unstable FPS makes fast high-sensitivity tracking harder to
    // control — a small deterministic reduction, not a guess.
    let fpsPenalty = 0;
    if (fps && fps < 40) fpsPenalty = -6;
    else if (fps && fps < 60) fpsPenalty = -2;

    // More independent fingers on the drag = a bit more controlled reach,
    // small deterministic bump (claw/4-finger players can hold slightly
    // higher sensitivity and still stay precise).
    const dragBonus = dragFingers ? Math.max(0, (dragFingers - 2)) * 2 : 0;

    const g = (base.general + refreshBonus + fpsPenalty + dragBonus) * style.general;
    const rd = (base.redDot + refreshBonus + fpsPenalty + dragBonus) * style.redDot;
    const s2 = (base.scope2x + Math.round(refreshBonus / 2) + fpsPenalty) * style.scope;
    const s4 = (base.scope4x + Math.round(refreshBonus / 2) + fpsPenalty) * style.scope;
    const sn = (base.sniper + fpsPenalty) * style.scope;
    const fl = (base.freeLook + refreshBonus + fpsPenalty + dragBonus) * style.general;
    const fb = base.fireBtn * style.fireBtn;

    return {
      general: clamp(g, 1, 100),
      redDot: clamp(rd, 1, 100),
      scope2x: clamp(s2, 1, 100),
      scope4x: clamp(s4, 1, 100),
      sniper: clamp(sn, 1, 100),
      freeLook: clamp(fl, 1, 100),
      fireButtonPct: clamp(fb, 30, 100),
    };
  }

  function detectDevice() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    return {
      platform: isIOS ? "iOS" : isAndroid ? "Android" : "Desktop/Other",
      screenW: window.screen ? window.screen.width : null,
      screenH: window.screen ? window.screen.height : null,
      dpr: window.devicePixelRatio || 1,
      // Best-effort only — a browser cannot reliably identify the exact
      // phone model. This is a label for the user, never used to silently
      // pick a device for them; they always confirm/select manually.
      guess: isIOS ? "iPhone (model not detectable from browser)" : isAndroid ? "Android device (model not detectable from browser)" : null,
    };
  }

  function renderResults(container, result, tierLabel) {
    container.innerHTML = `
      <div class="sf-result-note">Optimized starting sensitivity for a <b>${tierLabel}</b> tier device — not a guaranteed headshot sensitivity. Adjust by small increments (±5) based on your own drag control.</div>
      <div class="sf-result-grid">
        <div class="sf-result-cell"><span>General</span><b>${result.general}</b></div>
        <div class="sf-result-cell"><span>Red Dot</span><b>${result.redDot}</b></div>
        <div class="sf-result-cell"><span>2x Scope</span><b>${result.scope2x}</b></div>
        <div class="sf-result-cell"><span>4x Scope</span><b>${result.scope4x}</b></div>
        <div class="sf-result-cell"><span>Sniper Scope</span><b>${result.sniper}</b></div>
        <div class="sf-result-cell"><span>Free Look</span><b>${result.freeLook}</b></div>
      </div>
      <div class="sf-result-extra">
        <div>Recommended Fire Button Size: <b>${result.fireButtonPct}%</b></div>
        <div style="color:var(--text-3); font-size:12px; margin-top:6px;">DPI setting: not applicable — Free Fire on mobile uses touch-based sensitivity sliders, not a mouse DPI value.</div>
      </div>`;
  }

  function populateModelSelect(select, brand) {
    const models = (window.DEVICE_DB && window.DEVICE_DB[brand]) || [];
    select.innerHTML = `<option value="">Select model…</option>` + models.map((m, i) => `<option value="${i}">${m.model}</option>`).join("");
  }

  function initFinder(root) {
    const brandSelect = root.querySelector("#sfBrand");
    const modelSelect = root.querySelector("#sfModel");
    const styleSelect = root.querySelector("#sfStyle");
    const resultsBox = root.querySelector("#sfResults");
    const detectedNote = root.querySelector("#sfDetected");

    Object.keys(window.DEVICE_DB || {}).forEach((brand) => {
      const opt = document.createElement("option");
      opt.value = brand; opt.textContent = brand;
      brandSelect.appendChild(opt);
    });

    const detected = detectDevice();
    if (detectedNote) {
      detectedNote.textContent = `Detected: ${detected.platform}${detected.screenW ? ` · ${detected.screenW}×${detected.screenH}px · ${detected.dpr}x pixel ratio` : ""}. Please select your exact model below for an accurate preset.`;
      if (detected.platform === "iOS") brandSelect.value = "Apple";
      else if (detected.platform === "Android") brandSelect.value = "";
      if (brandSelect.value) populateModelSelect(modelSelect, brandSelect.value);
    }

    brandSelect.addEventListener("change", () => {
      populateModelSelect(modelSelect, brandSelect.value);
      resultsBox.innerHTML = "";
    });

    function computeAndShow() {
      const brand = brandSelect.value;
      const modelIdx = modelSelect.value;
      if (!brand || modelIdx === "") { resultsBox.innerHTML = `<p style="color:var(--text-3);">Select your brand and model to see a recommended preset.</p>`; return; }
      const device = window.DEVICE_DB[brand][modelIdx];
      const playStyle = styleSelect.value || "balanced";
      const result = computeSensitivity({ tier: device.tier, refreshHz: device.refreshHz, playStyle, fps: null, dragFingers: 2 });
      renderResults(resultsBox, result, device.tier);
    }

    modelSelect.addEventListener("change", computeAndShow);
    styleSelect.addEventListener("change", computeAndShow);
  }

  function initCalculator(root) {
    const form = root.querySelector("#sfCalcForm");
    const out = root.querySelector("#sfCalcResults");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const tier = form.tier.value;
      const refreshHz = parseInt(form.refreshHz.value, 10) || 60;
      const fps = parseInt(form.fps.value, 10) || null;
      const playStyle = form.playStyle.value;
      const dragFingers = parseInt(form.dragFingers.value, 10) || 2;
      const result = computeSensitivity({ tier, refreshHz, playStyle, fps, dragFingers });
      renderResults(out, result, tier);
    });
  }

  function initTabs(root) {
    const buttons = root.querySelectorAll(".sf-tab-btn");
    const panels = root.querySelectorAll(".sf-tab-panel");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        root.querySelector("#" + btn.dataset.tab).classList.add("active");
      });
    });
  }

  function boot() {
    const root = document.getElementById("sensitivityFinder");
    if (!root) return;
    initTabs(root);
    initFinder(root);
    initCalculator(root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__computeSensitivity = computeSensitivity; // exposed for testing
})();
