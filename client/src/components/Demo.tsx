export function Demo() {
  return (
    <article className="card prose">
      <h2>Demo video</h2>
      <p>
        Opening the app after it has been idle, signing in with Google, connecting a calendar, and the AI insights
        arriving stage by stage (1 min 45 s, no sound).
      </p>
      <video className="demo-video" src="/demo.mp4" poster="/demo.png" controls preload="none" />
      <p>
        <a href="/">Back to the app</a>
      </p>
    </article>
  );
}
