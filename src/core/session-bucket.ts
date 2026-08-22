import { nextUpdatedAt } from "./session-version.js";
import type { ManagedSession } from "./types.js";

export type SessionSection = "active" | "backlog" | "archived";

export const ARCHIVE_PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionSection(session: ManagedSession): SessionSection {
  return session.bucket ?? "active";
}

export function sectionRank(session: ManagedSession): number {
  switch (sessionSection(session)) {
    case "active": return 0;
    case "backlog": return 1;
    case "archived": return 2;
  }
}

export function moveToBucket<T extends ManagedSession>(session: T, bucket: "backlog" | "archived", now = Date.now()): T {
  if (session.bucket === bucket) return session;
  return { ...session, bucket, bucketChangedAt: now, updatedAt: nextUpdatedAt(session.updatedAt, now) };
}

export function restoreBucket<T extends ManagedSession>(session: T, now = Date.now()): T {
  if (session.bucket === undefined) return session;
  const { bucket: _bucket, bucketChangedAt: _bucketChangedAt, ...rest } = session;
  return { ...rest, updatedAt: nextUpdatedAt(session.updatedAt, now) } as T;
}
