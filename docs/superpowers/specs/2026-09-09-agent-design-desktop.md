# Agent design protocol and integrated desktop application

## Authorized objective

Ship one PetLord desktop application containing the transparent pet runtime, runtime settings, the existing human Studio and its local backend. A new installation starts with a working bundled pet and only the pet visible. Settings and Studio are explicitly openable within the application. A person can design, export/install and use their pet without starting development servers or installing Node/Python.

Expose the full design workflow to agents through a documented, discoverable, versioned local protocol and a bundled CLI. Agents must be able to create/edit projects, identities, styles, states, variants and transitions; import references; submit state/transition generation; inspect jobs/costs/errors/candidates; approve candidates and transitions; fine-tune prompts, playback, triggers, gaze and other schema-supported settings; inspect/render visual feedback; export and install a self-contained runtime package. Backend job completion must update project artifacts without any Studio page open. Preserve existing Seedream/Seedance/provider workflows.

Add a separate native pixel route: reusable palette/layers/keyframes, explicit frame durations and bounded pixel patches, rendered deterministically by prebuilt code. Agents supply artwork data, not scripts. Original pixels and frame timing must survive preview, package export/import and runtime playback; no video generation or pixel-art postprocessing may alter them. Provide a human-facing way to select/review/edit the pixel route and at least one useful default example derived from the Lottery experiment.

## Architectural decisions

- One local API is the authority for design state. The Studio and CLI share it. Add command discovery and typed validation, structured errors, request IDs, revision checks for edits, and retry-safe command handling. Protect packaged service access with a local token, limit to loopback, and reject cross-origin browser mutation requests. Never return provider secrets from discovery or project feedback.
- Keep existing public domain schemas compatible. Shared pure design commands validate graph references and produce immutable project changes. Backend orchestration assembles generation requests, persists them and reconciles completion. Low-level schema edits complement discoverable workflow commands so agents can access detailed settings without UI automation.
- CLI uses the same HTTP commands and emits JSON. Include describe/help, execute from JSON file/stdin, project/job inspection, bounded wait, media download and package export/install. Desktop installs a user-local launcher using its bundled Electron runtime; developers can invoke the CLI with Node. CLI never depends on Python or separate development servers.
- Pixel documents hold a fixed palette, canvas dimensions, explicitly named frames, layer grids and bounded patches relative to a named base frame. Validate coordinates, colors, dimensions, cycles, duration budgets and endpoints. Each render is deterministic. Store editable source and rendered PNG artifacts. Runtime transitions carry native sprite frames and durations, with exact first/last state references; retain legacy videos as the other route.
- Desktop serves the built Studio from its bundled API; no iframe pointing at a remote development host. Use a separate sandboxed Studio window and an explicit desktop bridge for installing a designed package. Bundle frontend, API/CLI code, FFmpeg and macOS foreground-mask helper as needed. Persist in the established PetLord data directory, not inside the app bundle.
- Packaged service integration contract owned by the controller: `startPetLordServer(options)` returns `{ url, close }`. Options include `host`, `port`, `runtimeDataDirectory`, `studioDirectory`, `authToken`, `ffmpegPath`, `foregroundMaskerPath`, and `installPackage(contents: Uint8Array): Promise<unknown>`. Desktop starts with port 0 (OS assigned), loopback host, private token; writes `design-connection.json` under its data directory for the CLI. `url` is the actual listening origin.

## Scope and verification

Do not replace prior experiments or existing user projects. Work in the current checkout on `codex/agent-design-desktop`. No public deployment or shared-branch push is part of this work.

Acceptance evidence must include:

1. Real command tests exercise creation, state edits, candidate selection, transitions, invalid graph references, stale revisions, duplicate request IDs and structured failure responses.
2. With Studio closed, an isolated backend can run a deterministic local/fake provider fixture, persist completed artifacts and export the result. External paid providers are tested through their existing request contracts unless an actual authorized generation is needed.
3. Agent commands can create a native pixel project from artwork JSON, modify a bounded region, render feedback, connect two states, export a bundle and play the exact pixel frames in the runtime. Include endpoint/timing/color/alpha and portability checks.
4. Studio reflects agent changes without silently overwriting them; stale human saves report conflicts. Human controls preserve existing provider workflows and allow native pixel authoring/review.
5. A built macOS application, started with a fresh isolated data directory, visibly opens only a transparent pet; settings and integrated Studio can then be opened; a designed pet can be installed and activated. Verify the packaged app without the checkout's dev servers. Inspect the archive for required resources. Preserve platform packaging definitions and document host-specific build prerequisites.
6. Existing full tests, typechecks and builds pass. Run focused tests during iteration. Perform independent code review and resolve actionable correctness findings. Provide the built application/installable artifact and protocol documentation.

Art quality remains a separate human judgment; passing deterministic render checks is not a claim of Stardew-quality illustration.
