import type { EventsResponse, InsightsResponse, InsightsStreamEvent, Me } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? "request_failed");
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const api = {
  me: () => request<Me>("/api/me"),
  events: (days = 28) =>
    request<EventsResponse>(`/api/calendar/events?days=${days}&tz=${encodeURIComponent(timeZone)}`),
  insights: (refresh = false, days = 28) =>
    request<InsightsResponse>("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days, tz: timeZone, refresh }),
    }),
  /**
   * Runs the AI pipeline and calls `onEvent` as each stage finishes. The server sends one JSON
   * object per line; errors before the stream starts arrive as normal HTTP errors.
   */
  insightsStream: async (
    opts: { refresh: boolean; days: number; signal?: AbortSignal },
    onEvent: (event: InsightsStreamEvent) => void,
  ): Promise<void> => {
    const res = await fetch("/api/insights/stream", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: opts.days, tz: timeZone, refresh: opts.refresh }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? "request_failed");
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onEvent(JSON.parse(line) as InsightsStreamEvent);
      }
      if (done) break;
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as InsightsStreamEvent);
  },
  startDemo: () => request<void>("/auth/demo", { method: "POST" }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
};
