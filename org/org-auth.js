/* =========================================================================
   ORGANIZER AUTH GUARD
   Include this on every /org/*.html page AFTER supabase-js + ../supabase.js.
   - On signup.html: window.orgSignup(orgName, email, password)
   - On login.html: window.orgLogin(email, password)
   - On protected pages (dashboard.html etc): call requireOrg() which
     redirects to login.html if there's no session or no org membership.
   Reuses the same Supabase project/auth as the single-tenant admin panel
   (../supabase.js) — organizers are just auth users with a row in
   organization_members instead of profiles.role in ('owner','admin').
   ========================================================================= */

async function requireOrg() {
  const { data: { session } } = await window.db.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return null;
  }

  const { data: membership, error } = await window.db
    .from("organization_members")
    .select("organization_id, role, organizations(name)")
    .eq("user_id", session.user.id)
    .limit(1)
    .maybeSingle();

  if (error || !membership) {
    window.location.href = "login.html?error=no_org";
    return null;
  }

  return { session, membership };
}

async function orgSignup(orgName, email, password) {
  const { data: signUpData, error: signUpError } = await window.db.auth.signUp({ email, password });
  if (signUpError) return { ok: false, message: signUpError.message };

  // If email confirmation is required, there is no session yet — the org
  // can't be provisioned (signup_organization() requires auth.uid()) until
  // the user confirms and logs in. Tell them clearly rather than failing silently.
  if (!signUpData.session) {
    return {
      ok: true,
      needsEmailConfirm: true,
      message: "Check your email to confirm your account, then log in to finish setting up your organization.",
    };
  }

  const { data: rpcData, error: rpcError } = await window.db.rpc("signup_organization", {
    p_org_name: orgName,
  });

  if (rpcError) {
    return { ok: false, message: "Account created, but organization setup failed: " + rpcError.message };
  }

  await logOrgAudit("organization_created", rpcData && rpcData[0] ? rpcData[0].organization_id : null, {
    organization_name: orgName,
  });

  return { ok: true, needsEmailConfirm: false };
}

async function orgLogin(email, password) {
  const { data, error } = await window.db.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };

  const { data: membership } = await window.db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    await window.db.auth.signOut();
    return { ok: false, message: "This account isn't linked to any organization yet." };
  }

  return { ok: true };
}

async function orgLogout() {
  await window.db.auth.signOut();
  window.location.href = "login.html";
}

// Same audit_logs table the admin panel uses (admin_id just means "the
// authenticated user who performed the action" — reused here for org events).
async function logOrgAudit(action, recordId, details) {
  try {
    const { data: { session } } = await window.db.auth.getSession();
    if (!session) return;
    const mergedDetails = Object.assign(
      {},
      details || {},
      { device: (typeof navigator !== "undefined" && navigator.userAgent) || null }
    );
    await window.db.from("audit_logs").insert([{
      admin_id: session.user.id,
      action,
      record_id: recordId || null,
      details: mergedDetails,
    }]);
  } catch (e) {
    console.error("org audit log failed", e);
  }
}
