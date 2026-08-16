/* Quick Tap Challenge — tap the button as many times as possible in 10s. */
(function () {
  const HS_KEY = "adanGame_quicktap_best";
  class QuickTapGame {
    constructor(container) { this.container = container; this._buildDom(); }
    _getBest() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10); } catch (e) { return 0; } }
    _setBest(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) {} }
    _buildDom() {
      this.container.innerHTML = `
        <div class="gz-game-hud"><span>Taps: <b id="qtCount">0</b></span><span>Time: <b id="qtTime">10</b>s</span><span>Best: <b id="qtBest">${this._getBest()}</b></span></div>
        <button type="button" id="qtBtn" style="display:block;margin:20px auto;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #ff8a4c, #ff4d1c);border:none;color:#fff;font-weight:800;font-size:18px;cursor:pointer;touch-action:manipulation;">TAP</button>`;
      this.countEl = this.container.querySelector("#qtCount");
      this.timeEl = this.container.querySelector("#qtTime");
      this.bestEl = this.container.querySelector("#qtBest");
      this.btn = this.container.querySelector("#qtBtn");
      this.btn.addEventListener("click", () => this._tap());
    }
    _tap() {
      if (this.ended) return;
      if (!this.running) this._start();
      this.count++; this.countEl.textContent = String(this.count);
    }
    _start() {
      this.running = true; this.ended = false; this.count = 0; this.timeLeft = 10;
      this.timeEl.textContent = "10"; this.countEl.textContent = "0";
      this.btn.textContent = "GO!";
      this.timer = setInterval(() => {
        this.timeLeft--; this.timeEl.textContent = String(this.timeLeft);
        if (this.timeLeft <= 0) this._end();
      }, 1000);
    }
    _end() {
      clearInterval(this.timer);
      this.running = false; this.ended = true;
      this.btn.textContent = "Tap to retry";
      this.btn.onclick = () => { this.ended = false; this.btn.onclick = () => this._tap(); this._start(); };
      const best = this._getBest();
      if (this.count > best) { this._setBest(this.count); this.bestEl.textContent = String(this.count); }
    }
    start() {}
    destroy() { clearInterval(this.timer); }
  }
  window.QuickTapGame = QuickTapGame;
})();
