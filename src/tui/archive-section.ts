import { sessionSection, type SessionSection } from "../core/session-bucket.js";
import { isSubagentSession } from "../core/session-tree.js";
import type { RuntimeSession } from "../core/types.js";

export const ARCHIVED_PARENT_PREVIEW_LIMIT = 5;

export interface EffectiveSessionLifecycle {
  section: SessionSection;
  bucketChangedAt?: number;
}

export interface ArchiveSectionResult<T> {
  rows: T[];
  hiddenParents: number;
  showDisclosure: boolean;
}

export function effectiveSessionLifecycle(session: RuntimeSession, sessions: RuntimeSession[]): EffectiveSessionLifecycle {
  const owner = topLevelOwner(session, sessions) ?? session;
  return {
    section: sessionSection(owner),
    ...(typeof owner.bucketChangedAt === "number" ? { bucketChangedAt: owner.bucketChangedAt } : {}),
  };
}

export function archiveSectionRows<T extends RuntimeSession>(
  orderedRows: T[],
  options: { expanded: boolean; filterActive: boolean },
): ArchiveSectionResult<T> {
  const archivedParents = orderedRows.filter((row) => !isSubagentSession(row) && effectiveSessionLifecycle(row, orderedRows).section === "archived");
  const hiddenParents = Math.max(0, archivedParents.length - ARCHIVED_PARENT_PREVIEW_LIMIT);
  const showDisclosure = !options.filterActive && hiddenParents > 0;
  if (options.expanded || options.filterActive || hiddenParents === 0) return { rows: orderedRows, hiddenParents, showDisclosure };

  const visibleParentIds = new Set(archivedParents.slice(0, ARCHIVED_PARENT_PREVIEW_LIMIT).map((row) => row.id));
  return {
    rows: orderedRows.filter((row) => {
      if (effectiveSessionLifecycle(row, orderedRows).section !== "archived") return true;
      if (!isSubagentSession(row)) return visibleParentIds.has(row.id);
      const owner = topLevelOwner(row, orderedRows);
      return !owner || isSubagentSession(owner) || visibleParentIds.has(owner.id);
    }),
    hiddenParents,
    showDisclosure,
  };
}

function topLevelOwner(session: RuntimeSession, sessions: RuntimeSession[]): RuntimeSession | undefined {
  if (!isSubagentSession(session)) return session;
  const byId = new Map(sessions.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  let owner: RuntimeSession = session;
  while (isSubagentSession(owner) && owner.parentId && !seen.has(owner.parentId)) {
    seen.add(owner.parentId);
    const parent = byId.get(owner.parentId);
    if (!parent) return undefined;
    owner = parent;
  }
  return owner;
}
