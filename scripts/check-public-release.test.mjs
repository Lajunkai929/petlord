import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const gate = new URL('./check-public-release.mjs', import.meta.url).pathname;
function withRepository(files, check) {
  const root = mkdtempSync(join(tmpdir(), 'petlord-public-test-'));
  try {
    spawnSync('git', ['init', '-q', root]);
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    spawnSync('git', ['add', '-f', '.'], { cwd: root });
    check(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function scan(root) { return spawnSync(process.execPath, [gate], { cwd: root, encoding: 'utf8' }); }

test('accepts clean tracked sources and does not read ignored account data', () => {
  withRepository({ 'README.md': 'Use $HOME for local files.\n', '.gitignore': '.env\n' }, root => {
    writeFileSync(join(root, '.env'), 'API_KEY=private-local-value');
    const result = scan(root);
    assert.equal(result.status, 0, result.stderr);
  });
});
test('rejects personal absolute paths and prints location only', () => {
  const privatePath = ['','Users','private-person','Pictures','photo.jpg'].join('/');
  withRepository({ 'notes.md': `safe\n${privatePath}\n` }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /personal_path notes\.md:2/);
    assert.ok(!result.stdout.includes(privatePath));
    assert.ok(!result.stderr.includes(privatePath));
  });
});
test('rejects secrets without disclosing the matched value', () => {
  const values = ['sk-' + 'a'.repeat(36), 'ghp_' + 'b'.repeat(36), 'super-private-credential'];
  withRepository({ 'config.ts': `const key = '${values[0]}';\n${values[1]}\napiKey: '${values[2]}'\n` }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /secret config\.ts:1/);
    assert.match(result.stdout, /secret config\.ts:2/);
    assert.match(result.stdout, /secret config\.ts:3/);
    for (const value of values) assert.ok(!(result.stdout + result.stderr).includes(value));
  });
});
test('rejects tracked private artifacts even when gitignore would ignore them', () => {
  const paths = ['.env', 'runtime-data/jobs.json', 'project.sqlite', 'credentials.json', 'outputs/private.png', 'assets/experiments/photo.png', '.petlord/settings.json', 'key.pem'];
  withRepository(Object.fromEntries(paths.map(path => [path, Buffer.from([0, 1, 2])])), root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    for (const path of paths) assert.ok(result.stdout.includes(`private_file ${path}:1`), path);
  });
});
test('allows only designated synthetic fixture paths, rejects leaks in tests', () => {
  const fixture = ['','Users','friend'].join('/');
  const privatePath = ['','home','private-person','data'].join('/');
  withRepository({ 'apps/desktop/src/desktopStoragePaths.test.ts': `const home = '${fixture}';\n${privatePath}\n`, 'other.test.ts': fixture }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.ok(!result.stdout.includes('desktopStoragePaths.test.ts:1'));
    assert.match(result.stdout, /personal_path apps\/desktop\/src\/desktopStoragePaths.test\.ts:2/);
    assert.match(result.stdout, /personal_path other\.test\.ts:1/);
  });
});
test('checks staged content as well as working tree so a hidden staged secret fails', () => {
  const token = 'ghp_' + 'z'.repeat(36);
  withRepository({ 'config.ts': token }, root => {
    writeFileSync(join(root, 'config.ts'), 'clean\n');
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /secret config\.ts:1/);
    assert.ok(!result.stdout.includes(token));
  });
});
test('fails closed outside a Git repository without printing local directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'petlord-nongit-'));
  try {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /scan_error \.:1/);
    assert.ok(!(result.stdout + result.stderr).includes(root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('does not exempt a real-looking token in an audited fixture file', () => {
  const token = 'sk-' + 'q'.repeat(36);
  withRepository({ 'apps/generation-api/src/providers/registry.test.ts': `apiKey: '${token}'` }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /secret apps\/generation-api\/src\/providers\/registry\.test\.ts:1/);
  });
});
test('rejects Windows home paths and private key material', () => {
  const home = ['C:', 'Users', 'private-person', 'photo.jpg'].join('\\');
  const keyHeader = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
  withRepository({ 'notes.md': `${home}\n${keyHeader}\n` }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /personal_path notes\.md:1/);
    assert.match(result.stdout, /secret notes\.md:2/);
    assert.ok(!(result.stdout + result.stderr).includes(home));
  });
});
test('rejects embedded credentials in a tracked binary instead of skipping it', () => {
  const token = 'ghp_' + 'x'.repeat(36);
  withRepository({ 'asset.bin': Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(token)]) }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /secret asset\.bin:1/);
    assert.ok(!result.stdout.includes(token));
  });
});
test('checks every literal assignment after an example or audited fixture on the same line', () => {
  const value = 'private-' + 'v'.repeat(24);
  const field = 'api' + 'Key';
  withRepository({ 'config.ts': `${field}: 'your-api-key-here', ${field}: '${value}'`, 'apps/generation-api/src/providers/registry.test.ts': `${field}: 'fixture-secret', ${field}: '${value}'` }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('secret config.ts:1'));
    assert.ok(result.stdout.includes('secret apps/generation-api/src/providers/registry.test.ts:1'));
    assert.ok(!result.stdout.includes(value));
  });
});
test('detects prefixed environment credentials but permits public project identifiers', () => {
  const value = ['12345678','1234','1234','1234','123456789abc'].join('-');
  withRepository({ 'config.ts': `${'ARK_' + 'API_KEY'}='${value}'\nconst imageAccessToken = '${value}';\nconst projectId = '${value}';` }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('secret config.ts:1'));
    assert.ok(result.stdout.includes('secret config.ts:2'));
    assert.ok(!result.stdout.includes('config.ts:3'));
    assert.ok(!result.stdout.includes(value));
  });
});
test('rejects recognizable credentials in filenames and redacts every report of that filename', () => {
  const token = 'ghp_' + 'n'.repeat(36);
  const path = `outputs/${token}.txt`;
  withRepository({ [path]: 'clean\n' }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('secret_filename [redacted-file-'));
    assert.ok(!(result.stdout + result.stderr).includes(token), 'filename credential must never enter reports');
  });
});
test('rejects non-ASCII Unix personal home names', () => {
  const path = ['', 'Users', '测试用户', 'Pictures', 'photo.jpg'].join('/');
  withRepository({ 'notes.md': path }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('personal_path notes.md:1'));
    assert.ok(!result.stdout.includes(path));
  });
});
test('rejects unquoted shell credential UUIDs while allowing project IDs, variables and examples', () => {
  const name = 'ARK_' + 'API_KEY';
  const value = ['12345678', '1234', '4234', '8234', '123456789abc'].join('-');
  withRepository({ 'config.sh': `export ${name}=${value}\nexport PROJECT_ID=${value}\nexport ${name}=$LOCAL_API_KEY\nexport ${name}=\${LOCAL_API_KEY}\nexport ${name}='\$LOCAL_API_KEY'\nexport ${name}=your-api-key-here\nexport ${name}=REPLACE_WITH_LOCAL_KEY\n` }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('secret config.sh:1'));
    for (let line = 2; line <= 7; line++) assert.ok(!result.stdout.includes(`config.sh:${line}`), 'public IDs, variables and placeholders must pass');
    assert.ok(!(result.stdout + result.stderr).includes(value));
  });
});
test('rejects a tracked internal orchestration report even when force-added', () => {
  withRepository({ '.gitignore': '.superpowers/\n', '.superpowers/sdd/task-1-report.md': 'Internal execution details\n' }, root => {
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('private_file .superpowers/sdd/task-1-report.md:1'));
  });
});
