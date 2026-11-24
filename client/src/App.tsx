import { useEffect, useState } from "react";
import { api } from "./api";
import { ConnectCalendar } from "./components/ConnectCalendar";
import { Dashboard } from "./components/Dashboard";
import { Demo } from "./components/Demo";
import { Privacy } from "./components/Privacy";
import { SignIn } from "./components/SignIn";
import type { Me } from "./types";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the Google sign-in.",
  calendar_permission_not_granted: "Calendar access is needed to show your data. Please tick the calendar permission.",
  account_mismatch: "Please connect the calendar of the Google account you signed in with.",
  sign_in_first: "Please sign in first.",
  invalid_state: "The sign-in link expired. Please try again.",
};

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState(false);
  const authError = new URLSearchParams(window.location.search).get("error");

  const refresh = () =>
    api
      .me()
      .then(setMe)
      .catch(() => setLoadError(true));

  useEffect(() => {
    void refresh();
    if (authError) window.history.replaceState(null, "", "/");
  }, []);

  const staticPage = { "/privacy": <Privacy />, "/demo": <Demo /> }[window.location.pathname];
  if (staticPage) {
    return (
      <main className="page">
        <header className="header">
          <h1>MySubscriptions</h1>
        </header>
        {staticPage}
      </main>
    );
  }

  if (loadError) return <p className="page">Could not reach the server. Please refresh the page.</p>;
  if (!me) return <p className="page muted">Loading…</p>;

  return (
    <main className="page">
      <header className="header">
        <h1>MySubscriptions</h1>
        {me.user && (
          <div className="header-user">
            <span>{me.demo ? "Demo mode" : me.user.email}</span>
            <button onClick={() => api.logout().then(refresh)}>Sign out</button>
          </div>
        )}
      </header>
      {authError && <p className="error">{ERROR_MESSAGES[authError] ?? "Sign-in failed. Please try again."}</p>}
      {!me.user ? (
        <SignIn onDemo={() => api.startDemo().then(refresh)} />
      ) : me.connections?.googleCalendar ? (
        <Dashboard demo={Boolean(me.demo)} aiEnabled={Boolean(me.aiEnabled)} onDemo={() => api.startDemo().then(refresh)} />
      ) : (
        <ConnectCalendar name={me.user.name} />
      )}
      <footer className="footer">
        <a href="/privacy">Privacy</a> · <a href="/demo">Demo video</a>
      </footer>
    </main>
  );
}
