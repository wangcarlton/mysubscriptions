export function Privacy() {
  return (
    <article className="card prose">
      <h2>Privacy</h2>
      <p>
        MySubscriptions is a demonstration app. It shows where your calendar time goes, using AI. This page explains what
        it does with your data.
      </p>
      <h3>What we access</h3>
      <ul>
        <li>
          <b>Sign in with Google:</b> your name, email address and profile picture, to show who is signed in.
        </li>
        <li>
          <b>Google Calendar (read-only, only if you connect it):</b> events from your primary calendar for the period
          shown (four weeks by default). We use each event's title, start and end time, number of attendees, and whether
          it repeats. We do not read descriptions, locations or attendee email addresses, and we cannot change your
          calendar.
        </li>
      </ul>
      <h3>What is sent to the AI provider</h3>
      <p>
        To produce insights, event titles (shortened to 80 characters), durations, attendee counts, time of day and
        totals are sent to OpenAI's API. Titles can contain names. No email addresses, descriptions, locations or Google
        identifiers are sent. OpenAI states that data sent through its API is not used to train its models.
      </p>
      <h3>What we store</h3>
      <p>
        Nothing is saved to a database. Your Google access tokens and the latest AI result are held in the server's
        memory for your session (up to seven days) and are lost when the server restarts. Your browser holds only a
        session cookie, which is needed to keep you signed in; there are no tracking or advertising cookies. Server
        logs record AI usage (tokens, time, cost) but no calendar content.
      </p>
      <h3>Removing access</h3>
      <p>
        <b>Sign out</b> revokes the app's Google access and deletes your session. You can also remove the app at any
        time from your Google Account under Security, "Your connections to third-party apps and services".
      </p>
      <h3>Google API Services</h3>
      <p>
        The app's use of information received from Google APIs adheres to the Google API Services User Data Policy,
        including the Limited Use requirements.
      </p>
      <h3>Contact</h3>
      <p>
        Questions: <a href="mailto:wangcarlton@gmail.com">wangcarlton@gmail.com</a>
      </p>
      <p>
        <a href="/">Back to the app</a>
      </p>
    </article>
  );
}
