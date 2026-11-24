import { useState } from "react";
import { categoryColor } from "../categories";
import type { CategoryTotal, Insight, InsightsResponse } from "../types";

/** What has arrived so far while the pipeline is still running. */
export interface InsightsProgress {
  stage: "starting" | "classifying" | "interpreting";
  kindsOfEvent?: number;
  categories?: CategoryTotal[];
}

export type InsightsState =
  | { status: "loading"; progress: InsightsProgress }
  | { status: "error"; message: string }
  | { status: "info"; message: string }
  | { status: "ready"; data: InsightsResponse };

const TONE_ICON: Record<Insight["tone"], string> = { warning: "⚠", positive: "✓", neutral: "•" };

export function AiInsights({ state, onRegenerate }: { state: InsightsState; onRegenerate: () => void }) {
  return (
    <section className="card ai" aria-live="polite">
      <div className="ai-header">
        <h2>AI insights</h2>
        {state.status === "ready" && (
          <button className="link" onClick={onRegenerate}>
            Regenerate
          </button>
        )}
      </div>

      {state.status === "loading" && <Loading progress={state.progress} />}
      {state.status === "error" && <p className="error">{state.message}</p>}
      {state.status === "info" && <p className="muted">{state.message}</p>}
      {state.status === "ready" && <Result data={state.data} />}
    </section>
  );
}

function Loading({ progress }: { progress: InsightsProgress }) {
  const kinds = progress.kindsOfEvent ? `${progress.kindsOfEvent} kinds of event` : "your events";
  const steps = [
    { key: "classifying", label: `Sorting ${kinds} into categories` },
    { key: "interpreting", label: "Looking for patterns worth changing" },
  ];
  const current = progress.stage === "interpreting" ? 1 : 0;
  return (
    <div className="ai-loading">
      <ol className="steps">
        {steps.map((step, i) => (
          <li key={step.key} className={i < current ? "done" : i === current ? "active" : "todo"}>
            <span className="step-mark" aria-hidden>
              {i < current ? "✓" : i === current ? "…" : "·"}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
      {progress.categories ? (
        <>
          <CategoryBreakdown categories={progress.categories} />
          <div className="skeleton" />
          <div className="skeleton short" />
        </>
      ) : (
        <>
          <div className="skeleton" />
          <div className="skeleton short" />
        </>
      )}
    </div>
  );
}

function Result({ data }: { data: InsightsResponse }) {
  return (
    <>
      <p className="ai-summary">{data.summary}</p>
      <CategoryBreakdown categories={data.categories} />
      <ul className="insights">
        {data.insights.map((insight, i) => (
          <InsightCard key={i} insight={insight} />
        ))}
      </ul>
      <TraceDetails data={data} />
    </>
  );
}

function CategoryBreakdown({ categories }: { categories: CategoryTotal[] }) {
  return (
    <div className="breakdown">
      <h3>Where your time went</h3>
      <div className="stacked" role="img" aria-label={categories.map((c) => `${c.label} ${c.sharePercent}%`).join(", ")}>
        {categories.map((c) => (
          <span
            key={c.category}
            style={{ width: `${c.sharePercent}%`, background: categoryColor(c.category) }}
            title={`${c.label}: ${c.hours}h (${c.sharePercent}%)`}
          />
        ))}
      </div>
      <ul className="legend">
        {categories.map((c) => (
          <li key={c.category}>
            <span className="swatch" style={{ background: categoryColor(c.category) }} />
            {c.label} <span className="muted">{c.hours}h · {c.sharePercent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`insight tone-${insight.tone}`}>
      <h3>
        <span className="tone-icon" aria-hidden>
          {TONE_ICON[insight.tone]}
        </span>{" "}
        {insight.title}
      </h3>
      <p>{insight.detail}</p>
      {insight.suggestion && (
        <p className="suggestion">
          <b>Try:</b> {insight.suggestion}
        </p>
      )}
      <div className="insight-footer">
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          Based on {insight.evidence.length} kind{insight.evidence.length === 1 ? "" : "s"} of event
        </button>
        {insight.unsupportedNumbers.length > 0 && (
          <span className="badge warn" title={`Not found in the data: ${insight.unsupportedNumbers.join(", ")}`}>
            Check numbers
          </span>
        )}
      </div>
      {open && (
        <ul className="evidence">
          {insight.evidence.map((e) => (
            <li key={e.ref}>
              <span className="swatch" style={{ background: categoryColor(e.category) }} />
              {e.title} <span className="muted">×{e.occurrences}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function TraceDetails({ data }: { data: InsightsResponse }) {
  const { trace } = data;
  const checks = trace.checks;
  return (
    <details className="trace">
      <summary>
        {trace.model} · {(trace.totalLatencyMs / 1000).toFixed(1)}s · {(trace.inputTokens + trace.outputTokens).toLocaleString()}{" "}
        tokens · ~${trace.costUsd.toFixed(4)}
        {data.cached && " · cached"}
      </summary>
      <p className="muted">How this was made: code groups events by title; the model classifies each kind of event; code
        computes every number; the model interprets those numbers; code checks its citations and numbers.</p>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Time</th>
            <th>Input</th>
            <th>Output</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {trace.steps.map((s) => (
            <tr key={s.step}>
              <td>{s.step}</td>
              <td>{(s.latencyMs / 1000).toFixed(1)}s</td>
              <td>{s.inputTokens.toLocaleString()}</td>
              <td>{s.outputTokens.toLocaleString()}</td>
              <td>${s.costUsd.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Checks: {checks.groupsClassified} kinds of event classified, {checks.missingClassifications} skipped by the model,{" "}
        {checks.invalidRefs} invented refs ignored, {checks.insightsDropped} insights dropped for missing evidence.
      </p>
    </details>
  );
}
