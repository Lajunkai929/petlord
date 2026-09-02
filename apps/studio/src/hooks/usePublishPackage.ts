import { useCallback, useEffect, useMemo, useState } from "react";
import type { CharacterProject, CustomerOrder, PublishedPackageSummary } from "@petlord/schema";
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
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string>();
  const [published, setPublished] = useState<PublishedPackageSummary>();
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

  const buildEncodedPackage = useCallback(async () => {
    if (!manifest) throw new Error("宠物包尚未准备完成。");
    setExportProgress({ completed: 0, total: 0 });
    const bundle = await createPortablePetBundle(manifest, (completed, total) => setExportProgress({ completed, total }));
    return encodePortablePetBundle(bundle);
  }, [manifest]);

  const downloadPackage = useCallback(async () => {
    if (!manifest || exporting || !canExport) return;
    setExporting(true);
    setExportError(undefined);
    setExportProgress({ completed: 0, total: 0 });
    try {
      const encoded = await buildEncodedPackage();
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
  }, [buildEncodedPackage, canExport, exporting, manifest, onUpdateOrder, project.characterName, project.order.deliveryChecklist]);

  const publishToLibrary = useCallback(async () => {
    if (!manifest || publishing || !canExport) return;
    setPublishing(true);
    setPublishError(undefined);
    try {
      const encoded = await buildEncodedPackage();
      const response = await fetch("/api/library/packages", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.petlord.package+gzip" },
        body: Uint8Array.from(encoded),
      });
      const payload = await response.json() as PublishedPackageSummary & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "发布到客户端订阅失败。");
      setPublished(payload);
      onUpdateOrder?.({
        deliveryChecklist: { ...project.order.deliveryChecklist, packageExportedAt: new Date().toISOString() },
      });
    } catch (caught) {
      setPublishError(caught instanceof Error ? caught.message : "发布到客户端订阅失败");
    } finally {
      setPublishing(false);
    }
  }, [buildEncodedPackage, canExport, manifest, onUpdateOrder, project.order.deliveryChecklist, publishing]);

  return {
    manifest,
    error: error ?? readinessError,
    canExport,
    pendingCount,
    downloadPackage,
    publishToLibrary,
    exporting,
    publishing,
    exportProgress,
    exportError,
    publishError,
    published,
    downloadUrl,
    downloadFilename: `${project.characterName.toLowerCase()}-desktop-pet.petlord`,
  };
}
