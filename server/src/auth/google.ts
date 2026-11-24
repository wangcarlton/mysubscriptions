import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import type { Config } from "../config.js";
import { CALENDAR_SCOPE, hasCalendarAccess, type GoogleConnection } from "../session.js";

/**
 * Two steps, asked for only when needed (Google's "incremental authorisation"):
 * 1. Sign in: basic profile only. Non-sensitive scopes, so it works for anyone.
 * 2. Connect Google Calendar: adds read-only calendar access. Read-only, because we
 *    never need to change the user's calendar.
 */
export const SIGN_IN_SCOPES = ["openid", "email", "profile"];
export const CALENDAR_SCOPES = [...SIGN_IN_SCOPES, CALENDAR_SCOPE];

export function createOAuthClient(config: Config): OAuth2Client {
  return new OAuth2Client({
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: config.GOOGLE_REDIRECT_URI,
  });
}

/**
 * Returns an OAuth client loaded with the user's tokens. When the access token
 * has expired, the library refreshes it and `onRefresh` lets us store the new one.
 */
export function clientForConnection(
  config: Config,
  connection: GoogleConnection,
  onRefresh: (updated: GoogleConnection) => void,
): OAuth2Client {
  const client = createOAuthClient(config);
  client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.expiryDate,
  });
  client.on("tokens", (tokens) => {
    onRefresh({
      ...connection,
      accessToken: tokens.access_token ?? connection.accessToken,
      refreshToken: tokens.refresh_token ?? connection.refreshToken,
      expiryDate: tokens.expiry_date ?? connection.expiryDate,
    });
  });
  return client;
}

export function googleAuthRouter(config: Config): Router {
  const router = Router();
  const fail = (res: Response, code: string) => res.redirect(`${config.APP_URL}/?error=${encodeURIComponent(code)}`);

  /** Sends the user to Google with a CSRF state and a PKCE challenge. */
  async function startOAuth(req: Request, res: Response, purpose: "signin" | "calendar") {
    const client = createOAuthClient(config);
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomBytes(16).toString("hex");
    req.session.oauth = { state, codeVerifier, purpose };

    const url = client.generateAuthUrl({
      scope: purpose === "signin" ? SIGN_IN_SCOPES : CALENDAR_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      include_granted_scopes: true, // keep calendar access if it was granted before
      ...(purpose === "calendar"
        ? { access_type: "offline", prompt: "consent", login_hint: req.session.user?.email } // refresh token
        : { prompt: "select_account" }),
    });
    req.session.save(() => res.redirect(url));
  }

  router.get("/google/login", (req, res, next) => startOAuth(req, res, "signin").catch(next));

  router.get("/google/connect-calendar", (req, res, next) => {
    if (!req.session.user || req.session.demo) return fail(res, "sign_in_first");
    startOAuth(req, res, "calendar").catch(next);
  });

  // Google redirects back here with a code for either step; we exchange it on the server.
  router.get("/google/callback", async (req, res, next) => {
    try {
      const { code, state, error } = req.query;
      const pending = req.session.oauth;
      delete req.session.oauth;

      if (error) return fail(res, String(error));
      if (!pending || typeof state !== "string" || state !== pending.state || typeof code !== "string") {
        return fail(res, "invalid_state");
      }

      const client = createOAuthClient(config);
      const { tokens } = await client.getToken({ code, codeVerifier: pending.codeVerifier });
      if (!tokens.access_token || !tokens.id_token) return fail(res, "missing_tokens");

      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.GOOGLE_CLIENT_ID });
      const profile = ticket.getPayload();
      if (!profile?.sub || !profile.email) return fail(res, "invalid_profile");

      const connection: GoogleConnection = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? req.session.google?.refreshToken,
        expiryDate: tokens.expiry_date ?? undefined,
        scope: tokens.scope ?? "",
      };

      if (pending.purpose === "calendar") {
        // Connecting must happen in the same Google account the user signed in with.
        if (!req.session.user || req.session.user.id !== profile.sub) return fail(res, "account_mismatch");
        if (!hasCalendarAccess(connection)) return fail(res, "calendar_permission_not_granted");
        req.session.google = connection;
        delete req.session.insightsCache;
        return req.session.save(() => res.redirect(config.APP_URL));
      }

      // Sign-in: rotate the session ID to prevent session fixation.
      req.session.regenerate((regenErr) => {
        if (regenErr) return next(regenErr);
        req.session.user = {
          id: profile.sub,
          email: profile.email!,
          name: profile.name ?? profile.email!,
          picture: profile.picture,
        };
        req.session.google = connection; // includes calendar access if granted on an earlier visit
        req.session.save(() => res.redirect(config.APP_URL));
      });
    } catch (err) {
      next(err);
    }
  });

  // Sign out: revoke Google's grant (best effort) and destroy the session.
  router.post("/logout", async (req, res) => {
    const token = req.session.google?.refreshToken ?? req.session.google?.accessToken;
    if (token) {
      await createOAuthClient(config).revokeToken(token).catch(() => undefined);
    }
    req.session.destroy(() => {
      res.clearCookie("mysubs.sid");
      res.status(204).end();
    });
  });

  // Explore the app with sample data, without a Google account.
  router.post("/demo", (req, res) => {
    req.session.regenerate(() => {
      req.session.demo = true;
      req.session.user = { id: "demo", email: "demo@example.com", name: "Demo user" };
      req.session.save(() => res.status(204).end());
    });
  });

  return router;
}
