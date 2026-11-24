import { CATEGORY_LABELS, categoryColor } from "../categories";
import type { CalendarEvent, Category } from "../types";

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function EventList({ events, categories }: { events: CalendarEvent[]; categories: Record<string, Category> }) {
  const recent = [...events].reverse().slice(0, 30);
  return (
    <section className="card">
      <h2>Recent events</h2>
      <ul className="events">
        {recent.map((e) => {
          const category = categories[e.id];
          return (
            <li key={e.id}>
              <span className="event-when">
                {dateFormat.format(new Date(e.start))}
                {!e.allDay && ` · ${timeFormat.format(new Date(e.start))}`}
              </span>
              <span className="event-title">
                {e.title}
                {category && (
                  <span className="chip" style={{ borderColor: categoryColor(category) }}>
                    {CATEGORY_LABELS[category]}
                  </span>
                )}
              </span>
              <span className="event-meta">
                {e.allDay ? "All day" : `${e.durationMinutes} min`}
                {e.attendeeCount > 1 && ` · ${e.attendeeCount} people`}
                {e.isRecurring && " · recurring"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
