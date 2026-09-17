import { mergeWorkspaceChanges, workspaceValuesEqual } from "./workspaceMerge";

export type WorkspaceEntityType = "project" | "identity" | "style" | "template";
export interface WorkspaceSnapshot<T> { data: T; revision: number }
export class WorkspaceSaveError extends Error {
  constructor(public readonly code: string, message: string, public readonly conflicts: string[] = []) { super(message); this.name = "WorkspaceSaveError"; }
}
interface EntityCache { snapshot?: WorkspaceSnapshot<unknown>; pending: number; tail: Promise<unknown>; lastDesired?: unknown; blocked?: Error }

export function createWorkspaceClient(request: (path: string, init?: RequestInit) => Promise<Response> = (path, init) => fetch(path, init)) {
  const records = new Map<string, EntityCache>();
  const key = (type: WorkspaceEntityType, id: string) => `${type}:${id}`;
  function cache(type: WorkspaceEntityType, id: string): EntityCache {
    const found = records.get(key(type, id));
    if (found) return found;
    const created: EntityCache = { pending: 0, tail: Promise.resolve() };
    records.set(key(type, id), created); return created;
  }
  async function read<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await request(path, init);
    let body: any;
    try { body = await response.json(); } catch { throw new WorkspaceSaveError("INVALID_RESPONSE", "本地服务返回了无效响应。"); }
    if (!response.ok) throw new WorkspaceSaveError(body.error?.code ?? "SAVE_FAILED", body.error?.message ?? "工作区操作失败。");
    return body as T;
  }
  function path(type: WorkspaceEntityType, id?: string) { return `/api/workspace/entities/${type}${id ? `/${encodeURIComponent(id)}` : ""}`; }
  async function snapshots<T>(type: WorkspaceEntityType): Promise<WorkspaceSnapshot<T>[]> { return read(path(type) + "?versioned=1"); }
  function adopt<T>(type: WorkspaceEntityType, snapshot: WorkspaceSnapshot<T>) {
    const id = (snapshot.data as { id?: string })?.id;
    if (!id) throw new WorkspaceSaveError("INVALID_RESPONSE", "工作区记录缺少 id。");
    const entry = cache(type, id);
    if (entry.pending) throw new WorkspaceSaveError("SAVE_PENDING", "请等待正在进行的保存完成。");
    entry.snapshot = structuredClone(snapshot); entry.blocked = undefined; entry.lastDesired = undefined;
  }
  async function list<T>(type: WorkspaceEntityType): Promise<T[]> {
    const values = await snapshots<T>(type);
    for (const snapshot of values) {
      const id = (snapshot.data as { id?: string })?.id;
      if (id && !cache(type, id).pending) adopt(type, snapshot);
    }
    return values.map(value => value.data);
  }
  function save<T>(type: WorkspaceEntityType, id: string, data: T): Promise<WorkspaceSnapshot<T>> {
    const entry = cache(type, id);
    const before = structuredClone(entry.lastDesired ?? entry.snapshot?.data);
    const desired = structuredClone(data);
    entry.lastDesired = desired;
    entry.pending++;
    const operation = entry.tail.then(async () => {
      if (entry.blocked) throw entry.blocked;
      let merged = mergeWorkspaceChanges(before, desired, entry.snapshot?.data);
      if (merged.conflicts.length) throw new WorkspaceSaveError("REVISION_CONFLICT", "同一内容已被 Agent 或其他窗口修改，本地改动已保留。", merged.conflicts);
      let next = merged.value;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (entry.snapshot && workspaceValuesEqual(next, entry.snapshot.data)) return entry.snapshot as WorkspaceSnapshot<T>;
        const baseline = entry.snapshot;
        try {
          const saved = await read<WorkspaceSnapshot<T>>(path(type, id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: next, expectedRevision: baseline?.revision ?? null }) });
          entry.snapshot = structuredClone(saved);
          return saved;
        } catch (error) {
          if (!(error instanceof WorkspaceSaveError) || error.code !== "REVISION_CONFLICT" || attempt === 2) throw error;
          const remote = await read<WorkspaceSnapshot<T>>(path(type, id));
          merged = mergeWorkspaceChanges(baseline?.data, next, remote.data);
          if (merged.conflicts.length) throw new WorkspaceSaveError("REVISION_CONFLICT", "同一内容已被 Agent 或其他窗口修改，本地改动已保留。", merged.conflicts);
          entry.snapshot = structuredClone(remote);
          next = merged.value;
        }
      }
      throw new WorkspaceSaveError("REVISION_CONFLICT", "工作区持续变化，请稍后重新载入。");
    }).catch(error => { entry.blocked = error instanceof Error ? error : new Error("工作区保存失败。"); throw entry.blocked; });
    const settled = operation.finally(() => { entry.pending--; if (!entry.pending) entry.lastDesired = undefined; });
    entry.tail = settled.catch(() => undefined);
    return settled;
  }
  async function remove(type: WorkspaceEntityType, id: string) {
    const entry = cache(type, id); await entry.tail;
    if (entry.blocked) throw entry.blocked;
    const revision = entry.snapshot?.revision;
    if (revision === undefined) throw new WorkspaceSaveError("REVISION_REQUIRED", "请先载入记录再删除。");
    await read(path(type, id) + `?expectedRevision=${revision}`, { method: "DELETE" });
    records.delete(key(type, id));
  }
  function isClean(type: WorkspaceEntityType, id: string, data: unknown) {
    const entry = cache(type, id);
    return !entry.blocked && !entry.pending && Boolean(entry.snapshot) && workspaceValuesEqual(entry.snapshot?.data, data);
  }
  function confirmed<T>(type: WorkspaceEntityType, id: string) { return cache(type, id).snapshot as WorkspaceSnapshot<T> | undefined; }
  function settle(type: WorkspaceEntityType, id: string) { return cache(type, id).tail; }
  return { list, snapshots, adopt, save, remove, isClean, confirmed, settle };
}
