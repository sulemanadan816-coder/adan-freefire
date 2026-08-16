// =============================================================================
// YOUTUBE SUBSCRIPTION VERIFICATION (Supabase Edge Function)
// -----------------------------------------------------------------------------
// This is the ONLY place in the whole project that ever sees the Google OAuth
// client secret or writes a `verified = true` row to youtube_verifications.
// The frontend (js/gaming-zone.js) never sets that flag itself — it can only
// ASK this function to check, and ASK the database (via the public
// check_youtube_verification() function) what the current real answer is.
//
// FLOW
// 1. Visitor clicks "Check Subscription" on the site. The frontend redirects
//    the whole page (not a popup) to Google's OAuth consent screen, using a
//    PUBLIC client_id — no secret needed for that step.
// 2. Google redirects back here, to this function's URL, with a one-time
//    `code`.
// 3. This function exchanges that code for an access token — this step
//    requires the CLIENT SECRET, which is why it can only happen here, never
//    in the browser.
// 4. With that token, it calls the real YouTube Data API v3 to check whether
//    this Google account is subscribed to the tournament's channel.
// 5. It writes the real result to youtube_verifications using the
//    service-role key (also never exposed to the browser), then redirects
//    the visitor's browser back to the site.
// 6. The site then asks the database directly (anon key, read-only,
//    check_youtube_verification()) what the truth is — it never trusts
//    anything in the redirect URL as proof by itself.
//
// -----------------------------------------------------------------------------
// REQUIRED SETUP (see the final chat message for the full walkthrough):
//
// 1. Google Cloud Console (console.cloud.google.com):
//    - Create/select a project → enable "YouTube Data API v3".
//    - OAuth consent screen: External, add your channel's Google account as
//      a test user while in "Testing" mode (or publish it).
//    - Credentials → Create OAuth client ID → type "Web application".
//    - Authorized redirect URI: the deployed URL of THIS function, e.g.
//        https://<your-project-ref>.supabase.co/functions/v1/youtube-verify
//    - Copy the Client ID and Client Secret.
//
// 2. Supabase → Project Settings → Edge Functions → youtube-verify → Secrets
//    (or `supabase secrets set` via CLI), set:
//      GOOGLE_OAUTH_CLIENT_ID       (public, but still set as a secret here
//                                    for convenience — it is also needed
//                                    by the frontend; see js/gaming-zone.js)
//      GOOGLE_OAUTH_CLIENT_SECRET   (never expose this anywhere else)
//      SITE_URL                     e.g. https://your-site.vercel.app
//      SUPABASE_URL                 (usually already set by Supabase)
//      SUPABASE_SERVICE_ROLE_KEY    (usually already set by Supabase)
//
// 3. Deploy: `supabase functions deploy youtube-verify`
//
// 4. Put the same GOOGLE_OAUTH_CLIENT_ID (public value, not the secret) into
//    js/gaming-zone.js's CONFIG at the top of that file, and put this
//    function's deployed URL there too.
//
// UNCONFIGURED BEHAVIOR: if the required secrets aren't set yet, this
// function returns a clear error page instead of pretending to work — see
// requireEnv() below. The frontend keeps the Gaming Zone in its locked state
// whenever verification can't genuinely happen; it never fakes success.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function html(body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>YouTube Verification</title>
      <style>body{font-family:system-ui,sans-serif;background:#08090b;color:#f5f3ef;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;}
      .box{max-width:440px;} h1{font-size:20px;} p{color:#a8a6a2;font-size:14px;line-height:1.6;} code{background:#1a1c20;padding:2px 6px;border-radius:4px;}</style>
      </head><body><div class="box">${body}</div></body></html>`,
    { status, headers: { ...CORS_HEADERS, "Content-Type": "text/html" } },
  );
}

function missingConfigResponse(missing: string[]) {
  return html(
    `<h1>⚠️ YouTube verification isn't configured yet</h1>
     <p>This Edge Function is missing: ${missing.map((m) => `<code>${m}</code>`).join(", ")}.</p>
     <p>The Gaming Zone stays locked until these are set — see the setup
     comment at the top of this function's source for exact steps.</p>`,
    503,
  );
}

function redirectToSite(params: Record<string, string>) {
  if (!SITE_URL) {
    return html(`<h1>Verification finished</h1><p>SITE_URL isn't configured, so this
      page can't redirect you back automatically. You can close this tab and
      return to the site manually.</p>`);
  }
  const url = new URL(SITE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { ...CORS_HEADERS, Location: url.toString() } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!GOOGLE_CLIENT_ID) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (missing.length) return missingConfigResponse(missing);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error");

  // The visitor declined consent, or Google returned some other error —
  // bounce back to the site with a plain "not verified" hint, no fake success.
  if (oauthError) {
    return redirectToSite({ yt_check: "1", yt_status: "declined" });
  }

  if (!code) {
    return html(
      `<h1>Nothing to do here directly</h1>
       <p>This URL only does something useful as the OAuth redirect target
       Google sends visitors back to. Use the "Check Subscription" button on
       the site instead of opening this link directly.</p>`,
      400,
    );
  }

  // state = "<visitorId>.<organizationId>.<channelId>" — url-encoded, set by
  // the frontend right before it sent the visitor to Google. Everything the
  // callback needs travels in `state`; nothing is trusted from cookies or
  // client storage, since this request can legitimately arrive from a fresh
  // browser context after the Google redirect.
  const stateParts = state.split(".");
  const visitorId = decodeURIComponent(stateParts[0] || "");
  const organizationId = decodeURIComponent(stateParts[1] || "");
  const channelId = decodeURIComponent(stateParts[2] || "");

  if (!visitorId || !organizationId || !channelId) {
    return html(
      `<h1>⚠️ Malformed request</h1>
       <p>Missing visitor/organization/channel information. Please go back
       to the site and click "Check Subscription" again.</p>`,
      400,
    );
  }

  const redirectUri = `${url.origin}${url.pathname}`;

  try {
    // ---- Step 1: exchange the one-time code for an access token ----
    // This is the step that genuinely requires the client secret, and is
    // exactly why it can only happen in this server-side function.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return redirectToSite({ yt_check: "1", yt_status: "error" });
    }
    const accessToken = tokenData.access_token as string;

    // ---- Step 2: who is this? (for the record — not the proof itself) ----
    let googleUserId: string | null = null;
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        googleUserId = userData.sub || null;
      }
    } catch (e) {
      console.error("userinfo lookup failed (non-fatal):", e);
    }

    // ---- Step 3: the actual check — is this account subscribed to the
    // tournament's channel? forChannelId scopes `mine=true` subscriptions
    // down to just this one channel instead of paginating everything. ----
    const subRes = await fetch(
      `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&forChannelId=${encodeURIComponent(channelId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const subData = await subRes.json();

    if (!subRes.ok) {
      // Most common real-world cause: YouTube Data API not enabled on the
      // Google Cloud project, or a quota issue. Never treat this as success.
      console.error("Subscriptions check failed:", subData);
      return redirectToSite({ yt_check: "1", yt_status: "error" });
    }

    const isSubscribed = Array.isArray(subData.items) && subData.items.length > 0;

    // ---- Step 4: record the real result, service-role only ----
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error: upsertError } = await db.from("youtube_verifications").upsert(
      {
        organization_id: organizationId,
        visitor_id: visitorId,
        google_user_id: googleUserId,
        google_channel_id: channelId,
        verified: isSubscribed,
        verified_at: isSubscribed ? new Date().toISOString() : null,
      },
      { onConflict: "organization_id,visitor_id" },
    );
    if (upsertError) {
      console.error("Failed to save verification result:", upsertError);
      return redirectToSite({ yt_check: "1", yt_status: "error" });
    }

    return redirectToSite({ yt_check: "1", yt_status: isSubscribed ? "verified" : "not_subscribed" });
  } catch (err) {
    console.error("Unexpected error in youtube-verify:", err);
    return redirectToSite({ yt_check: "1", yt_status: "error" });
  }
});
