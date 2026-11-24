/**
 * A deliberately small LLM interface: one call that must return JSON matching a schema.
 * The insights pipeline depends on this interface, not on OpenAI, so tests use a fake
 * and another provider could be added without touching the pipeline.
 */
export interface JsonCompletionRequest {
  /** Name of the step, used in traces and logs. */
  step: string;
  system: string;
  user: string;
  /** JSON Schema for the response (OpenAI structured outputs, strict mode). */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  /** For reasoning models: how much to think before answering. Ignored by other models. */
  reasoningEffort?: "minimal" | "low" | "medium";
}

export interface JsonCompletion {
  data: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface LlmClient {
  readonly model: string;
  completeJson(req: JsonCompletionRequest): Promise<JsonCompletion>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

interface OpenAiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

/** OpenAI Chat Completions with structured outputs, a timeout and bounded retries. */
export class OpenAiClient implements LlmClient {
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAiOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.baseUrl = (opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 45_000;
    this.maxRetries = opts.maxRetries ?? 1;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async completeJson(req: JsonCompletionRequest): Promise<JsonCompletion> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      response_format: { type: "json_schema", json_schema: { name: req.step, strict: true, schema: req.schema } },
      max_completion_tokens: req.maxOutputTokens,
    };
    // Reasoning models think before answering; these tasks are simple, so keep that short.
    if (/^(gpt-5|o\d)/.test(this.model)) body.reasoning_effort = req.reasoningEffort ?? "low";

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(1000 * attempt);
      const started = Date.now();
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          const retryable = res.status === 429 || res.status >= 500;
          lastError = new LlmError(`OpenAI returned ${res.status}`, res.status);
          if (retryable) continue;
          throw lastError;
        }
        const json = (await res.json()) as OpenAiResponse;
        const choice = json.choices?.[0];
        if (choice?.message?.refusal) throw new LlmError("The model refused the request");
        if (choice?.finish_reason === "length") throw new LlmError("The model ran out of output tokens");
        const content = choice?.message?.content;
        if (!content) throw new LlmError("The model returned no content");
        return {
          data: JSON.parse(content),
          model: json.model ?? this.model,
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        if (err instanceof LlmError && !(err.status === 429 || (err.status ?? 0) >= 500)) throw err;
        lastError = err;
      }
    }
    throw lastError instanceof LlmError ? lastError : new LlmError(`OpenAI request failed: ${String(lastError)}`);
  }
}

interface OpenAiResponse {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
