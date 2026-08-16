/* Aim/Reflex Test — targets appear at random positions for a limited time;
   tap/click them. Tracks score, accuracy, reaction time, hits, misses, best
   score. Used both as a Gaming Zone game and as the standalone Aim Trainer
   section (Feature 7) — same module, two mount points. */
(function () {
  const HS_KEY = "adanGame_aim_best";
  const ROUND_MS = 30000;
  const TARGET_LIFETIME = 950;

  class AimReflexGame {
    constructor(container) { this.container = container; this._buildDom(); }
    _getBest() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10); } catch (e) { return 0; } }
    _setBest(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) {} }

    _buildDom() {
      this.container.innerHTML = `
        <div class="gz-game-hud">
          <span>Score: <b id="amScore">0</b></span>
          <span>Accuracy: <b id="amAcc">—</b></span>
          <span>Avg RT: <b id="amRt">—</b></span>
          <span>Best: <b id="amBest">${this._getBest()}</b></span>
        </div>
        <div id="amArena" style="position:relative;width:100%;max-width:480px;height:320px;margin:0 auto;background:var(--bg-panel-2);border:1px solid var(--border);border-radius:12px;overflow:hidden;touch-action:none;"></div>
        <div class="gz-game-controls"><button type="button" class="btn btn-secondary btn-sm" id="amStartBtn">Start 30s Round</button></div>
        <p id="amSummary" style="color:var(--text-3); font-size:12.5px; text-align:center; margin-top:8px;"></p>`;
      this.arena = this.container.querySelector("#amArena");
      this.scoreEl = this.container.querySelector("#amScore");
      this.accEl = this.container.querySelector("#amAcc");
      this.rtEl = this.container.querySelector("#amRt");
      this.bestEl = this.container.querySelector("#amBest");
      this.summaryEl = this.container.querySelector("#amSummary");
      this.container.querySelector("#amStartBtn").addEventListener("click", () => this._startRound());
      this.arena.addEventListener("click", (e) => { if (e.target === this.arena) this._registerMiss(); });
    }

    _startRound() {
      this.hits = 0; this.misses = 0; this.reactionTimes = []; this.score = 0;
      this.scoreEl.textContent = "0"; this.accEl.textContent = "—"; this.rtEl.textContent = "—";
      this.summaryEl.textContent = "";
      this.running = true;
      this._spawnTarget();
      this.endTimer = setTimeout(() => this._endRound(), ROUND_MS);
    }

    _spawnTarget() {
      if (!this.running) return;
      if (this.currentTarget) this.currentTarget.remove();
      const size = 34 + Math.random() * 20;
      const t = document.createElement("div");
      const rect = this.arena.getBoundingClientRect();
      const x = Math.random() * Math.max(1, rect.width - size);
      const y = Math.random() * Math.max(1, rect.height - size);
      t.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #ff8a4c, #ff4d1c);box-shadow:0 0 14px rgba(255,77,28,0.55);cursor:pointer;`;
      const spawnTime = performance.now();
      t.addEventListener("click", (e) => {
        e.stopPropagation();
        this.hits++;
        this.reactionTimes.push(performance.now() - spawnTime);
        this.score += Math.max(5, Math.round(150 - (performance.now() - spawnTime) / 8));
        this.scoreEl.textContent = String(this.score);
        this._updateStats();
        this._spawnTarget();
      });
      this.arena.appendChild(t);
      this.currentTarget = t;
      clearTimeout(this.expireTimer);
      this.expireTimer = setTimeout(() => { if (this.running) { this._registerMiss(); this._spawnTarget(); } }, TARGET_LIFETIME);
    }

    _registerMiss() { this.misses++; this._updateStats(); }

    _updateStats() {
      const total = this.hits + this.misses;
      this.accEl.textContent = total ? Math.round((this.hits / total) * 100) + "%" : "—";
      if (this.reactionTimes.length) {
        const avg = this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length;
        this.rtEl.textContent = Math.round(avg) + "ms";
      }
    }

    _endRound() {
      this.running = false;
      clearTimeout(this.expireTimer);
      if (this.currentTarget) { this.currentTarget.remove(); this.currentTarget = null; }
      const best = this._getBest();
      if (this.score > best) { this._setBest(this.score); this.bestEl.textContent = String(this.score); }
      this.summaryEl.textContent = `Round over — ${this.hits} hit, ${this.misses} missed.`;
    }

    start() {}
    destroy() { this.running = false; clearTimeout(this.endTimer); clearTimeout(this.expireTimer); }
  }
  window.AimReflexGame = AimReflexGame;
})();
