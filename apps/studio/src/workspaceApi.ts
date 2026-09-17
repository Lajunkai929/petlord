import { createWorkspaceClient, type WorkspaceEntityType } from "./workspaceClient";
export type { WorkspaceEntityType, WorkspaceSnapshot } from "./workspaceClient";
export { WorkspaceSaveError } from "./workspaceClient";
export const workspaceClient = createWorkspaceClient();

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  let payload: T & { error?: { message?: string } };
  try {
    payload = JSON.parse(text) as T & { error?: { message?: string } };
  } catch {
    throw new Error(`${fallback}：本地持久化服务返回了无效响应。`);
  }
  if (!response.ok) throw new Error(payload.error?.message ?? fallback);
  return payload;
}

export function listWorkspaceEntities<T>(type: WorkspaceEntityType): Promise<T[]> {
  return workspaceClient.list<T>(type);
}

export function saveWorkspaceEntity<T>(type: WorkspaceEntityType, id: string, data: T) {
  return workspaceClient.save(type, id, data);
}

export function deleteWorkspaceEntity(type: WorkspaceEntityType, id: string): Promise<void> {
  return workspaceClient.remove(type, id);
}

export async function readWorkspaceState<T>(key: string): Promise<T | undefined> {
  const response = await fetch(`/api/workspace/state/${encodeURIComponent(key)}`);
  const payload = await readResponse<{ data: T | null }>(response, "读取工作区状态失败");
  return payload.data ?? undefined;
}

export async function saveWorkspaceState(key: string, data: unknown): Promise<void> {
  const response = await fetch(`/api/workspace/state/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  await readResponse(response, "保存工作区状态失败");
}

export async function deleteWorkspaceState(key: string): Promise<void> {
  const response = await fetch(`/api/workspace/state/${encodeURIComponent(key)}`, { method: "DELETE" });
  await readResponse(response, "删除工作区状态失败");
}
