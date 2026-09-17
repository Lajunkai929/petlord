import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReferenceArguments, readReferenceFile } from './local-reference-inputs.mjs';

test('requires explicit reference inputs without echoing caller arguments', () => {
  assert.throws(() => parseReferenceArguments(['image', 'sitting']), /--reference/);
  assert.throws(() => parseReferenceArguments(['--reference']), /--reference/);
});
test('preserves lab positional arguments and collects repeated references', () => {
  assert.deepEqual(parseReferenceArguments(['image', 'sitting', '--reference', 'first.jpg', '--reference', 'second.png']), {
    positional: ['image', 'sitting'], referencePaths: ['first.jpg', 'second.png'],
  });
});
test('file read failures omit the local input path', async () => {
  const path = ['','private','missing','personal-photo.jpg'].join('/');
  await assert.rejects(readReferenceFile(path), error => error.message === 'Cannot read a reference image; check your local input files.');
});

test('actual photo CLIs reject missing references without source paths or stacks', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const name of ['rebuild-qiuqiu-sqlite-project.ts', 'run-lottery-clear-style-lab.ts']) {
    const script = new URL(name, import.meta.url).pathname;
    const result = spawnSync(process.execPath, ['--import', 'tsx', script], {
      encoding: 'utf8', env: { ...process.env, PETLORD_PROJECT_ID: 'synthetic-cli-test' },
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('--reference'));
    assert.ok(!result.stderr.includes(script), 'must not print source path');
    assert.ok(!result.stderr.includes('    at '), 'must not print a stack');
  }
});
test('actual photo CLIs reject unreadable references without printing inputs or stacks', async () => {
  const { spawnSync } = await import('node:child_process');
  const path = ['', 'Users', 'synthetic-private-user', 'missing-private-photo.jpg'].join('/');
  for (const name of ['rebuild-qiuqiu-sqlite-project.ts', 'run-lottery-clear-style-lab.ts']) {
    const script = new URL(name, import.meta.url).pathname;
    const result = spawnSync(process.execPath, ['--import', 'tsx', script, '--reference', path], {
      encoding: 'utf8', env: { ...process.env, PETLORD_PROJECT_ID: 'synthetic-cli-test' },
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('Cannot read a reference image'));
    assert.ok(!(result.stdout + result.stderr).includes(path), 'must not print input path');
    assert.ok(!result.stderr.includes(script), 'must not print source path');
    assert.ok(!result.stderr.includes('    at '), 'must not print a stack');
  }
});
test('style lab project/video modes require an explicit local project before reading references', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = new URL('run-lottery-clear-style-lab.ts', import.meta.url).pathname;
  for (const mode of ['project-image', 'project-video', 'batch-videos', 'video']) {
    const env = { ...process.env };
    delete env.PETLORD_PROJECT_ID;
    const result = spawnSync(process.execPath, ['--import', 'tsx', script, mode, '--reference', 'missing-synthetic-photo.jpg'], { encoding: 'utf8', env });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('Set PETLORD_PROJECT_ID'), 'explicit project required before local image read');
    assert.ok(!result.stderr.includes(script), 'must not print source path');
  }
});

test('project video entrypoint requires a valid caller map before file reads or API calls', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = new URL('run-lottery-clear-style-lab.ts', import.meta.url).pathname;
  const fetchGuard = 'data:text/javascript,' + encodeURIComponent("globalThis.fetch = () => { process.stdout.write('unexpected-fetch-call'); throw new Error('blocked-test-call'); };");
  for (const mode of ['project-video', 'batch-videos']) {
    for (const map of [undefined, '{}', '{invalid', JSON.stringify({ sitting: '/api/media/sample.png', lying: '/api/media/sample.png', sleeping: '/api/media/sample.png', belly: 'https://example.com/private.png' })]) {
      const env = { ...process.env, PETLORD_PROJECT_ID: 'synthetic-cli-test' };
      delete env.PETLORD_STATE_IMAGE_URIS_JSON;
      if (map !== undefined) env.PETLORD_STATE_IMAGE_URIS_JSON = map;
      const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', fetchGuard, script, mode, 'sit-rest', '--reference', 'missing-synthetic-photo.jpg'], { encoding: 'utf8', env });
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes('PETLORD_STATE_IMAGE_URIS_JSON'), 'state map must fail before reference reads');
      assert.ok(!result.stderr.includes('Cannot read'), 'reference files must not be read first');
      assert.ok(!result.stdout.includes('unexpected-fetch-call'), 'must not call API');
      assert.ok(!result.stderr.includes(script), 'must not print source path');
    }
  }
});
test('state map parser accepts exactly four local image URIs and rejects unsafe variants', async () => {
  const { parseStateImageUris } = await import('./local-reference-inputs.mjs');
  assert.equal(typeof parseStateImageUris, 'function', 'state map parser is required');
  const valid = { sitting: '/api/media/sitting.png', lying: '/api/media/lying.webp', sleeping: '/api/media/sleeping.jpg', belly: '/api/media/belly.png' };
  assert.deepEqual(parseStateImageUris(JSON.stringify(valid)), valid);
  for (const input of [undefined, '', '{invalid', 'null', '[]', '{}', JSON.stringify({ ...valid, extra: '/api/media/extra.png' })]) {
    assert.throws(() => parseStateImageUris(input), /PETLORD_STATE_IMAGE_URIS_JSON/);
  }
  for (const uri of ['https://example.com/image.png', '/api/media/../private.png', '/api/media/%2e%2e.png', '/api/media/image.mp4', '/api/media/image.png?secret=x', '/api/media/image.png#fragment', '/api/media/image', 123]) {
    assert.throws(() => parseStateImageUris(JSON.stringify({ ...valid, sitting: uri })), /PETLORD_STATE_IMAGE_URIS_JSON/);
  }
});
