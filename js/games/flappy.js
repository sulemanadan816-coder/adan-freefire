/* Flappy Dash — tap/click/space to flap, avoid pipes, score increments per
   pipe passed. Canvas-based, keyboard + touch. */
(function () {
  const HS_KEY = "adanGame_flappy_highscore";
  class FlappyGame {
    constructor(container) { this.container = container; this._loop = this._loop.bind(this); this._flap = this._flap.bind(this); this._buildDom(); }
    _buildDom() {
      this.container.innerHTML = `
        <div class="gz-game-hud"><span>Score: <b id="flScore">0</b></span><span>Best: <b id="flBest">${this._getHigh()}</b></span><span id="flStatus" style="color:var(--ember);"></span></div>
        <canvas id="flCanvas" style="width:100%;max-width:360px;aspect-ratio:2/3;background:var(--bg-panel-2);border:1px solid var(--border);border-radius:12px;display:block;margin:0 auto;touch-action:none;"></canvas>
        <div class="gz-game-controls"><button type="button" class="btn btn-secondary btn-sm" id="flRestartBtn">Restart</button></div>
        <p style="color:var(--text-3); font-size:12px; text-align:center; margin-top:8px;">Tap / Click / Space to flap.</p>`;
      this.canvas = this.container.querySelector("#flCanvas");
      this.canvas.width = 300; this.canvas.height = 450;
      this.ctx = this.canvas.getContext("2d");
      this.scoreEl = this.container.querySelector("#flScore");
      this.bestEl = this.container.querySelector("#flBest");
      this.statusEl = this.container.querySelector("#flStatus");
      this.container.querySelector("#flRestartBtn").addEventListener("click", () => this._reset());
      this.canvas.addEventListener("mousedown", this._flap);
      this.canvas.addEventListener("touchstart", (e) => { e.preventDefault(); this._flap(); }, { passive: false });
    }
    _getHigh() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10); } catch (e) { return 0; } }
    _setHigh(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) {} }
    _reset() {
      this.bird = { x: 70, y: 200, vy: 0 };
      this.pipes = [{ x: 320, gapY: 180 }];
      this.score = 0; this.state = "running"; this.statusEl.textContent = "";
      this.scoreEl.textContent = "0";
      cancelAnimationFrame(this.raf);
      this._loop();
    }
    _flap() { if (this.state === "over") { this._reset(); return; } this.bird.vy = -6.2; }
    _onKey(e) { if (e.key === " ") { e.preventDefault(); this._flap(); } }
    _loop() {
      if (this.state !== "running") return;
      const b = this.bird;
      b.vy += 0.35; b.y += b.vy;
      this.pipes.forEach((p) => (p.x -= 2.4));
      if (this.pipes[this.pipes.length - 1].x < 150) this.pipes.push({ x: 320, gapY: 60 + Math.random() * 260 });
      if (this.pipes[0].x < -50) { this.pipes.shift(); this.score++; this.scoreEl.textContent = String(this.score); }

      const gap = 130;
      for (const p of this.pipes) {
        const hitX = b.x + 12 > p.x && b.x - 12 < p.x + 40;
        const hitY = b.y - 12 < p.gapY - gap / 2 || b.y + 12 > p.gapY + gap / 2;
        if (hitX && hitY) { this._gameOver(); return; }
      }
      if (b.y > 450 || b.y < 0) { this._gameOver(); return; }
      this._draw(gap);
      this.raf = requestAnimationFrame(this._loop);
    }
    _gameOver() {
      this.state = "over";
      const best = this._getHigh();
      if (this.score > best) { this._setHigh(this.score); this.bestEl.textContent = String(this.score); }
      this.statusEl.textContent = "Game Over — tap to restart";
      this._draw(130);
    }
    _draw(gap) {
      const ctx = this.ctx;
      ctx.fillStyle = "#0d1b1a"; ctx.fillRect(0, 0, 300, 450);
      ctx.fillStyle = "#00e5c7";
      this.pipes.forEach((p) => {
        ctx.fillRect(p.x, 0, 40, p.gapY - gap / 2);
        ctx.fillRect(p.x, p.gapY + gap / 2, 40, 450 - (p.gapY + gap / 2));
      });
      ctx.fillStyle = "#ff4d1c";
      ctx.beginPath(); ctx.arc(this.bird.x, this.bird.y, 12, 0, Math.PI * 2); ctx.fill();
    }
    start() { document.addEventListener("keydown", (this._onKeyBound = this._onKey.bind(this))); this._reset(); }
    destroy() { cancelAnimationFrame(this.raf); document.removeEventListener("keydown", this._onKeyBound); }
  }
  window.FlappyGame = FlappyGame;
})();
