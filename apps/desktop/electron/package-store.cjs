const path = require("node:path");
const { createHash } = require("node:crypto");
const { gunzipSync } = require("node:zlib");
const { mkdir, readFile, readdir, stat, unlink, writeFile } = require("node:fs/promises");

function safePackageKey(key) {
  if (!key || path.basename(key) !== key || !key.endsWith(".petlord")) throw new Error("Invalid package key.");
  return key;
}

function packageBuffer(contents) {
  if (Buffer.isBuffer(contents)) return contents;
  if (typeof contents === "string") return Buffer.from(contents, "utf8");
  if (contents instanceof Uint8Array) return Buffer.from(contents);
  if (contents?.type === "Buffer" && Array.isArray(contents.data)) return Buffer.from(contents.data);
  throw new Error("不支持的宠物包数据类型。");
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function parsePackageSummary(contents, key, activeKey) {
  const input = packageBuffer(contents);
  const decoded = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
  const bundle = JSON.parse(decoded.toString("utf8"));
  if (bundle?.format !== "petlord-package" || ![1, 2].includes(bundle?.bundleVersion) || typeof bundle?.createdAt !== "string" || !bundle?.manifest?.id) {
    throw new Error("宠物包格式无效或版本不受支持。");
  }
  if (bundle.bundleVersion === 2) {
    if (bundle.integrity?.algorithm !== "SHA-256") throw new Error("V2 宠物包缺少 SHA-256 完整性信息。");
    if (sha256(JSON.stringify(bundle.manifest)) !== bundle.integrity.manifestSha256) throw new Error("宠物包 manifest 校验失败，文件可能已损坏或被修改。");
    if (bundle.sourceProject !== undefined && sha256(JSON.stringify(bundle.sourceProject)) !== bundle.integrity.sourceProjectSha256) throw new Error("宠物包创作源码校验失败。");
    for (const [assetKey, expected] of Object.entries(bundle.integrity.assets ?? {})) {
      const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/.exec(bundle.assets?.[assetKey] ?? "");
      if (!match || sha256(Buffer.from(match[1], "base64")) !== expected) throw new Error(`宠物包资产 ${assetKey} 校验失败。`);
    }
  }
  return {
    key,
    active: key === activeKey,
    createdAt: bundle.createdAt,
    id: bundle.manifest.id,
    name: bundle.manifest.name,
    characterName: bundle.manifest.characterName,
    stateCount: bundle.manifest.states?.length ?? 0,
    transitionCount: bundle.manifest.transitions?.length ?? 0,
  };
}

function createDesktopPackageStore({ dataDirectory, onPackageChanged = async () => {}, onPackagesChanged = async () => {} }) {
  const packagesDirectory = path.join(dataDirectory, "packages");
  const activeKeyPath = path.join(dataDirectory, "active-package.txt");
  const legacyPackagePath = path.join(dataDirectory, "active-desktop-pet.petlord");

  async function readActivePackageKey() {
    return readFile(activeKeyPath, "utf8").then((value) => value.trim(), (error) => {
      if (error?.code === "ENOENT") return "";
      throw error;
    });
  }

  async function listPackages() {
    await mkdir(packagesDirectory, { recursive: true });
    const activeKey = await readActivePackageKey();
    const entries = await readdir(packagesDirectory, { withFileTypes: true });
    const summaries = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".petlord"))
      .map(async (entry) => {
        try {
          return parsePackageSummary(await readFile(path.join(packagesDirectory, entry.name)), entry.name, activeKey);
        } catch {
          return null;
        }
      }));
    return summaries.filter(Boolean).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function getPackageStatus(key) {
    const safeKey = safePackageKey(key);
    const exists = await stat(path.join(packagesDirectory, safeKey)).then(
      (entry) => entry.isFile(),
      (error) => error?.code === "ENOENT" ? false : Promise.reject(error),
    );
    if (!exists) return undefined;
    return { key: safeKey, active: safeKey === await readActivePackageKey() };
  }

  async function installPackage(contents, options = {}) {
    const parsed = parsePackageSummary(contents, "pending.petlord", "");
    const encoded = packageBuffer(contents);
    await mkdir(packagesDirectory, { recursive: true });
    const packages = await listPackages();
    const requestedTargetKey = options.targetKey ? safePackageKey(String(options.targetKey)) : undefined;
    const explicitTarget = requestedTargetKey ? packages.find((candidate) => candidate.key === requestedTargetKey) : undefined;
    if (requestedTargetKey && !explicitTarget) throw new Error("要更新的本机宠物已不存在，请返回宠物列表重新选择。");
    const sameNameTarget = options.mode === "new" ? undefined : packages.find((candidate) => candidate.name.trim().toLocaleLowerCase() === parsed.name.trim().toLocaleLowerCase());
    const timestamp = parsed.createdAt.replaceAll(/[^0-9]/g, "").slice(0, 14) || Date.now().toString();
    const id = String(parsed.id).replaceAll(/[^A-Za-z0-9_-]/g, "-").slice(0, 52);
    const target = explicitTarget ?? sameNameTarget;
    let key = target?.key;
    if (key) {
      await writeFile(path.join(packagesDirectory, key), encoded);
    } else {
      const base = `${timestamp}-${id}`;
      for (let suffix = 0; ; suffix += 1) {
        const candidate = safePackageKey(`${base}${suffix === 0 ? "" : `-${suffix + 1}`}.petlord`);
        try {
          await writeFile(path.join(packagesDirectory, candidate), encoded, { flag: "wx", mode: 0o600 });
          key = candidate;
          break;
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
        }
      }
    }
    await writeFile(activeKeyPath, key, { encoding: "utf8", mode: 0o600 });
    await onPackageChanged(encoded);
    return (await listPackages()).find((candidate) => candidate.key === key);
  }

  async function migrateLegacyPackage() {
    if ((await listPackages()).length > 0) return;
    try {
      await installPackage(await readFile(legacyPackagePath));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async function loadActivePackage() {
    await migrateLegacyPackage();
    const key = await readActivePackageKey();
    if (!key) return null;
    return readFile(path.join(packagesDirectory, safePackageKey(key)));
  }

  async function activatePackage(key) {
    const safeKey = safePackageKey(key);
    const contents = await readFile(path.join(packagesDirectory, safeKey));
    parsePackageSummary(contents, safeKey, safeKey);
    await writeFile(activeKeyPath, safeKey, { encoding: "utf8", mode: 0o600 });
    await onPackageChanged(contents);
    return contents;
  }

  async function removePackage(key) {
    const safeKey = safePackageKey(key);
    if (safeKey === await readActivePackageKey()) throw new Error("当前正在使用的宠物包不能删除，请先切换到其他版本。");
    await unlink(path.join(packagesDirectory, safeKey));
    await onPackagesChanged();
    return listPackages();
  }

  return {
    activatePackage,
    getPackageStatus,
    installPackage,
    listPackages,
    loadActivePackage,
    parsePackageSummary,
    removePackage,
  };
}

module.exports = { createDesktopPackageStore, packageBuffer, parsePackageSummary, safePackageKey };
