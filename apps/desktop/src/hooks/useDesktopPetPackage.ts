import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { petPackageBundleSchema, type PetPackageBundle, type PetPackageManifest } from "@petlord/schema";
import type { DesktopPackageContents, InstalledPackageSummary, PackageImportOptions } from "../desktopBridge";

const databaseName = "petlord-desktop";
const storeName = "packages";
const legacyActiveKey = "active";
const activePointerKey = "active-key";
const bundleKeyPrefix = "bundle:";

export function sameNamePackageTarget(name: string, packages: InstalledPackageSummary[]) {
  const normalized = name.trim().toLocaleLowerCase();
  return packages.find((item) => item.name.trim().toLocaleLowerCase() === normalized);
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function inputBytes(contents: DesktopPackageContents) {
  if (typeof contents === "string") return new TextEncoder().encode(contents);
  if (contents instanceof Uint8Array) return new Uint8Array(contents);
  return new Uint8Array(contents);
}

async function decodeBytes(contents: DesktopPackageContents) {
  const encoded = inputBytes(contents);
  if (encoded[0] !== 0x1f || encoded[1] !== 0x8b) return encoded;
  if (typeof DecompressionStream === "undefined") throw new Error("当前运行环境不能解压 V2 宠物包。");
  const stream = new Blob([encoded]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const copy = Uint8Array.from(bytes);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer)));
}

async function dataUrlBytes(dataUrl: string) {
  const separator = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || separator < 0) throw new Error("宠物包包含无效的 Data URL 资产。");
  const metadata = dataUrl.slice(5, separator);
  const payload = dataUrl.slice(separator + 1);
  if (!metadata.toLowerCase().includes(";base64")) return new TextEncoder().encode(decodeURIComponent(payload));
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function verifyIntegrity(bundle: PetPackageBundle) {
  if (bundle.bundleVersion !== 2) return;
  if (!bundle.integrity) throw new Error("V2 宠物包缺少完整性信息。");
  const manifestHash = await sha256(JSON.stringify(bundle.manifest));
  if (manifestHash !== bundle.integrity.manifestSha256) throw new Error("宠物包 manifest 校验失败，文件可能已损坏或被修改。");
  for (const [key, expected] of Object.entries(bundle.integrity.assets)) {
    const dataUrl = bundle.assets[key];
    if (!dataUrl || await sha256(await dataUrlBytes(dataUrl)) !== expected) throw new Error(`宠物包资产 ${key} 校验失败。`);
  }
}

export function parsePetPackage(contents: string) {
  return petPackageBundleSchema.parse(JSON.parse(contents));
}

export async function decodePetPackage(contents: DesktopPackageContents) {
  const bundle = petPackageBundleSchema.parse(JSON.parse(new TextDecoder().decode(await decodeBytes(contents))));
  await verifyIntegrity(bundle);
  return bundle;
}

export function materializePackageManifest(bundle: PetPackageBundle): PetPackageManifest {
  if (bundle.bundleVersion === 1) return bundle.manifest;
  const resolve = (uri: string) => uri.startsWith("asset://") ? bundle.assets[uri.slice("asset://".length)] ?? uri : uri;
  return {
    ...bundle.manifest,
    states: bundle.manifest.states.map((state) => ({ ...state, imageUri: resolve(state.imageUri) })),
    transitions: bundle.manifest.transitions.map((transition) => ({
      ...transition,
      videoUri: resolve(transition.videoUri),
      tailFrameUri: resolve(transition.tailFrameUri),
    })),
    logicalStates: bundle.manifest.logicalStates.map((state) => ({
      ...state,
      pointerGaze: state.pointerGaze?.videoUri ? { ...state.pointerGaze, videoUri: resolve(state.pointerGaze.videoUri) } : state.pointerGaze,
    })),
  };
}

function packageSummary(bundle: PetPackageBundle, key: string, activeKey: string): InstalledPackageSummary {
  return {
    key,
    active: key === activeKey,
    createdAt: bundle.createdAt,
    id: bundle.manifest.id,
    name: bundle.manifest.name,
    characterName: bundle.manifest.characterName,
    stateCount: bundle.manifest.states.length,
    transitionCount: bundle.manifest.transitions.length,
  };
}

async function listBrowserPackages() {
  const database = await openDatabase();
  try {
    const store = database.transaction(storeName, "readonly").objectStore(storeName);
    const [keys, values, activeKey] = await Promise.all([
      requestResult(store.getAllKeys()),
      requestResult(store.getAll()),
      requestResult(store.get(activePointerKey)),
    ]);
    const summaries = await Promise.all(keys.map(async (key, index) => {
      if (typeof key !== "string" || !key.startsWith(bundleKeyPrefix)) return null;
      try {
        const contents = values[index] as DesktopPackageContents;
        return packageSummary(await decodePetPackage(contents), key, typeof activeKey === "string" ? activeKey : "");
      } catch {
        return null;
      }
    }));
    return summaries.filter((summary): summary is InstalledPackageSummary => Boolean(summary))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } finally {
    database.close();
  }
}

async function saveBrowserPackage(contents: DesktopPackageContents, bundle: PetPackageBundle, options?: PackageImportOptions) {
  const existing = await listBrowserPackages();
  const sameName = options?.mode === "new" ? undefined : sameNamePackageTarget(bundle.manifest.name, existing);
  const key = options?.targetKey ?? sameName?.key ?? `${bundleKeyPrefix}${bundle.createdAt}:${bundle.manifest.id}`;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    await Promise.all([
      requestResult(store.put(contents, key)),
      requestResult(store.put(key, activePointerKey)),
    ]);
  } finally {
    database.close();
  }
  const packages = await listBrowserPackages();
  for (const old of packages.slice(10)) await removeBrowserPackage(old.key, false);
  return packageSummary(bundle, key, key);
}

async function migrateLegacyBrowserPackage() {
  const database = await openDatabase();
  let legacy: DesktopPackageContents | null = null;
  try {
    const store = database.transaction(storeName, "readonly").objectStore(storeName);
    const [activeKey, contents] = await Promise.all([
      requestResult(store.get(activePointerKey)),
      requestResult(store.get(legacyActiveKey)),
    ]);
    if (typeof activeKey !== "string" && (typeof contents === "string" || contents instanceof ArrayBuffer || contents instanceof Uint8Array)) legacy = contents;
  } finally {
    database.close();
  }
  if (legacy) await saveBrowserPackage(legacy, await decodePetPackage(legacy));
}

async function readBrowserPackage() {
  await migrateLegacyBrowserPackage();
  let database = await openDatabase();
  let activeKey: unknown;
  try {
    activeKey = await requestResult(database.transaction(storeName, "readonly").objectStore(storeName).get(activePointerKey));
  } finally {
    database.close();
  }
  if (typeof activeKey !== "string") return null;
  database = await openDatabase();
  try {
    const contents = await requestResult(database.transaction(storeName, "readonly").objectStore(storeName).get(activeKey));
    return typeof contents === "string" || contents instanceof ArrayBuffer || contents instanceof Uint8Array ? contents : null;
  } finally {
    database.close();
  }
}

async function activateBrowserPackage(key: string) {
  let database = await openDatabase();
  let contents: unknown;
  try {
    contents = await requestResult(database.transaction(storeName, "readonly").objectStore(storeName).get(key));
  } finally {
    database.close();
  }
  if (!(typeof contents === "string" || contents instanceof ArrayBuffer || contents instanceof Uint8Array)) throw new Error("找不到这个宠物包版本。");
  await decodePetPackage(contents);
  database = await openDatabase();
  try {
    await requestResult(database.transaction(storeName, "readwrite").objectStore(storeName).put(key, activePointerKey));
  } finally {
    database.close();
  }
  return contents;
}

async function removeBrowserPackage(key: string, protectActive = true) {
  let database = await openDatabase();
  let activeKey: unknown;
  try {
    activeKey = await requestResult(database.transaction(storeName, "readonly").objectStore(storeName).get(activePointerKey));
  } finally {
    database.close();
  }
  if (protectActive && key === activeKey) throw new Error("当前正在使用的宠物包不能删除，请先切换到其他版本。");
  database = await openDatabase();
  try {
    await requestResult(database.transaction(storeName, "readwrite").objectStore(storeName).delete(key));
  } finally {
    database.close();
  }
}

export function useDesktopPetPackage() {
  const [bundle, setBundle] = useState<PetPackageBundle>();
  const [installedPackages, setInstalledPackages] = useState<InstalledPackageSummary[]>([]);
  const [managerOpen, setManagerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [pendingImport, setPendingImport] = useState<{ contents: DesktopPackageContents; bundle: PetPackageBundle; suggestedTargetKey?: string }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const manifest = useMemo(() => bundle ? materializePackageManifest(bundle) : undefined, [bundle]);

  async function refreshPackages() {
    const packages = window.petLordDesktop?.listPackages
      ? await window.petLordDesktop.listPackages()
      : await listBrowserPackages();
    setInstalledPackages(packages);
    return packages;
  }

  async function acceptPackage(contents: DesktopPackageContents, persist: boolean, options?: PackageImportOptions) {
    const parsed = await decodePetPackage(contents);
    if (persist) {
      if (window.petLordDesktop?.savePackage) await window.petLordDesktop.savePackage(contents, options);
      else await saveBrowserPackage(contents, parsed, options);
    }
    setBundle(parsed);
    setError(undefined);
    await refreshPackages();
  }

  useEffect(() => {
    let cancelled = false;
    const load = window.petLordDesktop?.loadPackage
      ? window.petLordDesktop.loadPackage()
      : readBrowserPackage();
    void load.then(async (contents) => {
      if (cancelled) return;
      if (contents) await acceptPackage(contents, false);
      else await refreshPackages();
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "宠物包加载失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    const packageChanged = window.petLordDesktop?.onPackageChanged?.((contents) => {
      if (contents) void acceptPackage(contents, false);
      else setBundle(undefined);
    });
    const openImport = window.petLordDesktop?.onOpenPackageImport?.(() => { void choosePackage(); });
    return () => {
      cancelled = true;
      packageChanged?.();
      openImport?.();
    };
  }, []);

  async function choosePackage() {
    try {
      if (window.petLordDesktop?.choosePackage) {
        const contents = await window.petLordDesktop.choosePackage();
        if (contents) await prepareImport(contents);
      } else {
        fileInput.current?.click();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "宠物包导入失败");
    }
  }

  async function prepareImport(contents: DesktopPackageContents) {
    const parsed = await decodePetPackage(contents);
    const packages = await refreshPackages();
    const sameName = sameNamePackageTarget(parsed.manifest.name, packages);
    setPendingImport({ contents, bundle: parsed, suggestedTargetKey: sameName?.key });
    setError(undefined);
  }

  async function confirmImport(options: PackageImportOptions) {
    if (!pendingImport) return;
    setLoading(true);
    try {
      await acceptPackage(pendingImport.contents, true, options);
      setPendingImport(undefined);
      await window.petLordDesktop?.showPet();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "宠物包导入失败");
    } finally {
      setLoading(false);
    }
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await prepareImport(await file.arrayBuffer());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "宠物包格式无效");
    }
  }

  async function activateInstalledPackage(key: string) {
    setLoading(true);
    try {
      const contents = window.petLordDesktop?.activatePackage
        ? await window.petLordDesktop.activatePackage(key)
        : await activateBrowserPackage(key);
      await acceptPackage(contents, false);
      setManagerOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "宠物包切换失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeInstalledPackage(key: string) {
    try {
      if (window.petLordDesktop?.removePackage) await window.petLordDesktop.removePackage(key);
      else await removeBrowserPackage(key);
      await refreshPackages();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "宠物包删除失败");
    }
  }

  return {
    bundle,
    manifest,
    installedPackages,
    managerOpen,
    setManagerOpen,
    loading,
    error,
    pendingImport,
    setPendingImport,
    fileInput,
    choosePackage,
    confirmImport,
    onFileSelected,
    activateInstalledPackage,
    removeInstalledPackage,
  };
}
