# Agent Design and Integrated Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver a self-contained desktop pet and Studio with a complete agent design protocol and deterministic native pixel workflow.

**Architecture:** Local API owns validated design commands, jobs and artifacts. Studio and a bundled JSON CLI operate on the same workspace. Native sprites and provider images/videos share the project/state graph, export format and runtime.

**Tech Stack:** TypeScript, Zod, Node SQLite/HTTP, React/Vite, Electron, FFmpeg, Vitest; use existing packages where practical.

**Spec:** `docs/superpowers/specs/2026-09-09-agent-design-desktop.md`

## Global Constraints

- Work in the current checkout on `codex/agent-design-desktop` and preserve `assets/experiments/` and all user data.
- New installation shows a bundled transparent pet only; settings and Studio are user-opened windows.
- No Node/Python installation or development server is required by the packaged application.
- Both generated media and native pixel artwork must work through the agent protocol and human Studio.
- Pixel rendering is deterministic: integer coordinates, fixed palette, binary alpha, explicit frame durations and exact endpoints. Runtime bypasses artistic quantization for native assets.
- Agent edits have discoverable schemas, structured errors, revision checks and retry-safe request IDs; secrets are never returned in feedback.
- Do not publish, push a shared branch, or alter another app's agent configuration.

## Task 1: Desktop shell and distributable resources

**Files:** `apps/desktop/electron/main.cjs`, `apps/desktop/electron/preload.cjs`, new `apps/desktop/electron/studio-host.cjs`, new `apps/desktop/electron/studio-preload.cjs`, `apps/desktop/src/desktopBridge.ts`, `apps/desktop/src/components/DesktopSettingsWindow.tsx`, `apps/desktop/package.json`, new build scripts under `apps/desktop/scripts/`, `apps/studio/src/hooks/usePublishPackage.ts`, desktop behavioral tests.

**Interfaces:** Consume the controller-owned API module exporting `startPetLordServer(options)` -> `Promise<{url:string,close():Promise<void>}>`. Options: host, port, runtimeDataDirectory, studioDirectory, authToken, ffmpegPath, foregroundMaskerPath, installPackage(contents). Packaged module target `apps/desktop/service/server.mjs`; CLI target `apps/desktop/service/design-cli.cjs`; built Studio target `apps/desktop/studio/`. Desktop owns resource build scripts and config, controller owns API and CLI implementation. Install bridge namespace `window.petLordStudio` with `installPackage(contents)`, `showRuntimeSettings()`, and `showPet()`; declarations may live in a new Studio bridge file.

- [x] Write failing behavioral tests for fresh launch/default package, hidden Studio/settings, explicit open/focus/reopen and package installation. Existing Electron doubles may be extended only for native surfaces; inspect real filesystem/package outcomes.
- [x] Implement first-run default package provisioning using a valid bundled offline pet package. Keep existing active package on upgrades.
- [x] Add one Studio window, tray/settings entry points, narrow preload bridge, local backend lifecycle, random private token and `design-connection.json` with owner-only permissions. Use actual assigned port and close resources on exit. Create a user-local CLI launcher using bundled Electron; do not modify Codex/Claude configs.
- [x] Build backend/CLI with esbuild, bundle built Studio and required native helpers. Ensure resource paths work inside packaged ASAR and unpack binaries. Do not silently bundle wrong-platform FFmpeg. Preserve existing packaging commands.
- [x] Connect Studio publishing to direct install/activation when desktop bridge is present, retaining browser export behavior.
- [x] Run focused desktop tests/build/syntax checks; record gaps dependent on controller-owned API/CLI. Commit only owned changes and write report.

## Task 2: Shared native pixel document and runtime

**Files:** new `packages/pixel-art/`, `packages/schema/src/nativePixel.ts` and schema exports, `packages/runtime-react/src/NativeSpriteCanvas.tsx`, runtime renderer and media helpers, runtime-core and portable package traversal, pixel/runtime tests. Human Studio pixel panel belongs to Task 5.

**Interfaces:** `NativePixelDocument` with canvas, palette, named layered frames and base-frame patches. Export pure `renderPixelFrame(document,frameId)` returning RGBA plus dimensions; export pixel validation and frame-resolution helpers. Project gets optional `productionRoute: "generated" | "native-pixel"` and editable `pixelDocument`; artifact gets optional `nativePixel` metadata; design transition gets optional native animation referencing image artifact IDs and durations, runtime transition gets native animation referencing portable image URIs and durations. Existing video-only projects remain valid.

- [x] Write failing tests using hand-authored tiny matrices for palette mapping, transparency, layer order, clear/replace patches, bounds and base-frame cycles.
- [x] Implement source schemas and deterministic frame rendering. Expose per-frame diagnostics and a stable source representation; cap resource dimensions/frame counts to prevent unbounded work.
- [x] Write failing package/runtime tests for mixed video and native animations, exact frame boundaries and first/last state validation.
- [x] Implement native sprite playback that honors explicit durations, playback cycles and completion callbacks, and skips pixel-art postprocessing for native states/transitions. Integrate all media URI collection/resolution and package validation paths.
- [x] Run focused and affected regression tests/typechecks, document exported APIs and commit owned changes.

## Task 3: Headless design commands, generation and feedback

**Files:** new `packages/design-core/`, new API `designService.ts`, command routes and media rendering helpers, `apps/generation-api/src/server.ts`, `sqliteStore.ts`, tests. Move/re-export existing pure Studio helpers where needed rather than duplicate business rules.

**Interfaces:** `GET /api/design/v1/commands` returns command names/descriptions/input JSON schemas. `POST /api/design/v1/execute` takes `{requestId, command, projectId?, expectedRevision?, input}` and returns `{protocolVersion:1, requestId, result?, error?}`. Project snapshots include explicit revision. Commands cover workspace/project/state/variant/transition/media/provider/job/pixel/feedback/package workflows. Service startup follows Task 1 contract.

- [x] Write failing tests for real command lifecycle, schema errors, stale revisions and retry deduplication against isolated SQLite/filesystem.
- [x] Implement validated pure graph mutations and command catalog. Creation and updates preserve all schema-supported detailed settings; validate references on destructive/remapping operations.
- [x] Implement transactional/revision-safe persistence and deduplication, structured error codes/details and capabilities. Add loopback/token/Origin protection for packaged service.
- [x] Refactor server startup to explicit lifecycle without breaking developer entry point. Serve packaged Studio safely with correct media/content types.
- [x] Assemble provider requests from project context, queue jobs, reconcile results in backend, expose status/cost/error/candidates/retry and approval independent of open UI. Use explicit local fixture provider in integration tests; never fake provider success in production.
- [x] Implement pixel source update/patch/render/animation binding, PNG/contact-sheet feedback and strict endpoint checks. Export portable packages and invoke optional desktop install hook.
- [x] Verify generated and native workflows through actual HTTP with Studio closed and commit implementation.

## Task 4: Agent CLI and protocol documentation

**Files:** new `packages/design-cli/` or `scripts/design-cli.*`, root command scripts, docs/agent-design.md, CLI tests.

**Interfaces:** CLI accepts explicit endpoint/token or desktop connection descriptor. Provide command discovery, JSON file/stdin execution, useful project/job shortcuts, bounded waits, authenticated media downloads and bundle export/install. stdout is machine-readable JSON; progress/errors use stderr and nonzero exit status. Bundled entry matches Task 1 target.

- [x] Write failing process-level tests against a local test HTTP server for request assembly, descriptor discovery, stdin/file input, errors, wait timeout and media output.
- [x] Implement reusable CLI entry with no dependency on a local checkout. Keep discovery documentation complete enough for an agent to finish the workflow from zero.
- [x] Add executable sample artwork input based on Lottery and commands that create, revise, inspect, animate, export and install it. Clearly distinguish production operations from examples.
- [x] Run CLI against real isolated API, download and inspect resulting artifacts, and commit.

## Task 5: Human Studio synchronization and pixel workspace

**Files:** Studio `workspaceApi.ts`, `useProjectWorkspace.ts`, creation/style controls, new pixel workspace components/hooks, publish integration coordination; tests for sync and source editing.

**Interfaces:** Use shared revision/command API and native document renderer. Human changes and agent changes share the same persisted project. Native route is explicitly selectable and has state/frame feedback, palette/layer/pixel edits and playback review.

- [x] Write tests for external project changes, unsaved local edits and stale writes so agent updates cannot be silently overwritten.
- [x] Implement revision-aware saves and refresh/notifications; report conflicts with recoverable UI state.
- [x] Add native route selection and editor/reviewer using existing Studio visual language. Generated-media controls continue to work for generated projects; pixel workflows call deterministic commands.
- [x] Verify browser interactions and no regression to project/state/video editing; commit.

## Task 6: End-to-end verification, release build and review

**Files:** integration/packaged smoke scripts and documentation, fixes in owned modules as required.

- [x] Run the complete existing tests, typechecks and builds once all integration points are implemented.
- [x] Run an agent-only workflow for generated fixture media and original native artwork, including feedback, conflict handling, export and install.
- [x] Produce and inspect an actual macOS app/installer. Launch with fresh isolated user data and no development servers; verify transparent pet-only launch, settings, built-in Studio and design-to-runtime handoff.
- [x] Dispatch independent review of the full implementation; resolve correctness findings and rerun affected checks.
- [x] Audit every requirement in the spec against concrete current artifacts and commands. Record evidence and deliver paths. Mark the goal complete only when the whole objective is proved.
