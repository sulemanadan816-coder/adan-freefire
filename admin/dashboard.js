(async function () {
  const profile = await requireAdmin();
  if (!profile) return; // requireAdmin already redirected

  document.getElementById("adminUserLabel").textContent = `${profile.email} · ${profile.role.toUpperCase()}`;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    logAudit("Admin Logout", profile.id, null).finally(adminLogout);
  });

  const cards = document.querySelectorAll("#statsCards .stat-card .value");
  const [
    teamsCard, playersCard, pendingCard, approvedCard,
    rejectedCard, disqualifiedCard, slotsCard, prizeCard,
    statusCard, regStatusCard, nextMatchCard, liveCard,
  ] = cards;

  function setCard(el, text) {
    el.textContent = text;
    el.classList.remove("admin-loading");
  }

  try {
    // active tournament
    const { data: tournament } = await window.db
      .from("tournaments").select("*").eq("is_active", true).single();

    const tournamentId = tournament ? tournament.id : null;

    const [
      teamsRes, playersRes, regsRes, prizeRes, regSettingsRes, nextMatchRes,
    ] = await Promise.all([
      window.db.from("teams").select("id, status", { count: "exact" }),
      window.db.from("players").select("id", { count: "exact" }),
      window.db.from("registrations").select("id, status", { count: "exact" }),
      tournamentId ? window.db.from("prize_pools").select("*").eq("tournament_id", tournamentId).maybeSingle() : { data: null },
      tournamentId ? window.db.from("registration_settings").select("*").eq("tournament_id", tournamentId).maybeSingle() : { data: null },
      tournamentId ? window.db.from("matches").select("*").eq("tournament_id", tournamentId).in("status", ["upcoming", "checkin", "room_open", "live"]).order("scheduled_time", { ascending: true }).limit(1) : { data: [] },
    ]);

    const teams = teamsRes.data || [];
    const approved = teams.filter(t => t.status === "approved").length;
    const rejected = teams.filter(t => t.status === "rejected").length;
    const disqualified = teams.filter(t => t.status === "disqualified").length;

    const regs = regsRes.data || [];
    const pending = regs.filter(r => r.status === "pending").length;

    setCard(teamsCard, String(teams.length));
    setCard(playersCard, String((playersRes.data || []).length));
    setCard(pendingCard, String(pending));
    setCard(approvedCard, String(approved));
    setCard(rejectedCard, String(rejected));
    setCard(disqualifiedCard, String(disqualified));

    const totalSlots = tournament ? tournament.total_team_slots : 0;
    setCard(slotsCard, tournament ? String(Math.max(totalSlots - approved, 0)) : "—");

    const prize = prizeRes.data;
    setCard(prizeCard, prize ? `${prize.currency} ${Number(prize.total_pool).toLocaleString()}` : "Not set");

    setCard(statusCard, tournament ? tournament.status.toUpperCase() : "No active tournament");

    const regSettings = regSettingsRes.data;
    setCard(regStatusCard, regSettings ? regSettings.status.toUpperCase() : "Not configured");

    const nextMatch = (nextMatchRes.data || [])[0];
    setCard(nextMatchCard, nextMatch ? nextMatch.label : "None scheduled");

    setCard(liveCard, tournament && tournament.status === "live" ? "LIVE" : "Offline");

    // latest registrations
    const { data: latest } = await window.db
      .from("registrations")
      .select("registration_code, team_name, captain_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    const listEl = document.getElementById("latestRegs");
    if (!latest || latest.length === 0) {
      listEl.textContent = "No teams registered yet.";
      listEl.classList.remove("admin-loading");
    } else {
      listEl.classList.remove("admin-loading");
      listEl.innerHTML = `
        <table style="width:100%; border-collapse: collapse; font-size:13.5px;">
          <thead>
            <tr style="text-align:left; color:var(--text-3); font-family:var(--f-mono); font-size:11px; text-transform:uppercase;">
              <th style="padding:8px 6px;">Code</th>
              <th style="padding:8px 6px;">Team</th>
              <th style="padding:8px 6px;">Captain</th>
              <th style="padding:8px 6px;">Status</th>
              <th style="padding:8px 6px;">Submitted</th>
            </tr>
          </thead>
          <tbody>
            ${latest.map(r => `
              <tr style="border-top:1px solid var(--border);">
                <td style="padding:8px 6px; font-family:var(--f-mono);">${escapeHtml(r.registration_code)}</td>
                <td style="padding:8px 6px;">${escapeHtml(r.team_name)}</td>
                <td style="padding:8px 6px;">${escapeHtml(r.captain_name)}</td>
                <td style="padding:8px 6px; text-transform:capitalize;">${r.status}</td>
                <td style="padding:8px 6px; color:var(--text-3);">${new Date(r.created_at).toLocaleString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    console.error(err);
    cards.forEach(c => setCard(c, "Error"));
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[m]));
  }
})();
