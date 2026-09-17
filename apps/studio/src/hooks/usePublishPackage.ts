import { useCallback, useEffect, useMemo, useState } from "react";
import type { CharacterProject, CustomerOrder } from "@petlord/schema";
import { buildPetPackage } from "@petlord/state-engine";
import { createPortablePetBundle, encodePortablePetBundle } from "../lib/portablePetPackage";
import { applyProjectToDevice, publishEncodedPackageToLibrary, readLocalInstallation, type LocalInstallationStatus } from "./publishPackageTransport";
import type { WorkspaceSnapshot } from "../workspaceClient";

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

export function usePublishPackage(project: CharacterProject, options: {
  exportProject?: CharacterProject;
  persistProject?: () => Promise<WorkspaceSnapshot<CharacterProject>>;
  onUpdateOrder?: (order: Partial<CustomerOrder>) => void;
} = {}) {
  const exportProject = options.exportProject ?? project;
  const { persistProject, onUpdateOrder } = options;
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ completed: 0, total: 0 });
  const [exportError, setExportError] = useState<string>();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string>();
  const [published, setPublished] = useState<{ name: string }>();
  const [applied, setApplied] = useState<{ name: string }>();
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const [installation, setInstallation] = useState<LocalInstallationStatus>();
  const [installationLoading, setInstallationLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string>();
  const embedded = typeof window !== "undefined" && Boolean(window.petLordStudio);
  const { manifest, error } = useMemo(() => resolvePackage(exportProject), [exportProject]);
  const pendingCount = useMemo(
    () => exportProject.transitions.filter((transition) => transition.status !== "approved").length,
    [exportProject.transitions],
  );
  const readinessError = pendingCount > 0 ? `${pendingCount} 条过渡尚未批准，不能导出最终宠物包。` : null;
  const canExport = Boolean(manifest && !error && !readinessError);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  useEffect(() => {
    if (!embedded) {
      setInstallation(undefined);
      setInstallationLoading(false);
      return;
    }
    let cancelled = false;
    setApplied(undefined);
    setInstallation(undefined);
    setInstallationLoading(true);
    void (persistProject ? persistProject().then(() => readLocalInstallation(project.id)) : readLocalInstallation(project.id))
      .then(value => { if (!cancelled) { setInstallation(value); setApplyError(undefined); } })
      .catch(caught => { if (!cancelled) setApplyError(caught instanceof Error ? caught.message : "无法读取本机宠物状态。"); })
      .finally(() => { if (!cancelled) setInstallationLoading(false); });
    return () => { cancelled = true; };
  }, [embedded, project.id, project.updatedAt]);

  const buildEncodedPackage = useCallback(async () => {
    if (!manifest) throw new Error("宠物包尚未准备完成。");
    setExportProgress({ completed: 0, total: 0 });
    const bundle = await createPortablePetBundle(manifest, (completed, total) => setExportProgress({ completed, total }), exportProject);
    return encodePortablePetBundle(bundle);
  }, [exportProject, manifest]);

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
      const result = await publishEncodedPackageToLibrary(encoded);
      const publishedName = result.value && typeof result.value === "object" && "name" in result.value && typeof result.value.name === "string"
        ? result.value.name
        : manifest.name;
      setPublished({ name: publishedName });
      onUpdateOrder?.({
        deliveryChecklist: { ...project.order.deliveryChecklist, packageExportedAt: new Date().toISOString() },
      });
    } catch (caught) {
      setPublishError(caught instanceof Error ? caught.message : "发布到客户端订阅失败");
    } finally {
      setPublishing(false);
    }
  }, [buildEncodedPackage, canExport, manifest, onUpdateOrder, project.order.deliveryChecklist, publishing]);

  const applyToDevice = useCallback(async () => {
    if (!embedded || !persistProject || applying || !canExport) return;
    setApplying(true);
    setApplyError(undefined);
    try {
      const result = await applyProjectToDevice(project.id, persistProject);
      setInstallation(result.binding);
      setApplied({ name: manifest?.name ?? project.name });
      await window.petLordStudio?.showPet();
    } catch (caught) {
      setApplyError(caught instanceof Error ? caught.message : "本机宠物更新失败。");
    } finally {
      setApplying(false);
    }
  }, [applying, canExport, embedded, manifest?.name, persistProject, project.id, project.name]);

  return {
    manifest,
    error: error ?? readinessError,
    canExport,
    pendingCount,
    embedded,
    installation,
    installationLoading,
    applyToDevice,
    applying,
    applyError,
    applied,
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
