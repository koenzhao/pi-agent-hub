import { sectionRank, sessionSection } from "./session-bucket.js";
import type { ManagedSession } from "./types.js";

export function orderedSessions<T extends ManagedSession>(sessions: T[], prioritySessions: readonly ManagedSession[] = sessions): T[] {
  const ranks = orderRanks(sessions);
  const priorityGroups = groupsByPriorityKey(prioritySessions);
  const indexById = new Map(sessions.map((session, index) => [session.id, index]));
  return sessions.slice().sort((a, b) => {
    const sectionDifference = sectionRank(a) - sectionRank(b);
    if (sectionDifference) return sectionDifference;
    if (sessionSection(a) === "archived") {
      const aChangedAt = typeof a.bucketChangedAt === "number" ? a.bucketChangedAt : -Infinity;
      const bChangedAt = typeof b.bucketChangedAt === "number" ? b.bucketChangedAt : -Infinity;
      return bChangedAt - aChangedAt || indexById.get(a.id)! - indexById.get(b.id)!;
    }
    return compareGroupPriority(priorityGroups.get(groupPriorityKey(a))!, priorityGroups.get(groupPriorityKey(b))!)
      || groupOrder(a.group, b.group)
      || compareSessionPriority(a, b)
      || ranks.get(a.id)! - ranks.get(b.id)!
      || indexById.get(a.id)! - indexById.get(b.id)!;
  });
}

export function sessionPriorityRank(session: Pick<ManagedSession, "status">): number {
  if (session.status === "error") return 0;
  if (session.status === "starting" || session.status === "running") return 1;
  if (session.status === "waiting" || session.status === "idle") return 2;
  return 3;
}

export function compareSessionPriority(
  a: Pick<ManagedSession, "status" | "lastActivityAt">,
  b: Pick<ManagedSession, "status" | "lastActivityAt">,
): number {
  const aRank = sessionPriorityRank(a);
  const bRank = sessionPriorityRank(b);
  const rankDifference = aRank - bRank;
  if (rankDifference) return rankDifference;
  return aRank === 2 ? compareActivity(a.lastActivityAt, b.lastActivityAt) : 0;
}

export function groupPriorityRank(sessions: readonly Pick<ManagedSession, "status">[]): number {
  return sessions.reduce((rank, session) => Math.min(rank, sessionPriorityRank(session)), 3);
}

export function compareGroupPriority(
  a: readonly Pick<ManagedSession, "status" | "lastActivityAt">[],
  b: readonly Pick<ManagedSession, "status" | "lastActivityAt">[],
): number {
  const aRank = groupPriorityRank(a);
  const bRank = groupPriorityRank(b);
  const rankDifference = aRank - bRank;
  if (rankDifference) return rankDifference;
  if (aRank !== 2) return 0;
  return compareActivity(groupActivity(a, aRank), groupActivity(b, bRank));
}

function groupActivity(sessions: readonly Pick<ManagedSession, "status" | "lastActivityAt">[], rank: number): number | undefined {
  let latest: number | undefined;
  for (const session of sessions) {
    if (sessionPriorityRank(session) !== rank || session.lastActivityAt === undefined) continue;
    latest = latest === undefined ? session.lastActivityAt : Math.max(latest, session.lastActivityAt);
  }
  return latest;
}

function compareActivity(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return b - a;
}

export function nextOrderInGroup(sessions: ManagedSession[], group: string, section: ReturnType<typeof sessionSection> = "active"): number {
  const ranks = orderRanks(sessions);
  const orders = sessions.filter((session) => session.group === group && sessionSection(session) === section).map((session) => ranks.get(session.id) ?? 0);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

export function assignGroupOrder<T extends ManagedSession>(sessions: T[], orderedIds: string[], group: string, section: ReturnType<typeof sessionSection> = "active"): T[] {
  const orderById = new Map(orderedIds.map((id, index) => [id, index]));
  return sessions.map((session) => session.group === group && sessionSection(session) === section ? { ...session, order: orderById.get(session.id) ?? session.order } : session);
}

export function groupOrder(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "default") return -1;
  if (b === "default") return 1;
  return a.localeCompare(b);
}

function groupsByPriorityKey(sessions: readonly ManagedSession[]): Map<string, ManagedSession[]> {
  const grouped = new Map<string, ManagedSession[]>();
  for (const session of sessions) {
    const key = groupPriorityKey(session);
    const group = grouped.get(key) ?? [];
    group.push(session);
    grouped.set(key, group);
  }
  return grouped;
}

function groupPriorityKey(session: ManagedSession): string {
  return `${sessionSection(session)}\0${session.group}`;
}

function orderRanks(sessions: ManagedSession[]): Map<string, number> {
  const groupCounts = new Map<string, number>();
  const ranks = new Map<string, number>();
  for (const session of sessions) {
    const fallback = groupCounts.get(session.group) ?? 0;
    groupCounts.set(session.group, fallback + 1);
    ranks.set(session.id, typeof session.order === "number" && Number.isFinite(session.order) ? session.order : fallback);
  }
  return ranks;
}
