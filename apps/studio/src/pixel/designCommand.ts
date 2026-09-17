import { characterProjectSchema, type CharacterProject } from "@petlord/schema";
import { mergeWorkspaceChanges } from "../workspaceMerge";
import type { WorkspaceSnapshot } from "../workspaceClient";
export interface StudioDesignResult {
  project: CharacterProject;
  revision: number;
  value?: unknown;
}
export type RunDesignCommand = (
  command: string,
  input: unknown,
) => Promise<StudioDesignResult>;
export async function executeStudioDesignCommand(
  command: string,
  input: unknown,
  adapter: {
    persist: () => Promise<WorkspaceSnapshot<CharacterProject>>;
    current: () => CharacterProject;
    adopt: (snapshot: WorkspaceSnapshot<CharacterProject>) => void;
    commit: (project: CharacterProject) => void;
    request?: (url: string, init?: RequestInit) => Promise<Response>;
  },
): Promise<StudioDesignResult> {
  const before = adapter.current();
  const saved = await adapter.persist();
  if (
    [
      "pixel.document.set",
      "pixel.document.save",
      "pixel.frame.upsert",
      "pixel.frame.delete",
      "pixel.palette.update",
      "pixel.state.bind",
      "pixel.animation.bind",
    ].includes(command) &&
    JSON.stringify(before.pixelDocument) !==
      JSON.stringify(saved.data.pixelDocument)
  )
    throw new Error(
      "像素草稿与刚载入的外部文档冲突，请保留草稿并载入最新画布。",
    );
  if (command === "pixel.animation.bind") {
    const transitionId = (input as {transitionId: string}).transitionId;
    const original = before.transitions.find(item => item.id === transitionId);
    const latest = saved.data.transitions.find(item => item.id === transitionId);
    if (JSON.stringify([original?.nativeAnimation, original?.playback]) !== JSON.stringify([latest?.nativeAnimation, latest?.playback])) throw new Error("动画或循环设置与刚载入的外部更新冲突，请保留草稿并载入最新时间线。");
  }
  const response = await (adapter.request ?? fetch)("/api/design/v1/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      command,
      projectId: saved.data.id,
      expectedRevision: saved.revision,
      input,
    }),
  });
  const body = (await response.json()) as {
    result?: StudioDesignResult;
    error?: { message?: string };
  };
  if (!response.ok || body.error || !body.result)
    throw new Error(body.error?.message ?? "原生设计命令失败。");
  const result = {
    ...body.result,
    project: characterProjectSchema.parse(body.result.project),
  };
  const current = adapter.current();
  if (current.id === saved.data.id) {
    const merged = mergeWorkspaceChanges(saved.data, current, result.project);
    if (merged.conflicts.length)
      throw new Error(
        "命令结果与本地改动冲突。改动已保留，请载入最新版本或另存为副本。",
      );
    adapter.adopt({ data: result.project, revision: result.revision });
    adapter.commit(merged.value);
  } else adapter.adopt({ data: result.project, revision: result.revision });
  return result;
}
