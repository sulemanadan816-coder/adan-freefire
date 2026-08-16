/* =========================================================================
   FREE FIRE SENSITIVITY FINDER — DEVICE DATABASE
   -------------------------------------------------------------------------
   Plain, expandable data file — no build step, no database round-trip.
   These are NOT admin-editable (only "Sensitivity Finder: ON/OFF" is, from
   the admin panel) — that's why this lives here instead of in Supabase.

   HOW TO ADD MORE DEVICES:
   Add an entry to DEVICE_DB[brand], following the existing shape:
     { model: "Display Name", refreshHz: 90, tier: "high" }
   tier is one of "entry" | "mid" | "high" | "flagship" — it's what the
   preset formula in sensitivity-finder.js actually keys off of, so a new
   phone doesn't need its own bespoke numbers, just a reasonable tier +
   refresh rate guess.

   HOW THE NUMBERS ARE PRODUCED:
   Base values per tier, then adjusted by refresh rate and play style — see
   computeSensitivity() in sensitivity-finder.js. This is a deterministic
   formula, explained inline there, not a guarantee or an AI prediction.
   ========================================================================= */
window.DEVICE_DB = {
  "Apple": [
    { model: "iPhone 11", refreshHz: 60, tier: "mid" },
    { model: "iPhone 12 / 12 Pro", refreshHz: 60, tier: "high" },
    { model: "iPhone 13 / 13 Pro", refreshHz: 60, tier: "high" },
    { model: "iPhone 13 Pro Max", refreshHz: 120, tier: "flagship" },
    { model: "iPhone 14 / 14 Plus", refreshHz: 60, tier: "high" },
    { model: "iPhone 14 Pro / Pro Max", refreshHz: 120, tier: "flagship" },
    { model: "iPhone 15 / 15 Plus", refreshHz: 60, tier: "high" },
    { model: "iPhone 15 Pro / Pro Max", refreshHz: 120, tier: "flagship" },
    { model: "iPhone SE (2022)", refreshHz: 60, tier: "mid" },
  ],
  "Samsung Galaxy": [
    { model: "Galaxy A14 / A15", refreshHz: 90, tier: "entry" },
    { model: "Galaxy A54", refreshHz: 120, tier: "mid" },
    { model: "Galaxy M14 / M34", refreshHz: 90, tier: "entry" },
    { model: "Galaxy S21", refreshHz: 120, tier: "high" },
    { model: "Galaxy S22 / S22+", refreshHz: 120, tier: "flagship" },
    { model: "Galaxy S23 / S23 Ultra", refreshHz: 120, tier: "flagship" },
    { model: "Galaxy S24 / S24 Ultra", refreshHz: 120, tier: "flagship" },
    { model: "Galaxy Z Flip5", refreshHz: 120, tier: "flagship" },
  ],
  "Xiaomi": [
    { model: "Redmi Note 11", refreshHz: 90, tier: "mid" },
    { model: "Redmi Note 12", refreshHz: 120, tier: "mid" },
    { model: "Redmi Note 13 Pro", refreshHz: 120, tier: "high" },
    { model: "Xiaomi 12", refreshHz: 120, tier: "flagship" },
    { model: "Xiaomi 13", refreshHz: 120, tier: "flagship" },
    { model: "POCO X5 Pro", refreshHz: 120, tier: "high" },
    { model: "POCO F5", refreshHz: 120, tier: "flagship" },
    { model: "POCO M6 Pro", refreshHz: 120, tier: "mid" },
  ],
  "OnePlus": [
    { model: "OnePlus Nord CE 3", refreshHz: 120, tier: "mid" },
    { model: "OnePlus Nord 3", refreshHz: 120, tier: "high" },
    { model: "OnePlus 10R", refreshHz: 120, tier: "flagship" },
    { model: "OnePlus 11", refreshHz: 120, tier: "flagship" },
    { model: "OnePlus 12", refreshHz: 120, tier: "flagship" },
  ],
  "OPPO": [
    { model: "OPPO A78", refreshHz: 90, tier: "entry" },
    { model: "OPPO Reno 8", refreshHz: 90, tier: "high" },
    { model: "OPPO Reno 10", refreshHz: 120, tier: "high" },
    { model: "OPPO Find X6", refreshHz: 120, tier: "flagship" },
  ],
  "Vivo": [
    { model: "Vivo Y17s", refreshHz: 90, tier: "entry" },
    { model: "Vivo V27", refreshHz: 120, tier: "high" },
    { model: "Vivo V29", refreshHz: 120, tier: "high" },
    { model: "Vivo X90", refreshHz: 120, tier: "flagship" },
  ],
  "Realme": [
    { model: "Realme C55", refreshHz: 90, tier: "entry" },
    { model: "Realme 11 Pro", refreshHz: 120, tier: "high" },
    { model: "Realme GT Neo 5", refreshHz: 144, tier: "flagship" },
  ],
  "Infinix": [
    { model: "Infinix Hot 30", refreshHz: 90, tier: "entry" },
    { model: "Infinix Note 30", refreshHz: 120, tier: "mid" },
    { model: "Infinix Zero 30", refreshHz: 120, tier: "high" },
  ],
  "Tecno": [
    { model: "Tecno Spark 10", refreshHz: 90, tier: "entry" },
    { model: "Tecno Camon 20", refreshHz: 120, tier: "mid" },
    { model: "Tecno Phantom V Flip", refreshHz: 120, tier: "flagship" },
  ],
  "Google Pixel": [
    { model: "Pixel 6a", refreshHz: 60, tier: "high" },
    { model: "Pixel 7 / 7 Pro", refreshHz: 90, tier: "flagship" },
    { model: "Pixel 8 / 8 Pro", refreshHz: 120, tier: "flagship" },
  ],
  "Motorola": [
    { model: "Moto G54", refreshHz: 120, tier: "mid" },
    { model: "Moto Edge 40", refreshHz: 144, tier: "flagship" },
  ],
  "Huawei": [
    { model: "Huawei Nova 11", refreshHz: 120, tier: "high" },
    { model: "Huawei P60", refreshHz: 120, tier: "flagship" },
  ],
};
