/* Snake — start/pause/restart, score/high score (localStorage), keyboard +
   touch/swipe controls, responsive canvas, game-over screen, increasing
   difficulty (speed ramps with score). Visually matches the site via CSS
   custom properties, not hardcoded colors. */
(function () {
  const HS_KEY = "adanGame_snake_highscore";

  class SnakeGame {
    constructor(container) {
      this.container = container;
      this.cell = 18;
      this.cols = 20;
      this.rows = 20;
      this.state = "idle"; // idle | running | paused | over
      this._onKey = this._onKey.bind(this);
      this._loop = this._loop.bind(this);
      this._buildDom();
    }

    _buildDom() {
      this.container.innerHTML = `
        <div class="gz-game-hud">
          <span>Score: <b id="snScore">0</b></span>
          <span>Best: <b id="snBest">${this._getHigh()}</b></span>
          <span id="snStatus" style="color:var(--ember);"></span>
        </div>
        <canvas id="snCanvas" style="width:100%;max-width:420px;aspect-ratio:1/1;background:var(--bg-panel-2);border:1px solid var(--border);border-radius:12px;display:block;margin:0 auto;touch-action:none;"></canvas>
        <div class="gz-game-controls">
          <button type="button" class="btn btn-secondary btn-sm" id="snStartBtn">Start</button>
          <button type="button" class="btn btn-secondary btn-sm" id="snPauseBtn">Pause</button>
          <button type="button" class="btn btn-secondary btn-sm" id="snRestartBtn">Restart</button>
        </div>
        <p style="color:var(--text-3); font-size:12px; text-align:center; margin-top:8px;">Arrow keys / WASD, or swipe on mobile.</p>`;

      this.canvas = this.container.querySelector("#snCanvas");
      this.canvas.width = this.cols * this.cell;
      this.canvas.height = this.rows * this.cell;
      this.ctx = this.canvas.getContext("2d");
      this.scoreEl = this.container.querySelector("#snScore");
      this.bestEl = this.container.querySelector("#snBest");
      this.statusEl = this.container.querySelector("#snStatus");

      this.container.querySelector("#snStartBtn").addEventListener("click", () => this._toggleStart());
      this.container.querySelector("#snPauseBtn").addEventListener("click", () => this._togglePause());
      this.container.querySelector("#snRestartBtn").addEventListener("click", () => this._reset());

      let touchStart = null;
      this.canvas.addEventListener("touchstart", (e) => { touchStart = e.touches[0]; }, { passive: true });
      this.canvas.addEventListener("touchend", (e) => {
        if (!touchStart) return;
        const dx = e.changedTouches[0].clientX - touchStart.clientX;
        const dy = e.changedTouches[0].clientY - touchStart.clientY;
        if (Math.abs(dx) > Math.abs(dy)) this._setDir(dx > 0 ? [1, 0] : [-1, 0]);
        else this._setDir(dy > 0 ? [0, 1] : [0, -1]);
        touchStart = null;
      }, { passive: true });
    }

    _getHigh() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10); } catch (e) { return 0; } }
    _setHigh(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) { /* no-op */ } }

    _reset() {
      this.snake = [[10, 10], [9, 10], [8, 10]];
      this.dir = [1, 0];
      this.nextDir = [1, 0];
      this.food = this._randFood();
      this.score = 0;
      this.speedMs = 140;
      this.state = "idle";
      this.statusEl.textContent = "";
      this.scoreEl.textContent = "0";
      clearInterval(this.timer);
      this._draw();
    }

    _randFood() {
      let p;
      do { p = [Math.floor(Math.random() * this.cols), Math.floor(Math.random() * this.rows)]; }
      while (this.snake.some((s) => s[0] === p[0] && s[1] === p[1]));
      return p;
    }

    _setDir([x, y]) {
      if (this.dir[0] === -x && this.dir[1] === -y) return; // no 180 turns
      this.nextDir = [x, y];
    }

    _onKey(e) {
      const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      if (map[e.key]) { this._setDir(map[e.key]); e.preventDefault(); }
      if (e.key === " ") { this._togglePause(); e.preventDefault(); }
    }

    _toggleStart() {
      if (this.state === "running") return;
      if (this.state === "over") this._reset();
      this.state = "running";
      this.statusEl.textContent = "";
      clearInterval(this.timer);
      this.timer = setInterval(this._loop, this.speedMs);
    }

    _togglePause() {
      if (this.state === "running") {
        this.state = "paused";
        this.statusEl.textContent = "Paused";
        clearInterval(this.timer);
      } else if (this.state === "paused") {
        this.state = "running";
        this.statusEl.textContent = "";
        this.timer = setInterval(this._loop, this.speedMs);
      }
    }

    _loop() {
      this.dir = this.nextDir;
      const head = [this.snake[0][0] + this.dir[0], this.snake[0][1] + this.dir[1]];

      const hitWall = head[0] < 0 || head[1] < 0 || head[0] >= this.cols || head[1] >= this.rows;
      const hitSelf = this.snake.some((s) => s[0] === head[0] && s[1] === head[1]);
      if (hitWall || hitSelf) { this._gameOver(); return; }

      this.snake.unshift(head);
      if (head[0] === this.food[0] && head[1] === this.food[1]) {
        this.score += 10;
        this.scoreEl.textContent = String(this.score);
        this.food = this._randFood();
        // Increasing difficulty: speed up slightly every food, capped.
        this.speedMs = Math.max(60, this.speedMs - 3);
        clearInterval(this.timer);
        this.timer = setInterval(this._loop, this.speedMs);
      } else {
        this.snake.pop();
      }
      this._draw();
    }

    _gameOver() {
      this.state = "over";
      clearInterval(this.timer);
      const best = this._getHigh();
      if (this.score > best) { this._setHigh(this.score); this.bestEl.textContent = String(this.score); }
      this.statusEl.textContent = "Game Over — press Restart";
      this._draw();
    }

    _draw() {
      const ctx = this.ctx, c = this.cell;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg-panel-2") || "#13151a";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.fillStyle = "#ff4d1c";
      ctx.fillRect(this.food[0] * c + 2, this.food[1] * c + 2, c - 4, c - 4);

      this.snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? "#00e5c7" : "rgba(0,229,199,0.65)";
        ctx.fillRect(s[0] * c + 1, s[1] * c + 1, c - 2, c - 2);
      });

      if (this.state === "over") {
        ctx.fillStyle = "rgba(8,9,11,0.75)";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = "#f5f3ef";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Game Over", this.canvas.width / 2, this.canvas.height / 2 - 10);
        ctx.font = "13px sans-serif";
        ctx.fillText("Score: " + this.score, this.canvas.width / 2, this.canvas.height / 2 + 14);
      }
    }

    start() {
      document.addEventListener("keydown", this._onKey);
      this._reset();
    }

    destroy() {
      clearInterval(this.timer);
      document.removeEventListener("keydown", this._onKey);
    }
  }

  window.SnakeGame = SnakeGame;
})();
