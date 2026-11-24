export function SignIn({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="card">
      <h2>See where your time really goes</h2>
      <p>
        Sign in with Google, connect your calendar, and AI sorts the last four weeks of events into what the time was
        actually spent on, then points out patterns worth changing.
      </p>
      <div className="actions">
        <a className="button primary" href="/auth/google/login">
          Sign in with Google
        </a>
        <button onClick={onDemo}>Try with sample data</button>
      </div>
      <p className="notice">Sign-in only shares your name and email. Calendar access is a separate, read-only step.</p>
    </section>
  );
}
