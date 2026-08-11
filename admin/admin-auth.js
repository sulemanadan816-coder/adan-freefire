/* =========================================================================
   ADMIN AUTH GUARD
   Include this on every /admin/*.html page AFTER supabase-js + supabase.js.
   - On login.html: exposes window.adminLogin(email, password)
   - On protected pages: call requireAdmin() which redirects to login.html
     if there's no session, or the logged-in user isn't owner/admin.
   ========================================================================= */

async function requireAdmin() {
  const { data: { session } } = await window.db.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return null;
  }

  const { data: profile, error } = await window.db
    .from("profiles")
    .select("id, email, role")
    .eq("id", session.user.id)
    .single();

  if (error || !profile || !["owner", "admin"].includes(profile.role)) {
    await window.db.auth.signOut();
    window.location.href = "login.html?error=unauthorized";
    return null;
  }

  return profile;
}

async function adminLogin(email, password) {
  const { data, error } = await window.db.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };

  const { data: profile } = await window.db
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (!profile || !["owner", "admin"].includes(profile.role)) {
    await window.db.auth.signOut();
    return { ok: false, message: "This account does not have admin access." };
  }

  return { ok: true };
}

async function adminLogout() {
  await window.db.auth.signOut();
  window.location.href = "login.html";
}

async function logAudit(action, recordId, details) {
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
    console.error("audit log failed", e);
  }
}
