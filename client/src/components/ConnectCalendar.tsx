export function ConnectCalendar({ name }: { name: string }) {
  return (
    <section className="card">
      <h2>Hi {name.split(" ")[0]}, connect a service</h2>
      <div className="service">
        <div>
          <h3>Google Calendar</h3>
          <p className="muted">
            Read-only access to your events from the last four weeks. We use titles, times and attendee counts; we never
            read descriptions, locations or attendee emails, and we can't change your calendar.
          </p>
        </div>
        <a className="button primary" href="/auth/google/connect-calendar">
          Connect
        </a>
      </div>
      <p className="notice">
        This app isn't verified by Google yet, so Google shows a warning screen. To continue, choose <b>Advanced</b>, then{" "}
        <b>Go to vorgle.com (unsafe)</b>.
      </p>
    </section>
  );
}
