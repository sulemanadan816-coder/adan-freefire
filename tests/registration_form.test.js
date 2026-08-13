/*
 * Real DOM test of the registration form, loading the ACTUAL js/app.js,
 * config.js, and index.html markup via jsdom — not a logic mirror. This
 * exercises the exact code path a real browser would run.
 *
 * Run: node tests/registration_form.test.js   (from the project root)
 * Requires: npm install jsdom   (devDependency only, not shipped to prod)
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const configSrc = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
const appSrc = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

let passed = 0, failed = 0;
const failures = [];

async function withPage(setupDb, run, { forceFreeEntry = false } = {}) {
  // No `resources: "usable"` — we load config.js/app.js ourselves via
  // eval() below, so we don't want jsdom trying (and failing) to fetch the
  // <script src="..."> tags already present in index.html over the network.
  const dom = new JSDOM(htmlSrc, { runScripts: "dangerously", url: "https://example.test/" });
  const { window } = dom;

  // Stub browser APIs jsdom doesn't implement but app.js's non-registration
  // code paths (nav scroll-spy, etc.) touches during init().
  window.navigator.clipboard = { writeText: () => Promise.resolve() };
  window.IntersectionObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLMediaElement && (window.HTMLMediaElement.prototype.play = () => Promise.resolve());
  // Use window.setTimeout (jsdom's own timer queue, cleared by
  // dom.window.close() below), not Node's bare setTimeout — a bare
  // setTimeout here would be a real Node timer that can fire AFTER this
  // window is closed and corrupt the next test's run.
  window.requestAnimationFrame = (cb) => window.setTimeout(cb, 0);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);

  const insertedRows = [];
  window.db = setupDb ? setupDb(insertedRows) : {
    from: (table) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: (rows) => { insertedRows.push(...rows); return Promise.resolve({ data: rows, error: null }); },
    }),
  };
  window.ACTIVE_TOURNAMENT_ID = "test-tournament-id";

  // Load config.js then app.js into the jsdom window (real files,
  // unmodified). Combined into one eval call so config.js's top-level
  // `const CONFIG` is visible to app.js — two separate window.eval() calls
  // each get their own lexical scope in Node/jsdom (unlike two <script>
  // tags in a real browser, which share one), so this mirrors real
  // browser behavior more closely than evaluating them separately would.
  // config.js's demo tournament defaults to a PAID entry (isFreeEntry:
  // false) — for the one test that needs a free tournament, patch that
  // single literal in the real file's source before eval, rather than
  // hand-writing a second config file that could drift from the real one.
  const effectiveConfigSrc = forceFreeEntry
    ? configSrc.replace(/isFreeEntry:\s*false/, "isFreeEntry: true")
    : configSrc;
  window.eval(effectiveConfigSrc + "\n;\n" + appSrc);

  // app.js's init() runs on DOMContentLoaded — jsdom already fired that
  // before runScripts finished for inline scripts, but since we eval'd
  // app.js AFTER the document parsed, readyState is "complete", so its own
  // `if (document.readyState === "loading")` branch takes the `else` path
  // and calls init() synchronously — confirmed by reading the file's tail.
  await new Promise((r) => setTimeout(r, 30)); // let any async CONFIG hydration settle

  try {
    await run(window, insertedRows);
  } finally {
    dom.window.close();
  }
}

function fill(window, id, value) {
  const el = window.document.getElementById(id);
  el.value = value;
  return el;
}

function addExtraPlayers(window, n, startUid) {
  // Registration form starts with 3 rows (captain + 3 = 4 total) already
  // rendered by initRegistrationForm(). Fill however many currently exist.
  const rows = window.document.querySelectorAll(".player-row");
  return rows;
}

function fillValidBaseForm(window) {
  fill(window, "teamName", "Test Squad");
  fill(window, "captainName", "Captain Test");
  fill(window, "ign", "CaptainIGN");
  fill(window, "uid", "123456789");
  fill(window, "whatsapp", "03001234567");
  fill(window, "city", "Lahore");
  // config.js's demo tournament defaults to a PAID entry — fill these too
  // so tests that aren't specifically about payment validation don't fail
  // for an unrelated reason. Harmless no-ops if the tournament is free
  // (initPaymentCard() already un-requires these fields in that case).
  if (window.document.getElementById("txnId")) fill(window, "txnId", "TXN123456");
  if (window.document.getElementById("payerNumber")) fill(window, "payerNumber", "03001234567");
}

function fillAllPlayerUids(window, uids) {
  const rows = window.document.querySelectorAll(".player-row");
  rows.forEach((row, i) => {
    row.querySelector(".player-name").value = `Player ${i + 2}`;
    row.querySelector(".player-uid").value = uids[i] !== undefined ? uids[i] : "";
  });
}

async function submitAndWait(window) {
  const form = window.document.getElementById("regForm");
  const btn = window.document.getElementById("regSubmitBtn");
  form.dispatchEvent(new window.Event("submit", { cancelable: true, bubbles: true }));
  // Wait for the async submit handler + a couple microtask/timer turns.
  await new Promise((r) => setTimeout(r, 50));
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e.stack.split("\n").slice(0, 3).join("\n        ")}`);
    failed++;
    failures.push(name);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

(async () => {
  console.log("Registration form tests — real js/app.js + index.html via jsdom\n");

  // TEST: exactly 3 additional player rows render (captain + 3 = 4 total) — section 24
  await test("initRegistrationForm() renders exactly 3 additional player rows", async () => {
    await withPage(null, async (window) => {
      const rows = window.document.querySelectorAll(".player-row");
      assert(rows.length === 3, `expected 3 player rows, got ${rows.length}`);
    });
  });

  // TEST 4: all 4 UIDs valid (captain + 3) -> registration succeeds (insert called)
  await test("TEST 4: all UIDs valid -> registration succeeds", async () => {
    await withPage(null, async (window, insertedRows) => {
      fillValidBaseForm(window);
      fillAllPlayerUids(window, ["111111111", "222222222", "333333333"]);
      await submitAndWait(window);
      assert(insertedRows.length === 1, `expected 1 inserted row, got ${insertedRows.length}`);
      assert(insertedRows[0].players.length === 3, `expected players.length === 3, got ${insertedRows[0].players.length}`);
    });
  });

  // TEST 5/6/7: any missing player UID blocks submission
  for (const [label, missingIndex] of [["Player 2", 0], ["Player 3", 1], ["Player 4", 2]]) {
    await test(`TEST 5/6/7: missing ${label} UID -> registration rejected`, async () => {
      await withPage(null, async (window, insertedRows) => {
        fillValidBaseForm(window);
        const uids = ["111111111", "222222222", "333333333"];
        uids[missingIndex] = ""; // leave this one blank
        fillAllPlayerUids(window, uids);
        await submitAndWait(window);
        assert(insertedRows.length === 0, `expected no insert, got ${insertedRows.length}`);
        const rows = window.document.querySelectorAll(".player-row");
        assert(rows[missingIndex].querySelector(".field").classList.contains("has-error") ||
               rows[missingIndex].querySelector(".player-uid").closest(".field").classList.contains("has-error"),
               `expected has-error on the ${label} row`);
      });
    });
  }

  // TEST 1: valid email -> succeeds
  await test("TEST 1: valid email -> registration succeeds", async () => {
    await withPage(null, async (window, insertedRows) => {
      fillValidBaseForm(window);
      fill(window, "email", "captain@example.com");
      fillAllPlayerUids(window, ["111111111", "222222222", "333333333"]);
      await submitAndWait(window);
      assert(insertedRows.length === 1, "expected registration to succeed with a valid email");
      assert(insertedRows[0].email === "captain@example.com");
    });
  });

  // TEST 2: empty email -> still succeeds (section 23, the core new requirement)
  await test("TEST 2: empty email -> registration still succeeds", async () => {
    await withPage(null, async (window, insertedRows) => {
      fillValidBaseForm(window);
      fill(window, "email", "");
      fillAllPlayerUids(window, ["111111111", "222222222", "333333333"]);
      await submitAndWait(window);
      assert(insertedRows.length === 1, "expected registration to succeed with empty email");
      assert(insertedRows[0].email === "", `expected email '' in payload, got '${insertedRows[0].email}'`);
    });
  });

  // TEST 3: invalid (malformed) email -> rejected
  await test("TEST 3: invalid email -> registration rejected", async () => {
    await withPage(null, async (window, insertedRows) => {
      fillValidBaseForm(window);
      fill(window, "email", "not-an-email");
      fillAllPlayerUids(window, ["111111111", "222222222", "333333333"]);
      await submitAndWait(window);
      assert(insertedRows.length === 0, "expected registration to be rejected with a malformed email");
      const emailField = window.document.getElementById("email").closest(".field");
      assert(emailField.classList.contains("has-error"), "expected has-error on email field");
    });
  });

  // TEST 10: free tournament -> payment fields not required, hidden
  await test("TEST 10: free tournament -> payment card hidden, no txn/payer required", async () => {
    await withPage(null, async (window, insertedRows) => {
      const payCard = window.document.getElementById("payCard");
      assert(payCard.style.display === "none", "expected payCard hidden for a free tournament");
      fillValidBaseForm(window); // txnId/payerNumber filled but irrelevant — not required when free
      fillAllPlayerUids(window, ["111111111", "222222222", "333333333"]);
      await submitAndWait(window);
      assert(insertedRows.length === 1, "expected free-tournament registration to succeed");
      assert(insertedRows[0].payment_transaction_id === null, "expected null txn id for a free entry");
      assert(insertedRows[0].entry_fee_amount === 0, "expected 0 entry fee for a free entry");
    }, { forceFreeEntry: true });
  });

  // TEST 8/9: paid tournament -> transaction ID and payer number required
  await test("TEST 8/9: paid tournament -> missing txn ID / payer number blocks submission", async () => {
    await withPage(null, async (window, insertedRows) => {
      fill(window, "teamName", "Test Squad 2");
      fill(window, "captainName", "Captain Two");
      fill(window, "ign", "CaptIGN2");
      fill(window, "uid", "987654321");
      fill(window, "whatsapp", "03111234567");
      fill(window, "city", "Karachi");
      // Deliberately leave txnId / payerNumber blank — config.js's demo
      // tournament is paid by default, so this must be rejected.
      fillAllPlayerUids(window, ["111111111", "222222222", "333333333"]);
      await submitAndWait(window);
      assert(insertedRows.length === 0, "expected paid-tournament registration to be rejected without payment info");
      assert(window.document.getElementById("txnId").closest(".field").classList.contains("has-error"), "expected has-error on txnId");
      assert(window.document.getElementById("payerNumber").closest(".field").classList.contains("has-error"), "expected has-error on payerNumber");
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { console.log("Failed:", failures.join(", ")); }
  process.exit(failed ? 1 : 0);
})();
