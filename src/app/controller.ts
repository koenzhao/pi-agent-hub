import { unlink } from "node:fs/promises";
import { isErrno } from "../core/atomic-json.js";
import { removeMultiRepoWorkspace } from "../core/multi-repo.js";
import { heartbeatPath, sessionMetadataPath } from "../core/paths.js";
import { loadRegistry, normalizeGroup, renameGroup as renameRegistryGroup, saveRegistry, updateRegistry } from "../core/registry.js";
import { ARCHIVE_PRUNE_AFTER_MS, moveToBucket, restoreBucket, sessionSection } from "../core/session-bucket.js";
import { assignGroupOrder, compareSessionPriority, nextOrderInGroup, orderedSessions } from "../core/session-order.js";
import { orderedSessionRows, isSubagentSession, sessionCascadeIds } from "../core/session-tree.js";
import { readPiSessionName } from "../core/pi-session-name.js";
import { readSessionMetadata } from "../core/session-metadata.js";
import { applyComputedStatus, computeStatus, markAcknowledged, readHeartbeat } from "../core/status.js";
import { capturePane, sessionPresence } from "../core/tmux.js";
import type { SessionsRegistry, ManagedSession, RuntimeSession, SessionMetadata, SessionBucket } from "../core/types.js";

export interface SessionsSnapshot {
  registry: SessionsRegistry;
  sessions: RuntimeSession[];
  selectedId?: string;
  preview: string;
  filter?: string;
}

export type SyncPiNameResult =
  | { status: "synced"; name: string }
  | { status: "unavailable" }
  | { status: "unnamed" };

export class SessionsController {
  private registry: SessionsRegistry;
  private sessionMetadata = new Map<string, SessionMetadata>();
  private selectedId: string | undefined;
  private preview = "";
  private previewRequest = 0;
  private filter: string | undefined;

  constructor(
    registry: SessionsRegistry = { version: 1, sessions: [] },
    private capture: typeof capturePane = capturePane,
  ) {
    this.registry = registry;
    this.selectedId = visibleSessions(registry.sessions, undefined)[0]?.id;
  }

  async refresh(now = Date.now()): Promise<void> {
    this.registry = await loadRegistry();
    this.selectedId = keepSelection(this.registry.sessions, this.selectedId);
    const sessions: ManagedSession[] = [];
    const prunedIds = new Set<string>();
    for (const session of this.registry.sessions) {
      const presence = await sessionPresence(session.tmuxSession);
      const exists = presence === "present";
      if (isSubagentSession(session) && presence === "missing") {
        prunedIds.add(session.id);
        this.sessionMetadata.delete(session.id);
        continue;
      }
      const heartbeat = await readHeartbeat(session.id);
      const sessionMetadata = await readSessionMetadata(session.id);
      if (sessionMetadata) this.sessionMetadata.set(session.id, sessionMetadata);
      else this.sessionMetadata.delete(session.id);
      const computed = computeStatus({ session, tmux: { exists }, heartbeat, now });
      const updated = applyComputedStatus(session, computed, now, heartbeat);
      sessions.push(updated);
    }
    const updatedById = new Map(sessions.map((session) => [session.id, session]));
    const expiredArchivedIds = await expiredArchivedCascadeIds(this.registry.sessions, now);
    for (const id of expiredArchivedIds) {
      prunedIds.add(id);
      this.sessionMetadata.delete(id);
    }
    const prunedSessions = this.registry.sessions.filter((session) => prunedIds.has(session.id));
    this.registry = await updateRegistry((latest) => ({
      ...latest,
      sessions: latest.sessions.flatMap((session) => {
        if (prunedIds.has(session.id)) return [];
        return [updatedById.get(session.id) ?? session];
      }),
    }));
    for (const session of prunedSessions) await removeDashboardState(session);
    this.selectedId = keepSelection(this.registry.sessions, this.selectedId);
  }

  async refreshPreview(lines = 160): Promise<void> {
    const request = ++this.previewRequest;
    const selected = this.selected();
    if (!selected || selected.status === "stopped" || selected.status === "error") {
      this.preview = "";
      return;
    }
    const preview = await this.capture(selected.tmuxSession, lines, { preserveStyles: true });
    if (request === this.previewRequest && this.selectedId === selected.id) this.preview = preview;
  }

  snapshot(): SessionsSnapshot {
    return { registry: this.registry, sessions: this.sessionsWithMetadata(), selectedId: this.selectedId, preview: this.preview, filter: this.filter };
  }

  async save(): Promise<void> {
    await saveRegistry(this.registry);
  }

  move(delta: number): void {
    const sessions = this.visibleSessions();
    if (!sessions.length) {
      this.selectedId = undefined;
      return;
    }
    const index = Math.max(0, sessions.findIndex((session) => session.id === this.selectedId));
    const next = (index + delta + sessions.length) % sessions.length;
    const nextId = sessions[next]?.id;
    if (nextId !== this.selectedId) {
      this.selectedId = nextId;
      this.preview = "";
      this.previewRequest += 1;
    }
  }

  setFilter(filter: string | undefined): void {
    const previousId = this.selectedId;
    this.filter = filter?.trim() || undefined;
    this.selectedId = keepSelection(this.visibleSessions(), this.selectedId);
    if (this.selectedId !== previousId) {
      this.preview = "";
      this.previewRequest += 1;
    }
  }

  async acknowledgeSelected(now = Date.now()): Promise<void> {
    const selected = this.selected();
    if (!selected) return;
    await this.acknowledgeSession(selected.id, now);
  }

  async acknowledgeSession(id: string, now = Date.now()): Promise<void> {
    this.registry = {
      ...this.registry,
      sessions: this.registry.sessions.map((session) => session.id === id ? markAcknowledged(session, now) : session),
    };
    await saveRegistry(this.registry);
  }

  async moveSessionToGroup(id: string, group: string, now = Date.now()): Promise<void> {
    const normalized = normalizeGroup(group);
    const selected = this.registry.sessions.find((session) => session.id === id);
    const section = selected ? sessionSection(selected) : "active";
    const order = selected && selected.group !== normalized ? nextOrderInGroup(this.registry.sessions, normalized, section) : selected?.order;
    this.registry = {
      ...this.registry,
      sessions: this.registry.sessions.map((session) => {
        if (session.id === id) return { ...session, group: normalized, order, updatedAt: now };
        if (selected && !isSubagentSession(selected) && session.parentId === id) return { ...session, group: normalized, updatedAt: now };
        return session;
      }),
    };
    await saveRegistry(this.registry);
  }

  async reorderSelected(delta: -1 | 1): Promise<void> {
    if (this.filter) return;
    const selected = this.selected();
    if (!selected || isSubagentSession(selected)) return;
    const section = sessionSection(selected);
    if (section === "archived") return;
    const group = orderedSessions(this.registry.sessions).filter((session) => session.group === selected.group && sessionSection(session) === section && !isSubagentSession(session));
    const cohort = group.filter((session) => compareSessionPriority(session, selected) === 0);
    const cohortIndex = cohort.findIndex((session) => session.id === selected.id);
    const target = cohort[cohortIndex + delta];
    if (cohortIndex < 0 || !target) return;
    const ids = group.map((session) => session.id);
    const index = ids.indexOf(selected.id);
    const targetIndex = ids.indexOf(target.id);
    [ids[index], ids[targetIndex]] = [ids[targetIndex]!, ids[index]!];
    this.registry = { ...this.registry, sessions: assignGroupOrder(this.registry.sessions, ids, selected.group, section) };
    await saveRegistry(this.registry);
  }

  async moveSessionToBucket(id: string, bucket: SessionBucket, now = Date.now()): Promise<void> {
    const selected = this.registry.sessions.find((session) => session.id === id);
    if (!selected || isSubagentSession(selected)) return;
    const wasSelected = this.selectedId === id;
    const oldIndex = this.visibleSessions().findIndex((session) => session.id === id);
    const ids = sessionCascadeIds(this.registry.sessions, id);
    this.registry = {
      ...this.registry,
      sessions: this.registry.sessions.map((session) => ids.has(session.id) ? moveToBucket(session, bucket, now) : session),
    };
    if (wasSelected && bucket === "archived") this.selectedId = selectionAboveArchivedRow(this.visibleSessions(), oldIndex) ?? this.selectedId;
    await saveRegistry(this.registry);
  }

  async restoreSessionBucket(id: string, now = Date.now()): Promise<void> {
    const selected = this.registry.sessions.find((session) => session.id === id);
    if (!selected || isSubagentSession(selected)) return;
    const ids = sessionCascadeIds(this.registry.sessions, id);
    this.registry = {
      ...this.registry,
      sessions: this.registry.sessions.map((session) => ids.has(session.id) ? restoreBucket(session, now) : session),
    };
    await saveRegistry(this.registry);
  }

  async renameSession(id: string, title: string, now = Date.now()): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("title is required");
    this.registry = {
      ...this.registry,
      sessions: this.registry.sessions.map((session) => session.id === id ? { ...session, title: trimmed, updatedAt: now } : session),
    };
    await saveRegistry(this.registry);
  }

  async syncPiName(id: string, now = Date.now()): Promise<SyncPiNameResult> {
    const selected = this.registry.sessions.find((session) => session.id === id);
    if (!selected?.sessionFile) return { status: "unavailable" };
    let name: string | undefined;
    try {
      name = await readPiSessionName(selected.sessionFile);
    } catch (error) {
      if (isErrno(error, "ENOENT")) return { status: "unavailable" };
      throw error;
    }
    if (!name) return { status: "unnamed" };
    this.registry = {
      ...this.registry,
      sessions: this.registry.sessions.map((session) => session.id === id ? { ...session, title: name, updatedAt: now } : session),
    };
    await saveRegistry(this.registry);
    return { status: "synced", name };
  }

  async renameGroup(from: string, to: string): Promise<void> {
    this.registry = renameRegistryGroup(this.registry, from, to);
    await saveRegistry(this.registry);
  }

  removeSession(id: string): void {
    const before = this.visibleSessions();
    const oldIndex = before.findIndex((session) => session.id === id);
    const wasSelected = this.selectedId === id;
    const ids = sessionCascadeIds(this.registry.sessions, id);
    this.registry = { ...this.registry, sessions: this.registry.sessions.filter((session) => !ids.has(session.id)) };
    const after = this.visibleSessions();
    this.selectedId = wasSelected ? after[Math.min(oldIndex, after.length - 1)]?.id : keepSelection(after, this.selectedId);
    if (wasSelected) this.preview = "";
  }

  selectSession(id: string): boolean {
    if (!this.visibleSessions().some((session) => session.id === id)) return false;
    if (id !== this.selectedId) {
      this.selectedId = id;
      this.preview = "";
      this.previewRequest += 1;
    }
    return true;
  }

  selected(): RuntimeSession | undefined {
    if (!this.selectedId) return undefined;
    return this.visibleSessions().find((session) => session.id === this.selectedId);
  }

  private visibleSessions(): RuntimeSession[] {
    return visibleSessions(this.sessionsWithMetadata(), this.filter);
  }

  private sessionsWithMetadata(): RuntimeSession[] {
    return this.registry.sessions.map((session) => {
      const metadata = this.sessionMetadata.get(session.id);
      return metadata ? { ...session, sessionMetadata: metadata } : session;
    });
  }
}

function keepSelection(sessions: RuntimeSession[], selectedId: string | undefined): string | undefined {
  if (!sessions.length) return undefined;
  if (selectedId && sessions.some((session) => session.id === selectedId)) return selectedId;
  return sessions[0]?.id;
}

function selectionAboveArchivedRow(sessions: RuntimeSession[], oldIndex: number): string | undefined {
  const nonArchived = sessions.filter((session) => sessionSection(session) !== "archived");
  if (!nonArchived.length) return undefined;
  const targetIndex = Math.min(Math.max(oldIndex - 1, 0), nonArchived.length - 1);
  return nonArchived[targetIndex]?.id;
}

function visibleSessions(sessions: RuntimeSession[], filter: string | undefined): RuntimeSession[] {
  return orderedSessionRows(sessions, filter);
}

async function expiredArchivedCascadeIds(sessions: ManagedSession[], now: number): Promise<Set<string>> {
  const pruneIds = new Set<string>();
  for (const session of sessions) {
    if (isSubagentSession(session) || session.bucket !== "archived" || typeof session.bucketChangedAt !== "number") continue;
    if (now - session.bucketChangedAt < ARCHIVE_PRUNE_AFTER_MS) continue;
    const ids = sessionCascadeIds(sessions, session.id);
    const cascade = sessions.filter((item) => ids.has(item.id));
    const presences = await Promise.all(cascade.map((item) => sessionPresence(item.tmuxSession)));
    if (presences.every((presence) => presence === "missing")) for (const id of ids) pruneIds.add(id);
  }
  return pruneIds;
}

async function removeDashboardState(session: ManagedSession): Promise<void> {
  await removeMultiRepoWorkspace(session);
  await unlink(heartbeatPath(session.id)).catch((error: unknown) => {
    if (!isErrno(error, "ENOENT")) throw error;
  });
  await unlink(sessionMetadataPath(session.id)).catch((error: unknown) => {
    if (!isErrno(error, "ENOENT")) throw error;
  });
}
