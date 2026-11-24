import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { googleAuthRouter } from "./auth/google.js";
import { loadConfig } from "./config.js";
import { CalendarApiError } from "./connectors/googleCalendar.js";
import { apiRouter } from "./routes/api.js";
import { createSessionMiddleware } from "./session.js";

const config = loadConfig();
const app = express();

app.disable("x-powered-by");
if (config.NODE_ENV === "production") app.set("trust proxy", 1); // secure cookies behind the host's proxy

app.use(express.json({ limit: "100kb" }));
app.use(createSessionMiddleware(config));

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/auth", googleAuthRouter(config));
app.use("/api", apiRouter(config));

// In production, Express also serves the built React app, so the whole app runs on one origin:
// no CORS, and the session cookie stays first-party.
if (config.NODE_ENV === "production") {
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: "invalid_request", issues: err.issues });
  if (err instanceof CalendarApiError) {
    const status = err.status === 401 ? 401 : err.status === 429 ? 429 : err.status === 409 ? 409 : 502;
    return res.status(status).json({ error: "calendar_error", message: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(config.PORT, () => console.log(`API listening on http://localhost:${config.PORT}`));
