import type { CalendarEvent } from "../connectors/types.js";
import type { JsonCompletion, JsonCompletionRequest, LlmClient } from "./llm.js";

/** A scripted stand-in for the model, so pipeline tests are fast, free and deterministic. */
export class FakeLlm implements LlmClient {
  readonly model = "fake-model";
  readonly requests: JsonCompletionRequest[] = [];
  constructor(private readonly respond: (req: JsonCompletionRequest) => unknown) {}

  async completeJson(req: JsonCompletionRequest): Promise<JsonCompletion> {
    this.requests.push(req);
    return { data: this.respond(req), model: this.model, inputTokens: 1000, outputTokens: 200, latencyMs: 5 };
  }
}

let n = 0;
export function event(partial: Partial<CalendarEvent> & { start: string; durationMinutes?: number }): CalendarEvent {
  const minutes = partial.durationMinutes ?? 60;
  return {
    id: partial.id ?? `e${++n}`,
    title: partial.title ?? "Meeting",
    start: partial.start,
    end: partial.end ?? new Date(Date.parse(partial.start) + minutes * 60_000).toISOString(),
    durationMinutes: minutes,
    allDay: partial.allDay ?? false,
    attendeeCount: partial.attendeeCount ?? 3,
    isRecurring: partial.isRecurring ?? false,
    organisedBySelf: partial.organisedBySelf ?? false,
  };
}
