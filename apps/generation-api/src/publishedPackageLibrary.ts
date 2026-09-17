import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { petPackageBundleSchema, publishedPackageSummarySchema, type PetPackageBundle, type PublishedPackageSummary } from "@petlord/schema";

const maximumPackageBytes = 224 * 1024 * 1024;

function sha256(contents: Uint8Array | string) {
  return createHash("sha256").update(contents).digest("hex");
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Published package contains an invalid data URL.");
  return match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
}

export function decodeAndVerifyPublishedPackage(contents: Uint8Array): PetPackageBundle {
  if (contents.byteLength === 0 || contents.byteLength > maximumPackageBytes) {
    throw new Error("Published package must be between 1 byte and 224 MB.");
  }
  const input = Buffer.from(contents);
  const decoded = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input, {maxOutputLength:512*1024*1024}) : input;
  const raw = JSON.parse(decoded.toString("utf8"));
  const bundle = petPackageBundleSchema.parse(raw);
  if (bundle.bundleVersion === 2) {
    if (!bundle.integrity || sha256(JSON.stringify(raw.manifest)) !== bundle.integrity.manifestSha256) {
      throw new Error("Published package manifest failed its integrity check.");
    }
    if (raw.sourceProject !== undefined && sha256(JSON.stringify(raw.sourceProject)) !== bundle.integrity.sourceProjectSha256) {
      throw new Error("Published package source project failed its integrity check.");
    }
    for (const [key, expectedHash] of Object.entries(bundle.integrity.assets)) {
      const dataUrl = bundle.assets[key];
      if (!dataUrl || sha256(decodeDataUrl(dataUrl)) !== expectedHash) {
        throw new Error(`Published package asset ${key} failed its integrity check.`);
      }
    }
  }
  return bundle;
}

function summary(bundle: PetPackageBundle, publicationId: string, sizeBytes: number, publishedAt: string): PublishedPackageSummary {
  return publishedPackageSummarySchema.parse({
    publicationId,
    packageId: bundle.manifest.id,
    name: bundle.manifest.name,
    characterName: bundle.manifest.characterName,
    createdAt: bundle.createdAt,
    publishedAt,
    stateCount: bundle.manifest.states.length,
    transitionCount: bundle.manifest.transitions.length,
    sizeBytes,
    downloadPath: `/api/library/packages/${publicationId}/download`,
  });
}

export class PublishedPackageLibrary {
  constructor(private readonly directory: string) {}

  private path(publicationId: string) {
    if (!/^[a-f0-9]{64}$/.test(publicationId)) throw new Error("Invalid publication id.");
    return join(this.directory, `${publicationId}.petlord`);
  }

  private metadataPath(publicationId: string) {
    return join(this.directory, `${publicationId}.json`);
  }

  private async writeAtomic(target: string, contents: Uint8Array | string) {
    const temporary = join(this.directory, `.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, contents, { flag: "wx" });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async publish(contents: Uint8Array) {
    const bundle = decodeAndVerifyPublishedPackage(contents);
    const encoded = Buffer.from(contents);
    const publicationId = sha256(encoded);
    await mkdir(this.directory, { recursive: true });
    const target = this.path(publicationId);
    const existing = await stat(target).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
    if (!existing) {
      await this.writeAtomic(target, encoded);
    }
    const metadata = await stat(target);
    const published = summary(bundle, publicationId, metadata.size, metadata.mtime.toISOString());
    await this.writeAtomic(this.metadataPath(publicationId), `${JSON.stringify(published, null, 2)}\n`);
    return published;
  }

  async list() {
    await mkdir(this.directory, { recursive: true });
    const entries = await readdir(this.directory, { withFileTypes: true });
    const packages = await Promise.all(entries
      .filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name))
      .map(async (entry) => {
        try {
          const publicationId = entry.name.slice(0, -".json".length);
          const [stored, packageMetadata] = await Promise.all([
            readFile(join(this.directory, entry.name), "utf8"),
            stat(this.path(publicationId)),
          ]);
          const item = publishedPackageSummarySchema.parse(JSON.parse(stored));
          return item.publicationId === publicationId && item.sizeBytes === packageMetadata.size ? item : null;
        } catch {
          return null;
        }
      }));
    return packages.filter((item): item is PublishedPackageSummary => Boolean(item))
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }

  async read(publicationId: string) {
    const contents = await readFile(this.path(publicationId));
    decodeAndVerifyPublishedPackage(contents);
    return contents;
  }
}
