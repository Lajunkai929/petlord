# Local library and Codex setup verification — 0.1.5

Verified on macOS arm64 on 2026-09-10.

## Result

Existing runtime-only installations could lack corresponding Studio projects. Startup now reconstructs each portable runtime package into an editable project. New exports and Agent installations include integrity-protected source with effective shared identity/style context. Upgrades add the bundled native pixel companion while retaining the active pet. The desktop settings now provide a user-triggered Codex MCP setup button.

## Automated and packaged checks

- Typechecks and all workspace builds passed. The final full suite passed: **82 files / 324 tests**.
- Import tests verify exact RGBA reconstruction, runtime drag targets and all semantic aliases, intact source round-trip, source hash tampering rejection, per-file errors, restart idempotency, preservation of local edits and divergent imports with the same source ID.
- Export/install protocol tests verify shared identity references and image/video style prompts survive without the original shared libraries.
- Desktop lifecycle tests cover first launch, an existing active pet, legacy migration, upgrade sample provisioning and the executable MCP launcher. A library of 31 pets retains all entries after another import.
- Real Codex CLI tests use isolated `CODEX_HOME` directories. They cover backups, idempotency, foreign-name conflicts, disabled entries and custom environment/arguments/cwd/tool filters. User-owned configurations are preserved.
- Real MCP SDK process tests cover offline initialization, command discovery, read/write separation, images, descriptor changes, and bounded job waits. The CLI wait fixture allows its first HTTP response enough time under the parallel suite.
- `codesign --verify --deep --strict` and `hdiutil verify` passed for the packaged application and disk image.

Artifact: `apps/desktop/release/PetLord-0.1.5-arm64.dmg`.

SHA-256: `cec0d1db04ede12bcff0d7b5223ef6841808e1e79c7ac2c7da262aa65b1e9fe5`.

The build uses ad-hoc signing and has not been Apple notarized. Other operating systems and architectures were not packaged or launched in this run.

## Upgrade preservation

Upgrade checks confirmed that runtime-only packages reconstruct into editable projects. After normalizing media references to content hashes, round-trip manifests retain their runtime behavior and media contents, apart from deliberately new project identifiers.

Existing project content, package bytes, the active installation association and external configuration were preserved. The bundled native sample remains editable, and synchronization does not create duplicate imports. Detailed local inventories and backup records are excluded from this public report.

## Real button and tool flow

An isolated packaged app used a temporary pet profile and an isolated Codex configuration containing an existing notification command. Clicking **接入 Agent → 一键接入 Codex** changed the UI to **已接入**, preserved that notification command and created one configuration backup.

A real MCP SDK client then launched the registered `petlord-mcp` file through the packaged Electron runtime. It discovered all six tools, read the running service and local project, applied a revision-checked state edit and received a PNG as an MCP image block. This did not depend on a development server or the user's Node installation.

The user-facing setup and reload instructions follow the [official OpenAI MCP documentation](https://learn.chatgpt.com/docs/extend/mcp). The current Codex task is not claimed to have hot-loaded the new tools.

## Remaining limits

Runtime-only old packages cannot recover prompts, candidates or original layer structure that they never stored. Source imports with different contents become independent projects, including when an existing project uses the same source ID. Missing source media can prevent a complete source export and is reported rather than silently omitted.

The first isolation attempt used a deeply nested override directory that exceeded macOS's Unix socket path length limit in the pre-existing notification listener. Verification was repeated with a short `/tmp` profile; the standard `~/.petlord` profile works. Long custom data-directory overrides remain a known limitation.
