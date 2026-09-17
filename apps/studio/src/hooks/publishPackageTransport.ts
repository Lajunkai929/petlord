export interface PetLordStudioBridge {
  installPackage(contents: Uint8Array): Promise<unknown>;
  showRuntimeSettings(): Promise<void>;
  showPet(): Promise<void>;
  getTheme?(): Promise<"light" | "dark">;
  setTheme?(theme: "light" | "dark"): Promise<"light" | "dark">;
  onThemeChanged?(listener: (theme: "light" | "dark") => void): () => void;
  onOpenProject?(listener: (projectId: string) => void): () => void;
}

type PublishResult =
  | { kind: "desktop-install"; value: unknown }
  | { kind: "library-publish"; value: unknown };

export interface LocalInstallationStatus {
  available: boolean;
  linked: boolean;
  packageKey?: string;
  appliedRevision?: number;
  currentRevision: number;
  hasDraftChanges: boolean;
  exists: boolean;
  active: boolean;
}

async function executePackageCommand<T>(
  command: "package.installation.get" | "package.install",
  projectId: string,
  expectedRevision: number | undefined,
  fetchImplementation: typeof fetch,
): Promise<T> {
  const response = await fetchImplementation("/api/design/v1/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      command,
      projectId,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
      input: {},
    }),
  });
  const payload = await response.json() as { result?: T; error?: { message?: string } };
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message ?? "本机宠物更新失败。");
  }
  return payload.result;
}

export function readLocalInstallation(
  projectId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<LocalInstallationStatus> {
  return executePackageCommand("package.installation.get", projectId, undefined, fetchImplementation);
}

export async function applyProjectToDevice<T extends { id: string }>(
  projectId: string,
  persistProject: () => Promise<{ data: T; revision: number }>,
  fetchImplementation: typeof fetch = fetch,
): Promise<{ binding: LocalInstallationStatus; [key: string]: unknown }> {
  const saved = await persistProject();
  if (saved.data.id !== projectId) throw new Error("当前项目已经切换，请重新确认要使用的宠物。");
  return executePackageCommand("package.install", projectId, saved.revision, fetchImplementation);
}

export async function publishEncodedPackage(
  encoded: Uint8Array,
  bridge: PetLordStudioBridge | undefined = typeof window === "undefined" ? undefined : window.petLordStudio,
  fetchImplementation: typeof fetch = fetch,
): Promise<PublishResult> {
  if (bridge) {
    const value = await bridge.installPackage(encoded);
    await bridge.showPet();
    return { kind: "desktop-install", value };
  }

  return publishEncodedPackageToLibrary(encoded, fetchImplementation);
}

export async function publishEncodedPackageToLibrary(
  encoded: Uint8Array,
  fetchImplementation: typeof fetch = fetch,
): Promise<PublishResult> {
  const response = await fetchImplementation("/api/library/packages", {
    method: "POST",
    headers: { "Content-Type": "application/vnd.petlord.package+gzip" },
    body: Uint8Array.from(encoded),
  });
  const payload = await response.json() as { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "发布到客户端订阅失败。");
  return { kind: "library-publish", value: payload };
}

declare global {
  interface Window {
    petLordStudio?: PetLordStudioBridge;
  }
}
