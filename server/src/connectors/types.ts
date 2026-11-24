/**
 * Our own model of a calendar event. Connectors convert provider data into this
 * shape, so the rest of the app (stats, AI, UI) never depends on Google's format.
 *
 * Deliberately excludes descriptions, locations and attendee emails: the insights
 * do not need them, so we never fetch them into our model or send them to an LLM.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  durationMinutes: number;
  allDay: boolean;
  attendeeCount: number;
  isRecurring: boolean;
  organisedBySelf: boolean;
}
