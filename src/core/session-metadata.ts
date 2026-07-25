import { readFile } from "node:fs/promises";
import { isErrno } from "./atomic-json.js";
import { sessionMetadataPath } from "./paths.js";
import type { SessionAttention, SessionMetadata, SessionPlanSummary } from "./types.js";

const MAX_METADATA_STRING_CHARS = 800;

export async function readSessionMetadata(sessionId: string, env: NodeJS.ProcessEnv = process.env): Promise<SessionMetadata | undefined> {
  let text: string;
  try {
    text = await readFile(sessionMetadataPath(sessionId, env), "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  }

  try {
    return parseSessionMetadata(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function parseSessionMetadata(value: unknown): SessionMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const confidence = optionalNumber("confidence", value.confidence);
  const plan = parsePlanSummary(value.plan);
  const semanticAccepted = confidence.confidence === undefined || confidence.confidence >= 0.5;
  const stage = semanticAccepted ? optionalString("stage", value.stage).stage : undefined;
  const attention = parseAttention(value.attention, stage, confidence.confidence);
  const metadata: SessionMetadata = {
    ...optionalString("source", value.source),
    ...(semanticAccepted ? {
      ...optionalString("goal", value.goal),
      ...optionalString("status", value.status),
      ...optionalString("nextStep", value.nextStep),
      ...(stage ? { stage } : {}),
      ...(attention ? { attention } : {}),
    } : {}),
    ...confidence,
    ...optionalNumber("updatedAt", value.updatedAt),
    ...(plan ? { plan } : {}),
  };

  return hasDisplayableMetadata(metadata) ? metadata : undefined;
}

function parseAttention(value: unknown, stage: string | undefined, confidence: number | undefined): SessionAttention | undefined {
  if (confidence === undefined || confidence < 0.5 || !isRecord(value)) return undefined;
  const kind = value.kind;
  if (kind !== "ready" && kind !== "question" && kind !== "blocked") return undefined;
  const expectedStage = kind === "ready" ? "complete" : kind === "question" ? "waiting" : "blocked";
  if (stage !== expectedStage) return undefined;
  const text = optionalString("text", value.text).text;
  return text ? { kind, text } : undefined;
}

function parsePlanSummary(value: unknown): SessionPlanSummary | undefined {
  if (!isRecord(value)) return undefined;
  const plan: SessionPlanSummary = {
    ...optionalString("feature", value.feature),
    ...optionalString("nextStep", value.nextStep),
  };
  if (isRecord(value.phase)) {
    const title = optionalString("title", value.phase.title).title;
    const index = value.phase.index;
    const count = value.phase.count;
    if (title && isInteger(index) && isInteger(count) && count > 0 && index >= 1 && index <= count) {
      plan.phase = { title, index, count };
    }
  }
  if (isRecord(value.tasks)) {
    const completed = value.tasks.completed;
    const total = value.tasks.total;
    if (isInteger(completed) && isInteger(total) && total > 0 && completed >= 0 && completed <= total) {
      plan.tasks = { completed, total };
    }
  }
  return plan.feature || plan.phase || plan.tasks || plan.nextStep ? plan : undefined;
}

function hasDisplayableMetadata(metadata: SessionMetadata): boolean {
  return Boolean(metadata.goal || metadata.status || metadata.nextStep || metadata.stage || metadata.attention || metadata.plan);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function optionalString<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  if (typeof value !== "string") return {};
  const trimmed = value.trim();
  const bounded = [...trimmed].slice(0, MAX_METADATA_STRING_CHARS).join("");
  return bounded ? { [key]: bounded } as Record<K, string> : {};
}

function optionalNumber<K extends string>(key: K, value: unknown): Partial<Record<K, number>> {
  return typeof value === "number" && Number.isFinite(value) ? { [key]: value } as Record<K, number> : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
