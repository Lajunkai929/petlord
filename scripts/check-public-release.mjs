import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Deliberately scan only Git-tracked inputs. Never crawl local account/profile data.
const findings = new Set();
const redactedPaths = new Map();
function report(category, path, line = 1) {
  // Escape control characters in filenames; never print file content or exception text.
  path = redactedPaths.get(path) ?? path;
  findings.add(`${category} ${path.replace(/[\u0000-\u001f\u007f]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)}:${line}`);
}
const privateFile = /(?:^|\/)(?:\.env(?:\..+)?|\.petlord(?:-backups)?|runtime-data|outputs|\.superpowers|credentials?(?:\.[^/]+)?|secrets?(?:\.[^/]+)?)(?:\/|$)|^assets\/experiments(?:\/|$)|\.(?:sqlite(?:3)?|db)(?:-(?:wal|shm))?$|\.(?:pem|p12|pfx|key)$|(?:^|\/)(?:id_rsa|id_ed25519|\.npmrc|\.netrc)$/i;
const personalPath = /\/(?:Users|home)\/[^\s/\\"'`<>),;]+(?:\/[^\s"'`<>)]*)?|[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\s"'`<>),;]+/g;
const fixtureHomes = new Map([
  ['apps/desktop/src/desktopStoragePaths.test.ts', /^\/Users\/friend(?:\/\.petlord)?$/],
  ['packages/agent-bridge/src/index.test.ts', /^\/Users\/test\/projects\/demo$/],
]);
// Exact values in audited fixture files only; other tests get no blanket exemption.
const fixtureCredentials = new Map([
  ['apps/generation-api/src/unifiedProject.test.ts', ['fixture-only']],
  ['apps/generation-api/src/designProtocol.test.ts', ['test-protocol-token-123456789']],
  ['apps/generation-api/src/serverLifecycle.test.ts', ['test-token-01234567890123456789']],
  ['apps/generation-api/src/retryBudget.test.ts', ['fixture-token']],
  ['apps/generation-api/src/headlessVideo.test.ts', ['fixture-token']],
  ['apps/generation-api/src/openProviders.test.ts', ['fixture-credential', 'fixture-secret']],
  ['apps/generation-api/src/headlessGeneration.test.ts', ['fixture-credential']],
  ['apps/generation-api/src/sqliteStore.test.ts', ['secret-api-key']],
  ['apps/generation-api/src/serverShutdown.test.ts', ['fixture-token']],
  ['apps/generation-api/src/providers/imageProtocols.test.ts', ['fixture-secret-key']],
  ['apps/generation-api/src/providers/registry.test.ts', ['connection-secret', 'existing-secret', 'fixture-secret', 'image-secret-key', 'original-secret', 'video-secret-key']],
  ['apps/studio/src/components/providerEditorModel.test.ts', [' replacement-key ', 'fixture-secret']],
  ['scripts/verify-packaged-design.mjs', ['local-fixture-credential']],
]);
const secrets = [
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /(?<![\w.])[\w-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret[_-]?key)[\w-]*\s*["']?\s*[:=]\s*["'](?<value>[^"'\r\n]{12,})["']/gi,
  // Bare shell/env literals have no quotes; expansions ($NAME or ${NAME}) are not literals.
  /(?<![\w.])[\w-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret[_-]?key)[\w-]*\s*=\s*(?<value>[A-Za-z0-9][A-Za-z0-9_-]{11,})(?=\s|[;#]|$)/gi,
];
function hasSecret(text, path, allowExamples = true) {
  for (const pattern of secrets) {
    for (const match of text.matchAll(pattern)) {
      const value = match.groups?.value;
      if (allowExamples && value && fixtureCredentials.get(path)?.includes(value)) continue;
      if (allowExamples && value && /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value)) continue;
      if (allowExamples && value && /^(?:your[-_ ]|example[-_ ]|placeholder|replace[-_ ]|\$\{|process\.env\.|<)/i.test(value)) continue;
      return true;
    }
  }
  return false;
}

function scanContent(path, buffer) {
  const lines = buffer.toString('utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(personalPath)) {
      if (!fixtureHomes.get(path)?.test(match[0])) report('personal_path', path, index + 1);
    }
    if (hasSecret(line, path)) report('secret', path, index + 1);
  });
}
try {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const tracked = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const entry of tracked.split('\0').filter(Boolean)) {
    const match = entry.match(/^(\d+) ([0-9a-f]+) (\d)\t([\s\S]+)$/);
    if (!match) { report('scan_error', '.'); continue; }
    const [, mode, object, stage, path] = match;
    if (hasSecret(path, undefined, false)) {
      if (!redactedPaths.has(path)) redactedPaths.set(path, `[redacted-file-${redactedPaths.size + 1}]`);
      report('secret_filename', path);
    }
    if (privateFile.test(path) && path !== '.env.example') report('private_file', path);
    if (stage !== '0' || mode === '160000' || mode === '120000') { report('unreviewed_git_entry', path); continue; }
    // Check index plus working copy: staging a credential then hiding it locally must fail.
    scanContent(path, execFileSync('git', ['cat-file', 'blob', object], { cwd: root, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    const location = resolve(root, path);
    try {
      if (!lstatSync(location).isFile()) { report('scan_error', path); continue; }
      scanContent(path, readFileSync(location));
    } catch (error) {
      if (error.code !== 'ENOENT') report('scan_error', path);
    }
  }
} catch { report('scan_error', '.'); }
for (const finding of [...findings].sort()) console.log(finding);
process.exitCode = findings.size ? 1 : 0;
