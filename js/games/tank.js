/* Tank Battle — move left/right, shoot upward at descending enemy tanks.
   Arrow keys / A-D + Space on desktop; on-screen ◀ ▶ FIRE buttons on
   mobile (drawn as real DOM buttons, not relying on a keyboard). */
(function () {
  const HS_KEY = "adanGame_tank_best";

  class TankBattleGame {
    constructor(container) {
      this.container = container;
      this._loop = this._loop.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onKeyUp = this._onKeyUp.bind(this);
      this._buildDom();
    }

    _getHigh() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10); } catch (e) { return 0; } }
    _setHigh(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) { /* no-op */ } }

    _buildDom() {
      this.container.innerHTML = `
        <div class="gz-game-hud">
          <span>Score: <b id="tkScore">0</b></span>
          <span>Lives: <b id="tkLives">3</b></span>
          <span>Best: <b id="tkBest">${this._getHigh()}</b></span>
          <span id="tkStatus" style="color:var(--ember);"></span>
        </div>
        <canvas id="tkCanvas" style="width:100%;max-width:420px;aspect-ratio:3/4;background:#1a2f1a;border:1px solid var(--border);border-radius:12px;display:block;margin:0 auto;touch-action:none;"></canvas>
        <div class="gz-game-controls">
          <button type="button" class="btn btn-secondary btn-sm" id="tkStartBtn">Start</button>
        </div>
        <div id="tkTouchControls" style="display:flex; justify-content:center; gap:10px; margin-top:12px;">
          <button type="button" id="tkLeftBtn" class="btn btn-secondary" style="width:64px; height:52px; font-size:20px;">◀</button>
          <button type="button" id="tkFireBtn" class="btn btn-primary" style="width:96px; height:52px; font-weight:800;">FIRE</button>
          <button type="button" id="tkRightBtn" class="btn btn-secondary" style="width:64px; height:52px; font-size:20px;">▶</button>
        </div>
        <p style="color:var(--text-3); font-size:12px; text-align:center; margin-top:8px;">Arrow keys / A-D to move, Space to fire — or use the buttons above on mobile.</p>`;

      this.canvas = this.container.querySelector("#tkCanvas");
      this.canvas.width = 320; this.canvas.height = 420;
      this.ctx = this.canvas.getContext("2d");
      this.scoreEl = this.container.querySelector("#tkScore");
      this.livesEl = this.container.querySelector("#tkLives");
      this.bestEl = this.container.querySelector("#tkBest");
      this.statusEl = this.container.querySelector("#tkStatus");
      this.container.querySelector("#tkStartBtn").addEventListener("click", () => this._reset());

      this.moveLeft = false; this.moveRight = false;
      const bind = (btn, prop) => {
        const el = this.container.querySelector(btn);
        const on = (e) => { e.preventDefault(); this[prop] = true; };
        const off = (e) => { e.preventDefault(); this[prop] = false; };
        el.addEventListener("mousedown", on); el.addEventListener("mouseup", off); el.addEventListener("mouseleave", off);
        el.addEventListener("touchstart", on, { passive: false }); el.addEventListener("touchend", off, { passive: false });
      };
      bind("#tkLeftBtn", "moveLeft");
      bind("#tkRightBtn", "moveRight");
      this.container.querySelector("#tkFireBtn").addEventListener("click", () => this._fire());
      this.container.querySelector("#tkFireBtn").addEventListener("touchstart", (e) => { e.preventDefault(); this._fire(); }, { passive: false });
    }

    _onKeyDown(e) {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this.moveLeft = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this.moveRight = true;
      if (e.key === " ") { e.preventDefault(); this._fire(); }
    }
    _onKeyUp(e) {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this.moveLeft = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this.moveRight = false;
    }

    _fire() {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.lastFire < 260) return; // simple fire-rate cap
      this.lastFire = now;
      this.bullets.push({ x: this.tankX, y: this.canvas.height - 60 });
    }

    _reset() {
      this.tankX = this.canvas.width / 2;
      this.bullets = []; this.enemies = [];
      this.score = 0; this.lives = 3; this.running = true;
      this.lastFire = 0; this.lastSpawn = 0; this.spawnEvery = 1300;
      this.scoreEl.textContent = "0"; this.livesEl.textContent = "3"; this.statusEl.textContent = "";
      cancelAnimationFrame(this.raf);
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this._loop);
    }

    _loop(now) {
      if (!this.running) return;
      const dt = Math.min(40, now - this.lastTime);
      this.lastTime = now;

      const speed = 3.2 * (dt / 16);
      if (this.moveLeft) this.tankX = Math.max(24, this.tankX - speed);
      if (this.moveRight) this.tankX = Math.min(this.canvas.width - 24, this.tankX + speed);

      if (now - this.lastSpawn > this.spawnEvery) {
        this.lastSpawn = now;
        this.enemies.push({ x: 30 + Math.random() * (this.canvas.width - 60), y: -20, vy: 0.7 + Math.random() * 0.6 + this.score / 500 });
        this.spawnEvery = Math.max(500, this.spawnEvery - 10);
      }

      this.bullets.forEach((b) => (b.y -= 5 * (dt / 16)));
      this.bullets = this.bullets.filter((b) => b.y > -10);
      this.enemies.forEach((e) => (e.y += e.vy * (dt / 16)));

      for (const e of this.enemies) {
        if (e.dead) continue;
        for (const b of this.bullets) {
          if (b.hit) continue;
          if (Math.abs(e.x - b.x) < 18 && Math.abs(e.y - b.y) < 16) {
            e.dead = true; b.hit = true;
            this.score += 15;
            this.scoreEl.textContent = String(this.score);
            break;
          }
        }
      }
      this.bullets = this.bullets.filter((b) => !b.hit);

      this.enemies = this.enemies.filter((e) => {
        if (e.dead) return false;
        if (e.y > this.canvas.height + 20) return false;
        if (e.y > this.canvas.height - 70 && Math.abs(e.x - this.tankX) < 26) {
          this.lives--; this.livesEl.textContent = String(Math.max(0, this.lives));
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

    _drawTank(ctx, x, y, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x - 16, y - 8, 32, 16);
      ctx.fillRect(x - 4, y - 20, 8, 14);
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    }

    _draw() {
      const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
      ctx.fillStyle = "#1a2f1a"; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#ffe066";
      this.bullets.forEach((b) => ctx.fillRect(b.x - 2, b.y - 6, 4, 8));

      this.enemies.forEach((e) => this._drawTank(ctx, e.x, e.y, "#c0392b"));
      this._drawTank(ctx, this.tankX, H - 40, "#00e5c7");

      if (!this.running && this.lives <= 0) {
        ctx.fillStyle = "rgba(8,9,11,0.55)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#f5f3ef"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Game Over", W / 2, H / 2 - 8);
        ctx.font = "14px sans-serif";
        ctx.fillText("Score: " + this.score, W / 2, H / 2 + 16);
      }
    }

    start() {
      document.addEventListener("keydown", this._onKeyDown);
      document.addEventListener("keyup", this._onKeyUp);
      this._reset();
    }
    destroy() {
      cancelAnimationFrame(this.raf);
      this.running = false;
      document.removeEventListener("keydown", this._onKeyDown);
      document.removeEventListener("keyup", this._onKeyUp);
    }
  }

  window.TankBattleGame = TankBattleGame;
})();
