import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { workspaceClient, saveWorkspaceEntity } from "../workspaceApi";
import { mergeWorkspaceChanges, workspaceValuesEqual } from "../workspaceMerge";

/** Rebase save acknowledgements and apply clean external edits for shared libraries. */
export function useSyncedLibrary<T extends { id: string }>(type: "style" | "template", records: T[], setRecords: Dispatch<SetStateAction<T[]>>, hydrated: boolean, inform: (message: string, kind?: "error") => void) {
  const current = useRef(records); current.current = records;
  const notify = useRef(inform); notify.current = inform;
  const lastError = useRef("");
  function report(error: unknown) {
    const message = error instanceof Error ? error.message : "共享资料库保存失败。";
    if (lastError.current !== message) { lastError.current = message; notify.current(message + " 请保留本地内容，重新载入后再编辑。", "error"); }
  }
  useEffect(() => {
    if (!hydrated) return;
    for (const record of records) void saveWorkspaceEntity(type, record.id, record).then(saved => {
      setRecords(latest => {
        const item = latest.find(candidate => candidate.id === record.id);
        if (!item) return latest;
        const merged = mergeWorkspaceChanges(record, item, saved.data);
        if (merged.conflicts.length || workspaceValuesEqual(item, merged.value)) return latest;
        return latest.map(candidate => candidate.id === record.id ? merged.value : candidate);
      });
    }).catch(report);
  }, [type, records, hydrated, setRecords]);
  useEffect(() => {
    if (!hydrated) return;
    let stopped = false, pending = false;
    const refresh = async () => {
      if (stopped || pending || document.hidden) return;
      pending = true;
      try {
        const snapshots = await workspaceClient.snapshots<T>(type);
        if (stopped) return;
        const remoteIds = new Set(snapshots.map(snapshot => snapshot.data.id));
        const next = current.current.filter(item => remoteIds.has(item.id) || !workspaceClient.isClean(type, item.id, item));
        for (const snapshot of snapshots) {
          const index = next.findIndex(item => item.id === snapshot.data.id), local = next[index];
          if (local && !workspaceClient.isClean(type, local.id, local)) continue;
          workspaceClient.adopt(type, snapshot);
          if (index < 0) next.push(snapshot.data); else next[index] = snapshot.data;
        }
        if (!workspaceValuesEqual(current.current, next)) setRecords(next);
      } catch (error) { if (!stopped) report(error); }
      finally { pending = false; }
    };
    const refreshNow = () => { void refresh(); };
    const interval = setInterval(refreshNow, 2000);
    window.addEventListener("focus", refreshNow);
    window.addEventListener("petlord:workspace-changed", refreshNow);
    return () => { stopped = true; clearInterval(interval); window.removeEventListener("focus", refreshNow); window.removeEventListener("petlord:workspace-changed", refreshNow); };
  }, [type, hydrated, setRecords]);
}
