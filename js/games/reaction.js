/* Reaction Test — wait for green, tap as fast as possible; tracks best time. */
(function () {
  const HS_KEY = "adanGame_reaction_best";
  class ReactionGame {
    constructor(container) { this.container = container; this._buildDom(); }
    _getBest() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10) || null; } catch (e) { return null; } }
    _setBest(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) {} }
    _buildDom() {
      const best = this._getBest();
      this.container.innerHTML = `
        <div class="gz-game-hud"><span>Best: <b id="rxBest">${best ? best + "ms" : "—"}</b></span></div>
        <div id="rxBox" style="max-width:360px;height:220px;margin:0 auto;border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;text-align:center;padding:20px;cursor:pointer;background:var(--bg-panel-2);border:1px solid var(--border); color:var(--text-1);">Click to start</div>`;
      this.box = this.container.querySelector("#rxBox");
      this.bestEl = this.container.querySelector("#rxBest");
      this.state = "idle";
      this.box.addEventListener("click", () => this._onClick());
    }
    _onClick() {
      if (this.state === "idle" || this.state === "result") {
        this.state = "waiting";
        this.box.style.background = "#3a1414"; this.box.textContent = "Wait for green…";
        const delay = 1000 + Math.random() * 2500;
        this.timeout = setTimeout(() => {
          this.state = "go"; this.startTime = performance.now();
          this.box.style.background = "#0f3d2e"; this.box.textContent = "CLICK NOW!";
        }, delay);
      } else if (this.state === "waiting") {
        clearTimeout(this.timeout);
        this.state = "result";
        this.box.style.background = "var(--bg-panel-2)"; this.box.textContent = "Too soon! Click to try again.";
      } else if (this.state === "go") {
        const ms = Math.round(performance.now() - this.startTime);
        this.state = "result";
        const best = this._getBest();
        if (!best || ms < best) { this._setBest(ms); this.bestEl.textContent = ms + "ms"; }
        this.box.style.background = "var(--bg-panel-2)";
        this.box.textContent = ms + "ms — click to try again";
      }
    }
    start() {}
    destroy() { clearTimeout(this.timeout); }
  }
  window.ReactionGame = ReactionGame;
})();
