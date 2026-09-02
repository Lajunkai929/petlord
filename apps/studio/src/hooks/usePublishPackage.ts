import { useCallback, useEffect, useMemo, useState } from "react";
import type { CharacterProject, CustomerOrder } from "@petlord/schema";
import { buildPetPackage } from "@petlord/state-engine";
import { createPortablePetBundle, encodePortablePetBundle } from "../lib/portablePetPackage";

function resolvePackage(project: CharacterProject) {
  try {
    return { manifest: buildPetPackage(project), error: null };
  } catch (caught) {
    return {
      manifest: null,
      error: caught instanceof Error ? caught.message : "宠物包构建失败",
    };
  }
}

export function usePublishPackage(project: CharacterProject, onUpdateOrder?: (order: Partial<CustomerOrder>) => void) {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ completed: 0, total: 0 });
  const [exportError, setExportError] = useState<string>();
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const { manifest, error } = useMemo(() => resolvePackage(project), [project]);
  const pendingCount = useMemo(
    () => project.transitions.filter((transition) => transition.status !== "approved").length,
    [project.transitions],
  );
  const readinessError = pendingCount > 0 ? `${pendingCount} 条过渡尚未批准，不能导出最终宠物包。` : null;
  const canExport = Boolean(manifest && !error && !readinessError);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  const downloadPackage = useCallback(async () => {
    if (!manifest || exporting || !canExport) return;
    setExporting(true);
    setExportError(undefined);
    setExportProgress({ completed: 0, total: 0 });
    try {
      const bundle = await createPortablePetBundle(manifest, (completed, total) => setExportProgress({ completed, total }));
      const encoded = await encodePortablePetBundle(bundle);
      const blob = new Blob([encoded], { type: "application/vnd.petlord.package+gzip" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.characterName.toLowerCase()}-desktop-pet.petlord`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      onUpdateOrder?.({
        deliveryChecklist: { ...project.order.deliveryChecklist, packageExportedAt: new Date().toISOString() },
      });
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "宠物包导出失败");
    } finally {
      setExporting(false);
    }
  }, [canExport, exporting, manifest, onUpdateOrder, project.characterName, project.order.deliveryChecklist]);

  return {
    manifest,
    error: error ?? readinessError,
    canExport,
    pendingCount,
    downloadPackage,
    exporting,
    exportProgress,
    exportError,
    downloadUrl,
    downloadFilename: `${project.characterName.toLowerCase()}-desktop-pet.petlord`,
  };
}
