const path = require("node:path");
const { access, chmod, cp, mkdir, writeFile } = require("node:fs/promises");
const { homedir } = require("node:os");

const migrationMarkerName = ".legacy-user-data-migrated-v1.json";
const managedDataEntries = [
  "packages",
  "active-package.txt",
  "active-desktop-pet.petlord",
  "runtime-settings.json",
  "runtime-errors.json",
  "petlord-client.sqlite",
  "petlord-client.sqlite-wal",
  "petlord-client.sqlite-shm",
  "integrations",
];

function resolvePetLordDataDirectory(environment = process.env, homeDirectory = homedir()) {
  const override = environment.PETLORD_USER_DATA_DIR;
  return override ? path.resolve(override) : path.join(homeDirectory, ".petlord");
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function preparePetLordDataDirectory(targetDirectory, legacyDirectory) {
  await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
  await chmod(targetDirectory, 0o700).catch(() => undefined);

  if (!legacyDirectory || path.resolve(legacyDirectory) === path.resolve(targetDirectory)) return [];
  const markerPath = path.join(targetDirectory, migrationMarkerName);
  if (await pathExists(markerPath)) return [];

  const copied = [];
  for (const entry of managedDataEntries) {
    const source = path.join(legacyDirectory, entry);
    const target = path.join(targetDirectory, entry);
    if (await pathExists(target) || !await pathExists(source)) continue;
    await cp(source, target, { recursive: true, force: false, errorOnExist: false, preserveTimestamps: true });
    copied.push(entry);
  }

  await writeFile(markerPath, `${JSON.stringify({
    version: 1,
    migratedAt: new Date().toISOString(),
    sourceDirectory: legacyDirectory,
    copied,
  }, null, 2)}\n`, { mode: 0o600 });
  return copied;
}

module.exports = {
  managedDataEntries,
  preparePetLordDataDirectory,
  resolvePetLordDataDirectory,
};
