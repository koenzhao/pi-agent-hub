import { sessionSection, type SessionSection } from "../core/session-bucket.js";
import { createSessionTreeIndex, isSubagentSession, type SessionTreeIndex } from "../core/session-tree.js";
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

export function effectiveSessionLifecycle<T extends RuntimeSession>(
  session: T,
  sessions: readonly T[],
  tree: SessionTreeIndex<T> = createSessionTreeIndex(sessions),
): EffectiveSessionLifecycle {
  const owner = archiveOwner(session, tree) ?? session;
  return {
    section: sessionSection(owner),
    ...(typeof owner.bucketChangedAt === "number" ? { bucketChangedAt: owner.bucketChangedAt } : {}),
  };
}

export function archiveSectionRows<T extends RuntimeSession>(
  orderedRows: T[],
  options: { expanded: boolean; filterActive: boolean },
  tree: SessionTreeIndex<T> = createSessionTreeIndex(orderedRows),
): ArchiveSectionResult<T> {
  const archivedParents = orderedRows.filter((row) => !isSubagentSession(row) && effectiveSessionLifecycle(row, orderedRows, tree).section === "archived");
  const hiddenParents = Math.max(0, archivedParents.length - ARCHIVED_PARENT_PREVIEW_LIMIT);
  const showDisclosure = !options.filterActive && hiddenParents > 0;
  if (options.expanded || options.filterActive || hiddenParents === 0) return { rows: orderedRows, hiddenParents, showDisclosure };

  const visibleParentIds = new Set(archivedParents.slice(0, ARCHIVED_PARENT_PREVIEW_LIMIT).map((row) => row.id));
  return {
    rows: orderedRows.filter((row) => {
      if (effectiveSessionLifecycle(row, orderedRows, tree).section !== "archived") return true;
      if (!isSubagentSession(row)) return visibleParentIds.has(row.id);
      const owner = archiveOwner(row, tree);
      return !owner || isSubagentSession(owner) || visibleParentIds.has(owner.id);
    }),
    hiddenParents,
    showDisclosure,
  };
}

function archiveOwner<T extends RuntimeSession>(session: T, tree: SessionTreeIndex<T>): T | undefined {
  const trace = tree.trace(session);
  return trace.missingParent ? undefined : trace.terminal;
}
