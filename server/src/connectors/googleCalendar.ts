import type { OAuth2Client } from "google-auth-library";
import type { CalendarEvent } from "./types.js";

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const MAX_PAGES = 5; // safety cap: at most 5 x 250 events

/** Subset of the Google Calendar event resource that we read. */
interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  recurringEventId?: string;
  organizer?: { self?: boolean };
}

interface GoogleEventsPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
}

export class CalendarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Fetches the user's primary calendar events in [from, to), following pagination. */
export async function fetchCalendarEvents(
  client: OAuth2Client,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true", // expand recurring events into individual occurrences
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);

    // client.request adds the access token and refreshes it if it has expired.
    const res = await client
      .request<GoogleEventsPage>({ url: `${EVENTS_URL}?${params}`, timeout: 10_000 })
      .catch((err: { response?: { status?: number }; message?: string }) => {
        throw new CalendarApiError(err.message ?? "Calendar request failed", err.response?.status ?? 502);
      });

    for (const item of res.data.items ?? []) {
      const event = toCalendarEvent(item);
      if (event) events.push(event);
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}

export function toCalendarEvent(item: GoogleEvent): CalendarEvent | null {
  if (item.status === "cancelled") return null;
  const self = item.attendees?.find((a) => a.self);
  if (self?.responseStatus === "declined") return null;

  const allDay = Boolean(item.start?.date && !item.start?.dateTime);
  const start = item.start?.dateTime ?? item.start?.date;
  const end = item.end?.dateTime ?? item.end?.date;
  if (!start || !end) return null;

  return {
    id: item.id,
    title: item.summary?.trim() || "(no title)",
    start,
    end,
    durationMinutes: Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000)),
    allDay,
    attendeeCount: item.attendees?.length ?? 0,
    isRecurring: Boolean(item.recurringEventId),
    organisedBySelf: item.organizer?.self ?? false,
  };
}
