import { petPackageBundleSchema, type PetPackageBundle, type PetPackageManifest } from "@petlord/schema";

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取媒体文件"));
    reader.readAsDataURL(blob);
  });
}

export async function materializeMediaUri(uri: string) {
  if (uri.startsWith("data:")) return uri;
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`无法打包媒体 ${uri}（${response.status}）`);
  return blobToDataUrl(await response.blob());
}

export async function createPortablePetBundle(
  manifest: PetPackageManifest,
  onProgress?: (completed: number, total: number) => void,
): Promise<PetPackageBundle> {
  const uris = [...new Set([
    ...manifest.states.map((state) => state.imageUri),
    ...manifest.transitions.flatMap((transition) => [transition.videoUri, transition.tailFrameUri]),
    ...manifest.logicalStates.flatMap((state) => state.pointerGaze?.videoUri ? [state.pointerGaze.videoUri] : []),
  ])];
  const materialized = new Map<string, string>();
  for (let index = 0; index < uris.length; index += 1) {
    const uri = uris[index];
    if (uri) materialized.set(uri, await materializeMediaUri(uri));
    onProgress?.(index + 1, uris.length);
  }
  return buildPortablePetBundleV2(manifest, materialized);
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
  if (!dataUrl.startsWith("data:") || separator < 0) throw new Error("媒体资产不是有效的 Data URL。");
  const metadata = dataUrl.slice(5, separator);
  const payload = dataUrl.slice(separator + 1);
  if (!metadata.toLowerCase().includes(";base64")) return new TextEncoder().encode(decodeURIComponent(payload));
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function assetExtension(dataUrl: string) {
  const mimeType = /^data:([^;,]+)/.exec(dataUrl)?.[1];
  return ({
    "image/png": "png",
    "image/webp": "webp",
    "image/jpeg": "jpg",
    "video/mp4": "mp4",
    "video/webm": "webm",
  } as Record<string, string>)[mimeType ?? ""] ?? "bin";
}

export async function buildPortablePetBundleV2(
  manifest: PetPackageManifest,
  materialized: ReadonlyMap<string, string>,
  createdAt = new Date().toISOString(),
): Promise<PetPackageBundle> {
  const assets: Record<string, string> = {};
  const assetHashes: Record<string, string> = {};
  const assetUris = new Map<string, string>();
  for (const [sourceUri, dataUrl] of materialized) {
    const hash = await sha256(await dataUrlBytes(dataUrl));
    const key = `${hash}.${assetExtension(dataUrl)}`;
    assets[key] = dataUrl;
    assetHashes[key] = hash;
    assetUris.set(sourceUri, `asset://${key}`);
  }
  const portableManifest: PetPackageManifest = {
    ...manifest,
    states: manifest.states.map((state) => ({ ...state, imageUri: assetUris.get(state.imageUri) ?? state.imageUri })),
    transitions: manifest.transitions.map((transition) => ({
      ...transition,
      videoUri: assetUris.get(transition.videoUri) ?? transition.videoUri,
      tailFrameUri: assetUris.get(transition.tailFrameUri) ?? transition.tailFrameUri,
    })),
    logicalStates: manifest.logicalStates.map((state) => ({
      ...state,
      pointerGaze: state.pointerGaze?.videoUri ? {
        ...state.pointerGaze,
        videoUri: assetUris.get(state.pointerGaze.videoUri) ?? state.pointerGaze.videoUri,
      } : state.pointerGaze,
    })),
  };
  return petPackageBundleSchema.parse({
    format: "petlord-package",
    bundleVersion: 2,
    createdAt,
    manifest: portableManifest,
    assets,
    integrity: {
      algorithm: "SHA-256",
      manifestSha256: await sha256(JSON.stringify(portableManifest)),
      assets: assetHashes,
    },
  });
}

export async function encodePortablePetBundle(bundle: PetPackageBundle) {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  if (typeof CompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function buildPortablePetBundle(
  manifest: PetPackageManifest,
  materialized: ReadonlyMap<string, string>,
  createdAt = new Date().toISOString(),
): PetPackageBundle {
  const portableManifest: PetPackageManifest = {
    ...manifest,
    states: manifest.states.map((state) => ({ ...state, imageUri: materialized.get(state.imageUri) ?? state.imageUri })),
    transitions: manifest.transitions.map((transition) => ({
      ...transition,
      videoUri: materialized.get(transition.videoUri) ?? transition.videoUri,
      tailFrameUri: materialized.get(transition.tailFrameUri) ?? transition.tailFrameUri,
    })),
    logicalStates: manifest.logicalStates.map((state) => ({
      ...state,
      pointerGaze: state.pointerGaze?.videoUri ? {
        ...state.pointerGaze,
        videoUri: materialized.get(state.pointerGaze.videoUri) ?? state.pointerGaze.videoUri,
      } : state.pointerGaze,
    })),
  };
  return petPackageBundleSchema.parse({
    format: "petlord-package",
    bundleVersion: 1,
    createdAt,
    manifest: portableManifest,
    assets: {},
  });
}
