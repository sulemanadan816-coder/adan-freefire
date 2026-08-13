/* =========================================================================
   Pakistan Elite FREE FIRE TOURNAMENT — SITE CONFIGURATION
   -------------------------------------------------------------------------
   This is the ONLY file you should need to edit to update the website.
   Change values below, save, and re-upload — nothing else in the site
   needs to change.

   Anything marked DEMO or EDIT_ME is placeholder data. The site shows a
   "DEMO DATA" badge next to it automatically — replace the value and the
   badge disappears. Never remove a badge without replacing the data,
   or the site will show fake info as if it were real/live.
   ========================================================================= */

const CONFIG = {

  // ---------------------------------------------------------------------
  // ORGANIZER & TOURNAMENT IDENTITY
  // ---------------------------------------------------------------------
  organizer: {
    name: "Adan",
    verified: true,                 // shows a "Verified Organizer" badge
  },

  tournament: {
    name: "Pakistan Elite Free Fire Tournament",
    shortName: "PEFFT",
    game: "Free Fire",
    mode: "Squad (4 vs 4)",
    region: "Pakistan",
    // "upcoming" | "live" | "completed"
    status: "upcoming",
    isDemoStatus: true,             // DEMO: flip to false once status is real
  },

  // ---------------------------------------------------------------------
  // SCHEDULE — used by the countdown timer. Use ISO format with your
  // timezone offset. Pakistan Standard Time is +05:00.
  // ---------------------------------------------------------------------
  schedule: {
    startDateISO: "2026-08-09T20:00:00+05:00",   // DEMO — set real date/time
    timezoneLabel: "PKT",
    stages: [
      { id: "registration", label: "Registration",     detail: "Team & player registration is open. Submit your squad before the deadline." },
      { id: "checkin",      label: "Check-In",          detail: "Registered captains confirm attendance and player UIDs." },
      { id: "roomid",       label: "Room ID Release",   detail: "Room ID & password are shared privately with confirmed teams shortly before match time." },
      { id: "match1",       label: "Match 1",           detail: "Opening qualifier match. Bermuda map." },
      { id: "match2",       label: "Match 2",           detail: "Second match — points carry over from Match 1." },
      { id: "match3",       label: "Match 3 (Final)",   detail: "Final match. Total points across all matches decide the champion." },
      { id: "results",      label: "Final Results",     detail: "Leaderboard is locked and verified by the admin team." },
      { id: "prizes",       label: "Prize Distribution", detail: "Winners are announced live and prize payout begins." },
    ],
    currentStageId: "registration",  // used to highlight the active stage
  },

  // ---------------------------------------------------------------------
  // YOUTUBE LIVE
  // ---------------------------------------------------------------------
  youtube: {
    // Put ONLY the 11-character video ID (from youtube.com/watch?v=THIS_PART)
    // Leave as EDIT_ME until match day — "Watch Live" will link to the
    // channel instead until a real video ID is set here.
    videoId: "EDIT_ME_YOUTUBE_VIDEO_ID",
    channelUrl: "https://youtube.com/@tojiff-e",
    channelHandle: "@tojiff-e",
  },

  // ---------------------------------------------------------------------
  // PRIZE POOL & ENTRY
  // ---------------------------------------------------------------------
  prize: {
    currency: "PKR",
    totalPool: 10000,               // DEMO
    entryFee: 200,
    isFreeEntry: false,
    breakdown: [
      { place: "1st Place", amount: 5000, icon: "gold" },
      { place: "2nd Place", amount: 3000, icon: "silver" },
      { place: "3rd Place", amount: 2000, icon: "bronze" },
    ],
    bonusAwards: [
      { title: "Top Fragger", detail: "Most eliminations across all matches" },
      { title: "MVP",         detail: "Highest combined placement + kill points" },
      { title: "Best Squad",  detail: "Most consistent performance across matches" },
    ],
    isDemo: true,
  },

  // ---------------------------------------------------------------------
  // PAYMENT — Easypaisa. Shown on the registration section whenever
  // prize.isFreeEntry is false. The account name is just a display label,
  // not verified by the site — the admin verifies each transaction ID
  // manually (or with AI assistance) in the Admin Dashboard.
  // ---------------------------------------------------------------------
  payment: {
    method: "Easypaisa",
    accountNumber: "0327-5067389",
    accountName: "Adan",
    instructions: "Send the exact entry fee to the Easypaisa number below, then enter your Transaction ID and the sender's number in the form. Your registration stays Pending until an admin verifies the payment.",
  },

  // ---------------------------------------------------------------------
  // SLOTS / CAPACITY
  // ---------------------------------------------------------------------
  slots: {
    totalTeams: 50,
    registeredTeams: 21,            // DEMO — wire to real backend later
    playersPerTeam: 4,
    registrationOpen: true,
    isDemo: true,
  },

  // ---------------------------------------------------------------------
  // ROOM DETAILS — left empty until you release them. Do not fill in
  // real room ID/password until match day, or players will see it early.
  // ---------------------------------------------------------------------
  room: {
    released: false,
    matchNumber: null,
    map: null,
    roomId: null,
    password: null,
    startTime: null,
  },

  // ---------------------------------------------------------------------
  // MATCH CENTER — DEMO fixtures, replace with real fixtures/results
  // ---------------------------------------------------------------------
  matches: {
    isDemo: true,
    list: [
      { id: 1, label: "Match 01", map: "Bermuda",  mode: "Squad", time: "8:00 PM PKT", status: "upcoming" },
      { id: 2, label: "Match 02", map: "Purgatory", mode: "Squad", time: "8:40 PM PKT", status: "upcoming" },
      { id: 3, label: "Match 03", map: "Kalahari",  mode: "Squad", time: "9:20 PM PKT", status: "upcoming" },
    ],
  },

  // ---------------------------------------------------------------------
  // LEADERBOARD — DEMO data, structured so it can be swapped for a real
  // feed (Firebase / Supabase / Google Sheets / custom API) later.
  // ---------------------------------------------------------------------
  leaderboard: {
    isDemo: true,
    lastUpdatedSecondsAgo: 42,
    teams: [
      { rank: 1,  team: "Shadow Reapers",   matches: 3, kills: 34, placementPts: 30, totalPts: 64 },
      { rank: 2,  team: "Ember Squad",      matches: 3, kills: 29, placementPts: 28, totalPts: 57 },
      { rank: 3,  team: "Null Protocol",    matches: 3, kills: 27, placementPts: 26, totalPts: 53 },
      { rank: 4,  team: "Crimson Wolves",   matches: 3, kills: 24, placementPts: 22, totalPts: 46 },
      { rank: 5,  team: "Ghost Division",   matches: 3, kills: 21, placementPts: 21, totalPts: 42 },
      { rank: 6,  team: "Iron Vultures",    matches: 3, kills: 19, placementPts: 19, totalPts: 38 },
      { rank: 7,  team: "Toxic Habibis",    matches: 3, kills: 18, placementPts: 17, totalPts: 35 },
      { rank: 8,  team: "Rogue Falcons",    matches: 3, kills: 16, placementPts: 16, totalPts: 32 },
      { rank: 9,  team: "Alpha Predators",  matches: 3, kills: 14, placementPts: 14, totalPts: 28 },
      { rank: 10, team: "Silent Snipers",   matches: 3, kills: 12, placementPts: 12, totalPts: 24 },
    ],
  },

  // ---------------------------------------------------------------------
  // STAT COUNTERS (hero / overview strip)
  // ---------------------------------------------------------------------
  stats: {
    isDemo: true,
    players: 84,
    teams: 21,
    prizePool: 10000,
    competitiveRating: 100,
  },

  // ---------------------------------------------------------------------
  // SOCIAL / COMMUNITY LINKS — leave blank ("") to hide a button
  // ---------------------------------------------------------------------
  social: {
    youtube:   "https://youtube.com/@tojiff-e",
    whatsapp:  "https://chat.whatsapp.com/IHkUi0dtKBI5iIuMTS20QH?s=cl&p=i&mlu=4",
    discord:   "",   // e.g. "https://discord.gg/EDIT_ME"
    instagram: "https://www.instagram.com/meh4r_adan",
    tiktok:    "https://www.tiktok.com/@mr_adan_gujjar",
    facebook:  "",
  },

  // ---------------------------------------------------------------------
  // SHARE
  // ---------------------------------------------------------------------
  share: {
    url: "https://EDIT_ME_YOUR_DOMAIN.com",
    title: "Adan Free Fire Tournament — Live on YouTube",
  },
};
