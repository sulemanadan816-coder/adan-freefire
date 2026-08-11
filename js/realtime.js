/* =========================================================================
   PUBLIC REALTIME UPDATES
   Subscribes to Supabase changes on the tables the public homepage shows
   (leaderboard, matches, room_details) and re-renders just those panels —
   via the narrow window.__liveRefresh hook exposed by js/app.js — instead
   of reloading the page. Requires js/app.js to have run init() first.
   ========================================================================= */
(function () {
  "use strict";
  if (!window.db) return; // supabase.js not loaded — no realtime without a client

  let timer = null;
  let subscribed = false;

  async function refresh() {
    if (!window.ACTIVE_TOURNAMENT_ID || !window.__liveRefresh) return;
    const tournamentId = window.ACTIVE_TOURNAMENT_ID;

    try {
      const [lbRes, matchesRes, roomRes] = await Promise.all([
        window.db.from("leaderboard").select("*, teams(team_name)")
          .eq("tournament_id", tournamentId).eq("is_published", true).order("rank", { ascending: true }),
        window.db.from("matches").select("*").eq("tournament_id", tournamentId).order("match_number", { ascending: true }),
        window.db.from("room_details").select("*").eq("tournament_id", tournamentId).eq("is_published", true)
          .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (!lbRes.error) {
        CONFIG.leaderboard.teams = (lbRes.data || []).map((row) => ({
          rank: row.rank || 0,
          team: (row.teams && row.teams.team_name) || "Unknown Team",
          matches: row.matches_played || 0,
          kills: row.kills || 0,
          placementPts: row.placement_points || 0,
          totalPts: row.total_points || 0,
        }));
        CONFIG.leaderboard.isDemo = false;
        window.__liveRefresh.leaderboard();
      }

      if (!matchesRes.error) {
        CONFIG.matches.list = (matchesRes.data || []).map((m) => ({
          id: m.id,
          label: m.label,
          map: m.map || "TBA",
          mode: m.mode || "Squad",
          time: m.scheduled_time
            ? new Date(m.scheduled_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) + " " + CONFIG.schedule.timezoneLabel
            : "TBA",
          status: ["live", "completed"].includes(m.status) ? m.status : "upcoming",
        }));
        CONFIG.matches.isDemo = false;
        window.__liveRefresh.matches();
      }

      if (roomRes.data) {
        CONFIG.room.released = true;
        CONFIG.room.matchNumber = roomRes.data.map ? `Match — ${roomRes.data.map}` : "Room Released";
        CONFIG.room.map = roomRes.data.map;
        CONFIG.room.roomId = roomRes.data.room_id;
        CONFIG.room.password = roomRes.data.room_password;
      } else {
        CONFIG.room.released = false;
      }
      window.__liveRefresh.room();
    } catch (err) {
      console.error("Realtime refresh failed", err);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 400); // debounce bursts of changes into one refresh
  }

  // Wait for js/app.js's init() to finish (it sets window.ACTIVE_TOURNAMENT_ID
  // and window.__liveRefresh) before subscribing, so the first change event
  // has something to call.
  function start() {
    if (subscribed || !window.ACTIVE_TOURNAMENT_ID) {
      if (!subscribed) setTimeout(start, 300);
      return;
    }
    subscribed = true;
    window.db
      .channel("public-tournament-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_details" }, schedule)
      .subscribe();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
