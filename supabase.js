/* =========================================================================
   SUPABASE CLIENT — public, anonymous connection.
   The anon key below is safe to expose client-side: it can only do what
   the database's Row Level Security policies (see schema.sql) allow an
   unauthenticated user to do. It is NOT the service_role key and must
   never be replaced with one.
   ========================================================================= */

const SUPABASE_URL = "https://imkozuxqsecclhqfqanf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlta296dXhxc2VjY2xocWZxYW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTc4MzEsImV4cCI6MjEwMTA3MzgzMX0.5615nKFv3euYNDfjBXqgcx7evf6HXUSPCVMcIOCMU0Y";

if (typeof window.supabase === "undefined") {
  // The supabase-js CDN script failed to load (offline, blocked, etc).
  // Leave window.db unset — every caller already checks `if (!window.db)`
  // and falls back to config.js demo values instead of throwing.
  console.error("Supabase library failed to load — the site will run in offline/demo mode.");
} else {
  window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
