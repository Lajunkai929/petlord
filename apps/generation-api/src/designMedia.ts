import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { DesignError } from "@petlord/design-core";
import { buildPortablePetBundleV2, encodePortablePetBundle } from "@petlord/design-core/portablePetPackage";
import { buildPetPackage } from "@petlord/state-engine";
import { collectRuntimeMediaUris, type CharacterProject } from "@petlord/schema";
import type { PublishedPackageLibrary } from "./publishedPackageLibrary";

const mimeTypes: Record<string,string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm" };
export function createDesignMedia(mediaDirectory: string, studioDirectory: string, library: PublishedPackageLibrary, signal?: AbortSignal) {
  async function dataUrl(uri: string): Promise<string> {
    if (/^data:(?:image\/(?:png|jpeg|webp)|video\/(?:mp4|webm));base64,/.test(uri)) return uri;
    if (uri.startsWith("https://")) {
      const response = await fetch(uri, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000) });
      if (!response.ok) throw new DesignError("MISSING_MEDIA", `Unable to read remote media (${response.status}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > 160 * 1024 * 1024) throw new DesignError("INVALID_INPUT", "Media exceeds 160 MB.");
      const mime = response.headers.get("Content-Type")?.split(";")[0];
      if (!Object.values(mimeTypes).includes(mime ?? "")) throw new DesignError("INVALID_INPUT", "Remote media has an unsupported MIME type.");
      return `data:${mime};base64,${bytes.toString("base64")}`;
    }
    let filename: string;
    if (/^\/api\/media\/[A-Za-z0-9-]+\.(png|jpg|jpeg|webp|mp4|webm)$/.test(uri)) filename = resolve(mediaDirectory, uri.slice("/api/media/".length));
    else if (uri.startsWith("/demo/")) {
      const root = resolve(studioDirectory);
      filename = resolve(root, `.${uri}`);
      if (!filename.startsWith(root + sep)) throw new DesignError("INVALID_INPUT", "Media path leaves the Studio directory.");
    } else throw new DesignError("INVALID_INPUT", "Media must be an imported local asset, bundled demo or HTTPS URL.");
    if ((await stat(filename)).size > 160 * 1024 * 1024) throw new DesignError("INVALID_INPUT", "Media exceeds 160 MB.");
    const mime = mimeTypes[extname(filename).toLowerCase()];
    if (!mime) throw new DesignError("INVALID_INPUT", "Unsupported media format.");
    return `data:${mime};base64,${(await readFile(filename)).toString("base64")}`;
  }
  async function exportPackage(project: CharacterProject) {
    const pending = project.transitions.filter(t => t.status !== "approved");
    if (pending.length) throw new DesignError("NOT_READY", "Approve or remove all pending transitions before exporting.", { pendingTransitionIds: pending.map(t => t.id) });
    const manifest = buildPetPackage(project);
    const uris = [...new Set([...collectRuntimeMediaUris(manifest), ...project.artifacts.map(artifact => artifact.uri)])];
    const media = new Map<string,string>();
    for (const uri of uris) if (uri) media.set(uri, await dataUrl(uri));
    return library.publish(await encodePortablePetBundle(await buildPortablePetBundleV2(manifest, media, undefined, project)));
  }
  return { resolveImage: async (uri: string) => uri.startsWith("https://") ? uri : dataUrl(uri), dataUrl, exportPackage };
}
