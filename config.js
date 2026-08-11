const CONFIG = {
  organizer: {
    name: "Adan",
    verified: true,
  },

  tournament: {
    name: "Pakistan Elite Free Fire Tournament",
    shortName: "PEFFT",
    game: "Free Fire",
    mode: "Squad (4 vs 4)",
    region: "Pakistan",

    // Change to "live" or "completed" when appropriate.
    status: "upcoming",

    // Keep true until you have confirmed the tournament status/date.
    isDemoStatus: true,
  },

  schedule: {
    // IMPORTANT:
    // Replace this with your REAL upcoming tournament date/time.
    // Format: YYYY-MM-DDTHH:MM:SS+05:00
    startDateISO: "2026-08-30T20:00:00+05:00",

    timezoneLabel: "PKT",

    stages: [
      {
        id: "registration",
        label: "Registration",
        detail:
          "Team & player registration is open. Submit your squad before the deadline.",
      },
      {
        id: "checkin",
        label: "Check-In",
        detail:
          "Registered captains confirm attendance and player UIDs.",
      },
      {
        id: "roomid",
        label: "Room ID Release",
        detail:
          "Room ID & password are shared privately with confirmed teams shortly before match time.",
      },
      {
        id: "match1",
        label: "Match 1",
        detail:
          "Opening qualifier match. Bermuda map.",
      },
      {
        id: "match2",
        label: "Match 2",
        detail:
          "Second match — points carry over from Match 1.",
      },
      {
        id: "match3",
        label: "Match 3 (Final)",
        detail:
          "Final match. Total points across all matches decide the champion.",
      },
      {
        id: "results",
        label: "Final Results",
        detail:
          "Leaderboard is locked and verified by the admin team.",
      },
      {
        id: "prizes",
        label: "Prize Distribution",
        detail:
          "Winners are announced live and prize payout begins.",
      },
    ],

    // Change this as the tournament progresses.
    currentStageId: "registration",
  },

  youtube: {
    // Leave empty until you have the REAL YouTube live video ID.
    videoId: "",

    channelUrl: "https://youtube.com/@tojiff-e",
    channelHandle: "@tojiff-e",
  },

  prize: {
    currency: "PKR",

    // REAL prize pool only if this is actually confirmed.
    totalPool: 10000,

    entryFee: 200,
    isFreeEntry: false,

    breakdown: [
      {
        place: "1st Place",
        amount: 5000,
        icon: "gold",
      },
      {
        place: "2nd Place",
        amount: 3000,
        icon: "silver",
      },
      {
        place: "3rd Place",
        amount: 2000,
        icon: "bronze",
      },
    ],

    bonusAwards: [
      {
        title: "Top Fragger",
        detail: "Most eliminations across all matches",
      },
      {
        title: "MVP",
        detail: "Highest combined placement + kill points",
      },
      {
        title: "Best Squad",
        detail: "Most consistent performance across matches",
      },
    ],

    // Keep true until the prize information is confirmed.
    isDemo: true,
  },

  payment: {
    method: "Easypaisa",

    accountNumber: "0327-5067389",

    accountName: "Adan",

    instructions:
      "Send the exact entry fee to the Easypaisa number below, then enter your Transaction ID and the sender's number in the form. Your registration stays Pending until an admin verifies the payment.",
  },

  slots: {
    totalTeams: 50,

    // IMPORTANT:
    // Do NOT use 21 unless 21 is actually registered in your database.
    // Your real Supabase data should eventually control this number.
    registeredTeams: 0,

    playersPerTeam: 4,

    registrationOpen: true,

    // Keep true because registeredTeams above is not a live database count.
    isDemo: true,
  },

  room: {
    // Keep false until the real room information is ready.
    released: false,

    matchNumber: null,
    map: null,
    roomId: null,
    password: null,
    startTime: null,
  },

  matches: {
    // Keep true until these fixtures are confirmed.
    isDemo: true,

    list: [
      {
        id: 1,
        label: "Match 01",
        map: "Bermuda",
        mode: "Squad",
        time: "8:00 PM PKT",
        status: "upcoming",
      },
      {
        id: 2,
        label: "Match 02",
        map: "Purgatory",
        mode: "Squad",
        time: "8:40 PM PKT",
        status: "upcoming",
      },
      {
        id: 3,
        label: "Match 03",
        map: "Kalahari",
        mode: "Squad",
        time: "9:20 PM PKT",
        status: "upcoming",
      },
    ],
  },

  leaderboard: {
    // IMPORTANT:
    // These are NOT real results.
    // Keep demo mode ON until your Supabase leaderboard is supplying
    // the actual tournament results.
    isDemo: true,

    lastUpdatedSecondsAgo: null,

    teams: [],
  },

  stats: {
    // These should eventually come from Supabase.
    isDemo: true,

    players: 0,
    teams: 0,
    prizePool: 10000,
    competitiveRating: 100,
  },

  social: {
    youtube: "https://youtube.com/@tojiff-e",

    whatsapp:
      "https://chat.whatsapp.com/IHkUi0dtKBI5iIuMTS20QH?s=cl&p=i&mlu=4",

    discord: "",

    instagram: "https://www.instagram.com/meh4r_adan",

    tiktok: "https://www.tiktok.com/@mr_adan_gujjar",

    facebook: "https://www.facebook.com/share/1EW4TSf5HR/?mibextid=wwXIfr",
  },

  share: {
    // IMPORTANT:
    // Replace this with your Vercel URL after deployment.
    // Example:
    // https://adan-freefire.vercel.app
    url: "https://YOUR-VERCEL-URL.vercel.app",

    title: "Adan Free Fire Tournament — Live on YouTube",
  },
};