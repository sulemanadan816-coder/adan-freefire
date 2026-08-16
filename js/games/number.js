/* Number Challenge — quick mental-math: solve as many as possible in 30s. */
(function () {
  const HS_KEY = "adanGame_number_best";
  class NumberGame {
    constructor(container) { this.container = container; this._buildDom(); }
    _getBest() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10); } catch (e) { return 0; } }
    _setBest(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) {} }
    _buildDom() {
      this.container.innerHTML = `
        <div class="gz-game-hud"><span>Score: <b id="nbScore">0</b></span><span>Time: <b id="nbTime">30</b>s</span><span>Best: <b id="nbBest">${this._getBest()}</b></span></div>
        <div id="nbQuestion" style="text-align:center;font-size:30px;font-weight:800;margin:20px 0;color:var(--text-1);">Press Start</div>
        <input id="nbInput" type="number" inputmode="numeric" style="display:block;margin:0 auto 12px;width:140px;text-align:center;font-size:18px;padding:10px;border-radius:8px;background:var(--bg-panel-2);border:1px solid var(--border);color:var(--text-1);" disabled />
        <div class="gz-game-controls"><button type="button" class="btn btn-secondary btn-sm" id="nbStartBtn">Start</button></div>`;
      this.qEl = this.container.querySelector("#nbQuestion");
      this.scoreEl = this.container.querySelector("#nbScore");
      this.timeEl = this.container.querySelector("#nbTime");
      this.bestEl = this.container.querySelector("#nbBest");
      this.input = this.container.querySelector("#nbInput");
      this.container.querySelector("#nbStartBtn").addEventListener("click", () => this._start());
      this.input.addEventListener("keydown", (e) => { if (e.key === "Enter") this._check(); });
    }
    _newQuestion() {
      const ops = ["+", "-", "×"];
      const op = ops[Math.floor(Math.random() * ops.length)];
      let a = Math.floor(Math.random() * 20) + 1, b = Math.floor(Math.random() * 12) + 1;
      if (op === "-" && b > a) [a, b] = [b, a];
      this.answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
      this.qEl.textContent = `${a} ${op} ${b} = ?`;
    }
    _start() {
      this.score = 0; this.timeLeft = 30;
      this.scoreEl.textContent = "0"; this.timeEl.textContent = "30";
      this.input.disabled = false; this.input.value = ""; this.input.focus();
      this._newQuestion();
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.timeLeft--; this.timeEl.textContent = String(this.timeLeft);
        if (this.timeLeft <= 0) this._end();
      }, 1000);
      this._checkHandler = () => this._check();
      this.input.oninput = () => { if (this.input.value !== "" && Number(this.input.value) === this.answer) this._check(); };
    }
    _check() {
      if (Number(this.input.value) === this.answer) {
        this.score++; this.scoreEl.textContent = String(this.score);
      }
      this.input.value = "";
      this._newQuestion();
    }
    _end() {
      clearInterval(this.timer);
      this.input.disabled = true;
      this.qEl.textContent = `Time's up! Score: ${this.score}`;
      const best = this._getBest();
      if (this.score > best) { this._setBest(this.score); this.bestEl.textContent = String(this.score); }
    }
    start() {}
    destroy() { clearInterval(this.timer); }
  }
  window.NumberGame = NumberGame;
})();
