/* Memory Cards — flip pairs, track moves + time, best score in localStorage. */
(function () {
  const HS_KEY = "adanGame_memory_best_moves";
  const ICONS = ["🔥","💎","🎯","⚡","🏆","🎮","🚀","🛡️"];
  class MemoryGame {
    constructor(container) { this.container = container; this._buildDom(); }
    _getBest() { try { return parseInt(localStorage.getItem(HS_KEY) || "0", 10) || null; } catch (e) { return null; } }
    _setBest(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) {} }
    _buildDom() {
      const best = this._getBest();
      this.container.innerHTML = `
        <div class="gz-game-hud"><span>Moves: <b id="mmMoves">0</b></span><span>Best: <b id="mmBest">${best || "—"}</b></span></div>
        <div id="mmGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:340px;margin:0 auto;"></div>
        <div class="gz-game-controls"><button type="button" class="btn btn-secondary btn-sm" id="mmRestartBtn">Restart</button></div>`;
      this.grid = this.container.querySelector("#mmGrid");
      this.movesEl = this.container.querySelector("#mmMoves");
      this.bestEl = this.container.querySelector("#mmBest");
      this.container.querySelector("#mmRestartBtn").addEventListener("click", () => this._reset());
    }
    _reset() {
      const deck = [...ICONS, ...ICONS].map((v) => ({ v, matched: false }));
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      this.deck = deck; this.flipped = []; this.moves = 0; this.locked = false;
      this.movesEl.textContent = "0";
      this.grid.innerHTML = "";
      deck.forEach((card, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.style.cssText = "aspect-ratio:1/1;font-size:22px;border-radius:10px;background:var(--bg-panel-2);border:1px solid var(--border);cursor:pointer;";
        btn.textContent = "❔";
        btn.addEventListener("click", () => this._flip(i, btn));
        this.grid.appendChild(btn);
      });
      this.buttons = Array.from(this.grid.children);
    }
    _flip(i, btn) {
      if (this.locked || this.deck[i].matched || this.flipped.some((f) => f.i === i)) return;
      btn.textContent = this.deck[i].v;
      this.flipped.push({ i, btn });
      if (this.flipped.length === 2) {
        this.moves++; this.movesEl.textContent = String(this.moves);
        this.locked = true;
        const [a, b] = this.flipped;
        if (this.deck[a.i].v === this.deck[b.i].v) {
          this.deck[a.i].matched = true; this.deck[b.i].matched = true;
          this.flipped = []; this.locked = false;
          if (this.deck.every((c) => c.matched)) this._onWin();
        } else {
          setTimeout(() => {
            a.btn.textContent = "❔"; b.btn.textContent = "❔";
            this.flipped = []; this.locked = false;
          }, 700);
        }
      }
    }
    _onWin() {
      const best = this._getBest();
      if (!best || this.moves < best) { this._setBest(this.moves); this.bestEl.textContent = String(this.moves); }
    }
    start() { this._reset(); }
    destroy() {}
  }
  window.MemoryGame = MemoryGame;
})();
