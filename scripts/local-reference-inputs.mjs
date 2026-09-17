import { readFile } from 'node:fs/promises';

/** Explicit local inputs prevent developer photo paths becoming public defaults. */
export function parseReferenceArguments(args) {
  const positional = [];
  const referencePaths = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--reference') {
      const path = args[++index];
      if (!path || path.startsWith('--')) throw new Error('Pass a local image after each --reference.');
      referencePaths.push(path);
    } else positional.push(args[index]);
  }
  if (!referencePaths.length) throw new Error('Pass local images using --reference IMAGE (repeat for multiple images).');
  return { positional, referencePaths };
}
export async function readReferenceFile(path) {
  try { return await readFile(path); }
  catch { throw new Error('Cannot read a reference image; check your local input files.'); }
}

/** Video states must be explicitly supplied from the caller's local media library. */
export function parseStateImageUris(json) {
  const message = 'Set PETLORD_STATE_IMAGE_URIS_JSON to sitting, lying, sleeping and belly local /api/media/ image URIs.';
  let map;
  try { map = JSON.parse(json); } catch { throw new Error(message); }
  const states = ['sitting', 'lying', 'sleeping', 'belly'];
  if (!map || Array.isArray(map) || typeof map !== 'object' || Object.keys(map).length !== states.length) throw new Error(message);
  for (const state of states) {
    if (!Object.hasOwn(map, state) || typeof map[state] !== 'string' || !/^\/api\/media\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp|gif|avif)$/i.test(map[state])) throw new Error(message);
  }
  return map;
}

/** Report only fixed safe messages, never provider error content or a stack. */
export async function runReferenceCli(main) {
  try { await main(); }
  catch (error) {
    const safeMessages = new Set([
      'Pass a local image after each --reference.',
      'Pass local images using --reference IMAGE (repeat for multiple images).',
      'Cannot read a reference image; check your local input files.',
      'Set PETLORD_PROJECT_ID to the local project to rebuild.',
      'Set PETLORD_PROJECT_ID to the local project for project or video modes.',
      'Set PETLORD_STATE_IMAGE_URIS_JSON to sitting, lying, sleeping and belly local /api/media/ image URIs.',
    ]);
    const message = safeMessages.has(error?.message) ? error.message : 'Local reference command failed; check your inputs and local API.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
