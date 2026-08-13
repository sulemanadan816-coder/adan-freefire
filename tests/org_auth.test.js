/*
 * Real test of org/org-auth.js's orgSignup() flow, using Node's vm module
 * to run the ACTUAL file (not a mirror) against a mocked window.db that
 * records every call it receives. As of migration_signup_rpc.sql, the
 * five post-auth writes (organization, membership, settings, branding,
 * trial subscription) collapse into ONE atomic RPC call
 * (signup_organization) instead of five separate requests — this test
 * verifies orgSignup() calls that RPC with the right arguments and
 * handles its success/failure correctly, and that the email-confirmation
 * branch still stops before attempting it at all.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "org", "org-auth.js"), "utf8");

function makeMockDb({ hasSession = true, rpcError = null, rpcResult = [{ organization_id: "org-123" }] } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      signUp: async ({ email }) => {
        calls.push({ op: "signUp", email });
        if (!hasSession) return { data: { user: { id: "user-1" }, session: null }, error: null };
        return { data: { user: { id: "user-1" }, session: { access_token: "t" } }, error: null };
      },
      // Added because a later change to org-auth.js (outside this turn's
      // scope — see chat response) calls this from logOrgAudit(); stubbed
      // minimally so this test can still tell real failures apart from
      // "mock is missing a method".
      getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }),
    },
    rpc: async (name, args) => {
      calls.push({ op: "rpc", name, args });
      if (rpcError) return { data: null, error: rpcError };
      return { data: rpcResult, error: null };
    },
    from: () => ({ insert: () => { throw new Error("orgSignup should not call .from().insert() directly anymore — it must go through the signup_organization RPC"); } }),
  };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.stack.split("\n").slice(0,3).join("\n        ")}`); failed++; }
}

function runInSandbox(db) {
  const context = { window: { db }, console };
  vm.createContext(context);
  vm.runInContext(src, context, { filename: "org-auth.js" });
  return context;
}

(async () => {
  console.log("org-auth.js signup flow tests (Node vm — runs the real file)\n");

  await (async () => {
    const db = makeMockDb({ hasSession: true });
    const ctx = runInSandbox(db);
    const result = await ctx.orgSignup({ fullName: "Ada Organizer", orgName: "Adan Esports", email: "ada@example.com", password: "password123", whatsapp: "0300" });
    test("happy path -> ok:true with an organizationId from the RPC", () => {
      if (!result.ok) throw new Error("expected ok:true, got " + JSON.stringify(result));
      if (result.organizationId !== "org-123") throw new Error("expected organizationId 'org-123', got " + result.organizationId);
    });
    test("happy path -> calls signUp then exactly one RPC call (not 5 separate inserts)", () => {
      const ops = db.calls.map(c => c.op);
      if (JSON.stringify(ops) !== JSON.stringify(["signUp", "rpc"])) {
        throw new Error(`expected ["signUp","rpc"], got ${JSON.stringify(ops)}`);
      }
    });
    test("RPC is called with the org name, email, and whatsapp as named args", () => {
      const rpcCall = db.calls.find(c => c.op === "rpc");
      if (rpcCall.name !== "signup_organization") throw new Error("expected RPC name 'signup_organization'");
      if (rpcCall.args.p_org_name !== "Adan Esports") throw new Error("expected p_org_name 'Adan Esports'");
      if (rpcCall.args.p_contact_email !== "ada@example.com") throw new Error("expected p_contact_email set");
      if (rpcCall.args.p_contact_phone !== "0300") throw new Error("expected p_contact_phone set");
    });
  })();

  await (async () => {
    const db = makeMockDb({ hasSession: false });
    const ctx = runInSandbox(db);
    const result = await ctx.orgSignup({ fullName: "Ada", orgName: "Org", email: "ada@example.com", password: "password123", whatsapp: "0300" });
    test("email confirmation required -> stops before calling the RPC at all", () => {
      if (!result.needsEmailConfirmation) throw new Error("expected needsEmailConfirmation:true");
      const rpcCalls = db.calls.filter(c => c.op === "rpc");
      if (rpcCalls.length !== 0) throw new Error(`expected 0 RPC calls before email confirmation, got ${rpcCalls.length}`);
    });
  })();

  await (async () => {
    const db = makeMockDb({ hasSession: true, rpcError: { message: "organization name required" } });
    const ctx = runInSandbox(db);
    const result = await ctx.orgSignup({ fullName: "Ada", orgName: "", email: "ada@example.com", password: "password123", whatsapp: "0300" });
    test("RPC failure -> ok:false, step:'organization', error message surfaced", () => {
      if (result.ok) throw new Error("expected ok:false");
      if (result.step !== "organization") throw new Error("expected step 'organization', got " + result.step);
      if (!result.message.includes("organization name required")) throw new Error("expected the RPC's error message to be surfaced, got: " + result.message);
    });
  })();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
