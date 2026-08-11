/* Admin Supabase client — same anon key as the public site (safe to expose;
   see supabase.js for why). Every admin capability is gated by RLS policies
   that check profiles.role via is_admin(), never by this file. */

const SUPABASE_URL = "https://imkozuxqsecclhqfqanf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlta296dXhxc2VjY2xocWZxYW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTc4MzEsImV4cCI6MjEwMTA3MzgzMX0.5615nKFv3euYNDfjBXqgcx7evf6HXUSPCVMcIOCMU0Y";

if (typeof window.supabase === "undefined") {
  console.error("Supabase library failed to load — the admin dashboard cannot function without it.");
} else {
  window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
