/* Tic-Tac-Toe — vs simple AI (blocks/wins when possible, else random). */
(function () {
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  class TicTacToeGame {
    constructor(container) { this.container = container; this._buildDom(); }
    _buildDom() {
      this.container.innerHTML = `
        <div class="gz-game-hud"><span id="tcStatus">Your turn (X)</span></div>
        <div id="tcGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:260px;margin:0 auto;"></div>
        <div class="gz-game-controls"><button type="button" class="btn btn-secondary btn-sm" id="tcRestartBtn">Restart</button></div>`;
      this.grid = this.container.querySelector("#tcGrid");
      this.statusEl = this.container.querySelector("#tcStatus");
      this.container.querySelector("#tcRestartBtn").addEventListener("click", () => this._reset());
    }
    _reset() {
      this.board = Array(9).fill(null); this.over = false;
      this.statusEl.textContent = "Your turn (X)";
      this.grid.innerHTML = "";
      this.board.forEach((_, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.style.cssText = "aspect-ratio:1/1;font-size:28px;font-weight:800;border-radius:10px;background:var(--bg-panel-2);border:1px solid var(--border);cursor:pointer;color:var(--text-1);";
        btn.addEventListener("click", () => this._play(i, btn));
        this.grid.appendChild(btn);
      });
      this.buttons = Array.from(this.grid.children);
    }
    _play(i, btn) {
      if (this.over || this.board[i]) return;
      this.board[i] = "X"; btn.textContent = "X";
      if (this._checkEnd()) return;
      this.statusEl.textContent = "CPU thinking…";
      setTimeout(() => this._cpuMove(), 350);
    }
    _cpuMove() {
      let move = this._findWinning("O") ?? this._findWinning("X") ?? this._bestOpenSpot();
      if (move == null) return;
      this.board[move] = "O"; this.buttons[move].textContent = "O";
      if (this._checkEnd()) return;
      this.statusEl.textContent = "Your turn (X)";
    }
    _findWinning(mark) {
      for (const line of LINES) {
        const vals = line.map((i) => this.board[i]);
        if (vals.filter((v) => v === mark).length === 2 && vals.includes(null)) {
          return line[vals.indexOf(null)];
        }
      }
      return null;
    }
    _bestOpenSpot() {
      if (this.board[4] == null) return 4;
      const open = this.board.map((v, i) => (v == null ? i : null)).filter((v) => v != null);
      return open.length ? open[Math.floor(Math.random() * open.length)] : null;
    }
    _checkEnd() {
      for (const line of LINES) {
        const [a, b, c] = line.map((i) => this.board[i]);
        if (a && a === b && b === c) {
          this.over = true;
          this.statusEl.textContent = a === "X" ? "You win! 🎉" : "CPU wins — try again.";
          return true;
        }
      }
      if (this.board.every((v) => v)) { this.over = true; this.statusEl.textContent = "Draw!"; return true; }
      return false;
    }
    start() { this._reset(); }
    destroy() {}
  }
  window.TicTacToeGame = TicTacToeGame;
})();
