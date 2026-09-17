# Public release privacy checks

Run `npm run check:public` before sharing code or a release. This also runs as the first step of `npm run check`, including CI.

The gate checks Git's index and working copies of tracked files. It never crawls ignored local account data. A sensitive value already staged still fails even after the working copy is cleaned; stage the corrected files or intended deletions before rerunning. Reports contain only a category, repository-relative filename and line number. Recognizable secrets in filenames are rejected and all reports for those files use an opaque redacted identifier. File contents and exception details are omitted.

Checks reject personal home paths, common credential formats, literal credential assignments, private keys, profile/runtime files, SQLite databases, generated `outputs/` and user artwork under `assets/experiments/`. Symlinks, submodules and unresolved merges require separate review and fail closed. Existing synthetic test inputs have exact exceptions scoped to audited files and values. A new test filename does not bypass the gate.

Local photo scripts require caller-supplied inputs:

```sh
PETLORD_PROJECT_ID=YOUR_LOCAL_PROJECT_ID node --import tsx scripts/rebuild-qiuqiu-sqlite-project.ts --reference ./local/photo.jpg
node --import tsx scripts/run-lottery-clear-style-lab.ts image sitting --reference ./local/photo.jpg --reference ./local/another-photo.jpg
```

These scripts act on the local API; the style lab can submit paid provider jobs. Use them only when you intend that action. Local paths are not defaults or artifact labels. CLI failures print fixed safe messages without input filenames, provider error content or stack traces. Project and video modes of the style lab require an explicit `PETLORD_PROJECT_ID`; standalone image labs use a fresh isolated ID for each run. `project-video` and `batch-videos` also require `PETLORD_STATE_IMAGE_URIS_JSON`, a JSON object with exactly `sitting`, `lying`, `sleeping` and `belly` mapped to local `/api/media/` image URIs. Missing or invalid maps stop before file reads or API calls. The single `video` mode uses its explicit image URI argument.

This gate is a preventive check, not a proof that a release has no private information. It scans recognizable text in binary files too, but does not parse EXIF/GPS metadata, recognize private subjects in images, or strip metadata. It does not inspect Git history, arbitrary secret formats, or already-published artifacts. Review the intended release files, artwork provenance and repository history separately before publication. Never publish local profiles, credentials, private photos or user projects as examples.
