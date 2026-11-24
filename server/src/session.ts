import session from "express-session";
import createMemoryStore from "memorystore";
import type { Config } from "./config.js";

/** What we keep server-side for a signed-in user. OAuth tokens never leave the server. */
export interface GoogleConnection {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  scope: string;
}

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export function hasCalendarAccess(connection: GoogleConnection | undefined): boolean {
  return Boolean(connection?.scope.split(" ").includes(CALENDAR_SCOPE));
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

declare module "express-session" {
  interface SessionData {
    /** Temporary values for the OAuth round trip (CSRF state and PKCE verifier). */
    oauth?: { state: string; codeVerifier: string; purpose: "signin" | "calendar" };
    user?: SessionUser;
    google?: GoogleConnection;
    /** True when the user is exploring with sample data instead of a real account. */
    demo?: boolean;
    /** Last AI result, reused while the calendar data hasn't changed (saves cost and time). */
    insightsCache?: { key: string; result: unknown };
    /** Timestamps of recent AI runs, for the per-session limit. */
    insightsHistory?: number[];
  }
}

const MemoryStore = createMemoryStore(session);

export function createSessionMiddleware(config: Config) {
  const isProd = config.NODE_ENV === "production";
  return session({
    name: "mysubs.sid",
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // In-memory store: fine for a single-instance demo. Swap for Redis or Postgres to scale out.
    store: new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 }),
    cookie: {
      httpOnly: true,
      sameSite: "lax", // lax lets the cookie survive the redirect back from Google
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}
