import type { CalendarStats } from "../types";

export function StatsSummary({ stats, period }: { stats: CalendarStats; period: string }) {
  const maxHours = Math.max(...Object.values(stats.hoursByWeekday), 1);
  return (
    <section className="card">
      <h2>Last {period}</h2>
      <div className="stats">
        <Stat label="Events" value={stats.eventCount} />
        <Stat label="Hours scheduled" value={stats.totalMeetingHours} />
        <Stat label="Average length" value={`${stats.averageMeetingMinutes} min`} />
        <Stat label="Recurring" value={`${Math.round(stats.recurringShare * 100)}%`} />
      </div>
      <h3>Hours by weekday</h3>
      <ul className="bars">
        {Object.entries(stats.hoursByWeekday).map(([day, hours]) => (
          <li key={day}>
            <span className="bar-label">{day.slice(0, 3)}</span>
            <span className="bar" style={{ width: `${(hours / maxHours) * 100}%`, visibility: hours > 0 ? "visible" : "hidden" }} />
            <span className="bar-value">{hours}h</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
