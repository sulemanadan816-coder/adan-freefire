/* Duck Hunt — ducks fly across the sky in arcs; click/tap to shoot them
   before they fly off. 3 lives (missed ducks cost a life), score + best
   score in localStorage, increasing difficulty over time. Desktop click +
   mobile tap, same handler either way. */
(function () {
  const HS_KEY = "adanGame_duckhunt_best";

  class DuckHuntGame {
    constructor(container) {
      this.container = container;
      this._loop = this._loop.bind(this);
      this._onShoot = this._onShoot.bind(this);
      this._buildDom();
    }

    _getHigh() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10); } catch (e) { return 0; } }
    _setHigh(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) { /* no-op */ } }

    _buildDom() {
      this.container.innerHTML = `
        <div class="gz-game-hud">
          <span>Score: <b id="dhScore">0</b></span>
          <span>Lives: <b id="dhLives">3</b></span>
          <span>Best: <b id="dhBest">${this._getHigh()}</b></span>
          <span id="dhStatus" style="color:var(--ember);"></span>
        </div>
        <canvas id="dhCanvas" style="width:100%;max-width:480px;aspect-ratio:4/3;background:linear-gradient(#7ec8e3 0%, #bfe3f0 60%, #d8c98a 60%, #c2b06f 100%);border:1px solid var(--border);border-radius:12px;display:block;margin:0 auto;touch-action:none;cursor:crosshair;"></canvas>
        <div class="gz-game-controls">
          <button type="button" class="btn btn-secondary btn-sm" id="dhStartBtn">Start</button>
        </div>
        <p style="color:var(--text-3); font-size:12px; text-align:center; margin-top:8px;">Click or tap the ducks before they fly off screen.</p>`;

      this.canvas = this.container.querySelector("#dhCanvas");
      this.canvas.width = 480; this.canvas.height = 360;
      this.ctx = this.canvas.getContext("2d");
      this.scoreEl = this.container.querySelector("#dhScore");
      this.livesEl = this.container.querySelector("#dhLives");
      this.bestEl = this.container.querySelector("#dhBest");
      this.statusEl = this.container.querySelector("#dhStatus");
      this.container.querySelector("#dhStartBtn").addEventListener("click", () => this._reset());
      this.canvas.addEventListener("click", this._onShoot);
      this.canvas.addEventListener("touchstart", (e) => { e.preventDefault(); this._onShoot(e.touches[0]); }, { passive: false });
    }

    _reset() {
      this.ducks = [];
      this.score = 0; this.lives = 3; this.running = true;
      this.spawnEvery = 1400; this.lastSpawn = 0;
      this.scoreEl.textContent = "0"; this.livesEl.textContent = "3"; this.statusEl.textContent = "";
      cancelAnimationFrame(this.raf);
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this._loop);
    }

    _spawnDuck() {
      const fromLeft = Math.random() < 0.5;
      const speed = (0.9 + Math.random() * 0.6) * (1 + this.score / 200); // ramps with score
      this.ducks.push({
        x: fromLeft ? -20 : this.canvas.width + 20,
        y: 60 + Math.random() * 180,
        vx: (fromLeft ? 1 : -1) * speed,
        vy: Math.sin(Math.random() * Math.PI) * 0.4 - 0.2,
        r: 16,
        alive: true,
        wobble: Math.random() * 10,
      });
    }

    _onShoot(evt) {
      if (!this.running) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width, scaleY = this.canvas.height / rect.height;
      const x = (evt.clientX - rect.left) * scaleX;
      const y = (evt.clientY - rect.top) * scaleY;
      for (const d of this.ducks) {
        if (!d.alive) continue;
        const dist = Math.hypot(d.x - x, d.y - y);
        if (dist < d.r + 6) {
          d.alive = false; d.hitAt = performance.now();
          this.score += 10;
          this.scoreEl.textContent = String(this.score);
          break;
        }
      }
    }

    _loop(now) {
      if (!this.running) return;
      const dt = Math.min(40, now - this.lastTime);
      this.lastTime = now;

      if (now - this.lastSpawn > this.spawnEvery) {
        this.lastSpawn = now;
        this._spawnDuck();
        this.spawnEvery = Math.max(550, this.spawnEvery - 15);
      }

      this.ducks.forEach((d) => {
        if (!d.alive) return;
        d.x += d.vx * (dt / 16);
        d.y += Math.sin((d.x + d.wobble) / 20) * 0.6;
      });

      // Ducks that fully leave the screen alive cost a life.
      const before = this.ducks.length;
      this.ducks = this.ducks.filter((d) => {
        if (!d.alive) return now - d.hitAt < 300; // keep briefly for the "hit" pop
        const offscreen = d.x < -40 || d.x > this.canvas.width + 40;
        if (offscreen) {
          this.lives--;
          this.livesEl.textContent = String(Math.max(0, this.lives));
          return false;
        }
        return true;
      });

      if (this.lives <= 0) { this._gameOver(); return; }

      this._draw();
      this.raf = requestAnimationFrame(this._loop);
    }

    _gameOver() {
      this.running = false;
      const best = this._getHigh();
      if (this.score > best) { this._setHigh(this.score); this.bestEl.textContent = String(this.score); }
      this.statusEl.textContent = "Game Over — press Start";
      this._draw();
    }

    _draw() {
      const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
      ctx.fillStyle = "#7ec8e3"; ctx.fillRect(0, 0, W, H * 0.6);
      ctx.fillStyle = "#c2b06f"; ctx.fillRect(0, H * 0.6, W, H * 0.4);

      this.ducks.forEach((d) => {
        ctx.save();
        ctx.translate(d.x, d.y);
        if (!d.alive) { ctx.globalAlpha = Math.max(0, 1 - (performance.now() - d.hitAt) / 300); ctx.translate(0, (performance.now() - d.hitAt) / 8); }
        ctx.fillStyle = d.alive ? "#3a3a3a" : "#c0392b";
        ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffb703";
        ctx.beginPath();
        const dir = d.vx >= 0 ? 1 : -1;
        ctx.moveTo(d.r * dir, -2); ctx.lineTo(d.r * dir + 8 * dir, 0); ctx.lineTo(d.r * dir, 4); ctx.fill();
        ctx.restore();
      });

      if (!this.running && this.score >= 0 && this.lives <= 0) {
        ctx.fillStyle = "rgba(8,9,11,0.55)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#f5f3ef"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Game Over", W / 2, H / 2 - 8);
        ctx.font = "14px sans-serif";
        ctx.fillText("Score: " + this.score, W / 2, H / 2 + 16);
      }
    }

    start() { this._reset(); }
    destroy() {
      cancelAnimationFrame(this.raf);
      this.running = false;
      this.canvas.removeEventListener("click", this._onShoot);
    }
  }

  window.DuckHuntGame = DuckHuntGame;
})();
