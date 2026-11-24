import { z } from "zod";

// Fail fast at startup if configuration is missing, instead of failing on the first request.
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET should be at least 32 characters"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  // Used only to estimate cost in the UI and logs; check the provider's current price list.
  OPENAI_INPUT_USD_PER_MTOK: z.coerce.number().nonnegative().default(0.25),
  OPENAI_OUTPUT_USD_PER_MTOK: z.coerce.number().nonnegative().default(2),
  INSIGHTS_PER_SESSION_PER_HOUR: z.coerce.number().int().positive().default(10),
  INSIGHTS_PER_DAY: z.coerce.number().int().positive().default(300),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
