import { useEffect, useSyncExternalStore } from "react";
import type { CharacterProject, NativePixelDocument, TransitionPlayback } from "@petlord/schema";

export interface PixelSourceDraft { document: NativePixelDocument; baseline: string | undefined }
export interface PixelTimelineDraft { frames: { frameId: string; durationMs: number }[]; repeat: TransitionPlayback; baseline: string }
const drafts = new Map<string, Map<string, PixelSourceDraft | PixelTimelineDraft>>();
const listeners = new Set<() => void>();
const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
function notify() {
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", warn);
    if (drafts.size) window.addEventListener("beforeunload", warn);
  }
  listeners.forEach(listener => listener());
}
function save(projectId: string, key: string, value?: PixelSourceDraft | PixelTimelineDraft) {
  const entries = drafts.get(projectId) ?? new Map();
  if (JSON.stringify(entries.get(key)) === JSON.stringify(value)) return;
  if (value) entries.set(key, value); else entries.delete(key);
  if (entries.size) drafts.set(projectId, entries); else drafts.delete(projectId);
  notify();
}
export const readPixelSourceDraft = (projectId: string) => drafts.get(projectId)?.get("canvas") as PixelSourceDraft | undefined;
export const savePixelSourceDraft = (projectId: string, value?: PixelSourceDraft) => save(projectId, "canvas", value);
export const readPixelTimelineDraft = (projectId: string, transitionId: string) => drafts.get(projectId)?.get(`animation:${transitionId}`) as PixelTimelineDraft | undefined;
export const savePixelTimelineDraft = (projectId: string, transitionId: string, value?: PixelTimelineDraft) => save(projectId, `animation:${transitionId}`, value);
export const hasDrawingDraft = (projectId: string) => Boolean(drafts.get(projectId)?.size);
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useDrawingDraftStatus(project: CharacterProject) {
  useEffect(() => {
    const entries = drafts.get(project.id);
    if (!entries) return;
    for (const key of entries.keys()) if (key.startsWith("animation:") && !project.transitions.some(transition => key === `animation:${transition.id}`)) save(project.id, key);
  }, [project.id, project.transitions]);
  return useSyncExternalStore(subscribe, () => hasDrawingDraft(project.id), () => false);
}
