import { useCallback, useEffect, useState } from "react";

interface SyncResult { imported: { projectId: string }[]; skipped: number; errors: { key: string; message: string }[] }
export function useInstalledPackageSync() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const sync = useCallback(async () => {
    setBusy(true); setErrors([]); setMessage("");
    try {
      const response = await fetch("/api/design/v1/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), command: "package.syncInstalled", input: {} }) });
      const body = await response.json() as { result?: SyncResult; error?: { message?: string } };
      if (!response.ok || !body.result) throw new Error(body.error?.message ?? "已安装宠物同步失败。");
      setErrors(body.result.errors.map(item => `${item.key}：${item.message}`));
      setMessage(body.result.imported.length ? `已恢复 ${body.result.imported.length} 个项目。` : "已与本机安装的宠物同步。");
      window.dispatchEvent(new Event("petlord:workspace-changed"));
    } catch (caught) { setErrors([caught instanceof Error ? caught.message : "同步失败，请重试。"]); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void sync(); }, [sync]);
  return { busy, message, errors, sync };
}
