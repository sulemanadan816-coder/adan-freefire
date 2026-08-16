/* Space Shooter — drag/move to steer, auto-fires upward. Enemies descend
   from the top; destroy them for score, avoid collisions (3 lives).
   Mouse-move on desktop, touch-drag on mobile — same handler either way,
   which keeps mobile controls dead simple (no on-screen buttons needed). */
(function () {
  const HS_KEY = "adanGame_spaceshooter_best";

  class SpaceShooterGame {
    constructor(container) {
      this.container = container;
      this._loop = this._loop.bind(this);
      this._onMove = this._onMove.bind(this);
      this._buildDom();
    }

    _getHigh() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10); } catch (e) { return 0; } }
    _setHigh(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) { /* no-op */ } }

    _buildDom() {
      this.container.innerHTML = `
        <div class="gz-game-hud">
          <span>Score: <b id="ssScore">0</b></span>
          <span>Lives: <b id="ssLives">3</b></span>
          <span>Best: <b id="ssBest">${this._getHigh()}</b></span>
          <span id="ssStatus" style="color:var(--ember);"></span>
        </div>
        <canvas id="ssCanvas" style="width:100%;max-width:400px;aspect-ratio:2/3;background:#05060a;border:1px solid var(--border);border-radius:12px;display:block;margin:0 auto;touch-action:none;cursor:none;"></canvas>
        <div class="gz-game-controls">
          <button type="button" class="btn btn-secondary btn-sm" id="ssStartBtn">Start</button>
        </div>
        <p style="color:var(--text-3); font-size:12px; text-align:center; margin-top:8px;">Move your mouse, or drag your finger, to steer. Fires automatically.</p>`;

      this.canvas = this.container.querySelector("#ssCanvas");
      this.canvas.width = 320; this.canvas.height = 480;
      this.ctx = this.canvas.getContext("2d");
      this.scoreEl = this.container.querySelector("#ssScore");
      this.livesEl = this.container.querySelector("#ssLives");
      this.bestEl = this.container.querySelector("#ssBest");
      this.statusEl = this.container.querySelector("#ssStatus");
      this.container.querySelector("#ssStartBtn").addEventListener("click", () => this._reset());
      this.canvas.addEventListener("mousemove", this._onMove);
      this.canvas.addEventListener("touchmove", (e) => { e.preventDefault(); this._onMove(e.touches[0]); }, { passive: false });
      this.canvas.addEventListener("touchstart", (e) => { e.preventDefault(); this._onMove(e.touches[0]); }, { passive: false });
    }

    _onMove(evt) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      this.shipX = Math.max(20, Math.min(this.canvas.width - 20, (evt.clientX - rect.left) * scaleX));
    }

    _reset() {
      this.shipX = this.canvas.width / 2;
      this.bullets = []; this.enemies = []; this.stars = [];
      for (let i = 0; i < 40; i++) this.stars.push({ x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height, s: Math.random() * 1.5 + 0.5 });
      this.score = 0; this.lives = 3; this.running = true;
      this.lastFire = 0; this.lastSpawn = 0; this.spawnEvery = 900;
      this.scoreEl.textContent = "0"; this.livesEl.textContent = "3"; this.statusEl.textContent = "";
      cancelAnimationFrame(this.raf);
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this._loop);
    }

    _loop(now) {
      if (!this.running) return;
      const dt = Math.min(40, now - this.lastTime);
      this.lastTime = now;

      // auto-fire
      if (now - this.lastFire > 260) {
        this.lastFire = now;
        this.bullets.push({ x: this.shipX, y: this.canvas.height - 50 });
      }

      // spawn enemies, ramping difficulty with score
      if (now - this.lastSpawn > this.spawnEvery) {
        this.lastSpawn = now;
        this.enemies.push({ x: 20 + Math.random() * (this.canvas.width - 40), y: -20, vy: 1 + Math.random() * 1.2 + this.score / 400, r: 14 });
        this.spawnEvery = Math.max(380, this.spawnEvery - 8);
      }

      this.stars.forEach((s) => { s.y += 0.5 * (dt / 16); if (s.y > this.canvas.height) s.y = 0; });
      this.bullets.forEach((b) => (b.y -= 5 * (dt / 16)));
      this.bullets = this.bullets.filter((b) => b.y > -10);
      this.enemies.forEach((e) => (e.y += e.vy * (dt / 16)));

      // bullet-enemy collisions
      for (const e of this.enemies) {
        if (e.dead) continue;
        for (const b of this.bullets) {
          if (b.hit) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + 4) {
            e.dead = true; b.hit = true;
            this.score += 10;
            this.scoreEl.textContent = String(this.score);
            break;
          }
        }
      }
      this.bullets = this.bullets.filter((b) => !b.hit);

      // enemy reaches bottom / hits ship
      this.enemies = this.enemies.filter((e) => {
        if (e.dead) return false;
        if (e.y > this.canvas.height + 20) return false;
        if (e.y > this.canvas.height - 60 && Math.abs(e.x - this.shipX) < 22) {
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

    _draw() {
      const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
      ctx.fillStyle = "#05060a"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      this.stars.forEach((s) => ctx.fillRect(s.x, s.y, s.s, s.s));

      ctx.fillStyle = "#00e5c7";
      this.bullets.forEach((b) => ctx.fillRect(b.x - 2, b.y - 8, 4, 10));

      ctx.fillStyle = "#ff4d1c";
      this.enemies.forEach((e) => {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      });

      // ship (simple triangle)
      ctx.fillStyle = "#f5f3ef";
      ctx.beginPath();
      ctx.moveTo(this.shipX, H - 50);
      ctx.lineTo(this.shipX - 16, H - 22);
      ctx.lineTo(this.shipX + 16, H - 22);
      ctx.closePath(); ctx.fill();

      if (!this.running && this.lives <= 0) {
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
      this.canvas.removeEventListener("mousemove", this._onMove);
    }
  }

  window.SpaceShooterGame = SpaceShooterGame;
})();
