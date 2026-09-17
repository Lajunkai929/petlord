# Local creation and visual system — 0.1.6

## User flow

Open **宠物 → 编辑这个宠物**, edit the associated Studio project, then choose **发布 → 更新本机宠物**. The action saves the project, applies that revision to its existing local installation and refreshes the desktop runtime. Renaming does not create a different installation. A new project uses **在本机使用**; **导出 .petlord** and optional subscriptions are for sharing and transfer.

Imported packages have editable projects. Native pixel packages retain reconstructable pixel frames; older video packages expose the state, transition and media data available in the package. Missing original prompts and generation history cannot be recovered from a flattened package.

The native canvas save path refreshes already-bound state images and animation frames. New frames still need a deliberate state or animation assignment. The lower-level `pixel.document.set` command continues to save source independently of approved snapshots.

## Visual and interaction changes

- Light is the default: warm cream, brown text and caramel accents derived from the existing dog/logo. Dark mode uses warm charcoal and honey. Desktop settings and integrated Studio share the saved theme.
- Shared Ant Design Select, Switch and Segmented controls provide keyboard handling and component states. Existing Radix dialogs retain focus behavior; an open Select consumes the first Escape before the outer dialog closes on the next Escape.
- New interactions and bundled defaults use left-click. A smaller matching hotspot takes priority over a full-body target; equal-size targets keep authored order. Deliberately authored double-click gestures remain available.
- Gaze allows one seek in flight and keeps only the latest requested target. It smooths circular direction changes, bounds seek frequency and rejects stale blend callbacks after leaving gaze, changing state or starting a transition.

## Regression evidence

The review reproduced and closed stale gaze RAF painting, Select Escape closing its parent dialog, full-body clicks masking head clicks, package-key collisions, apply/sync races, cold Edit opening a previous project and duplicate bundled pets after compressed-package upgrades.

An isolated Electron profile exercised the real renderer, preload, IPC and local design service: default light, opening the associated project, renaming, applying to the same key, one runtime package-change event, shared dark theme and subsequent sync with no duplicate project. Native canvas animation was checked through rendered pixels; click handling also has runtime/core tests. Headless browser checks covered the Studio library, pixel canvas, settings, keyboard switches and both themes. These checks do not establish a human-observed gaze smoothness comparison.

The source gaze clips inspected were VP9 alpha, 480 × 480 at 24 fps. A packaged-app run loaded a video package in an isolated profile and delivered 90 renderer pointer moves: 37 seeks completed, zero currentTime writes occurred while seeking, rendered pixels changed, and gaze exited back to the static state. The slowest observed seek was 51 ms in this single local run; this is not an FPS benchmark. Scheduling cannot add poses or visual detail absent from those clips.

## Release validation

- Final full suite: **89 files, 374 tests passed** (2026-09-10 02:21 local).
- Studio, desktop and generation-api typechecks passed. Desktop renderer, Studio, bundled service/CLI/MCP, default pet and native resource builds passed. Changed Electron files passed Node syntax checks; git diff whitespace checks passed.
- Repeated the complete edit-color → Save Canvas → rename → local apply → exact new RGBA on desktop test using the packaged 0.1.6 application, not only the development Electron binary. Theme synchronization, original package key, one runtime refresh and no duplicate sync all passed with no renderer errors.
- Installer: `apps/desktop/release/PetLord-0.1.6-arm64.dmg` (192,574,681 bytes).
- SHA-256: `2ced2f98b29e4c67697c05b309dfe4ab9d7ea00a23ebeda970e23e54b94dfa97`.
- `codesign --verify --deep --strict` and `hdiutil verify` passed. This is a locally ad-hoc signed test build; Apple notarization was not performed.

## Upgrade preservation

Upgrade checks retained existing content, installation associations and settings. Default interaction migration preserved deliberate custom double-click gestures. Native source bindings were refreshed before applying the bundled sample.

After restart, applied revisions and runtime media hashes remained consistent, the selected installation was preserved, and synchronization created no duplicate imports. External configuration was unchanged. No provider generation or subscription publication was performed. Detailed profile inventories and backup records remain private.

Detailed local evidence and source screenshots remain private and are excluded from public distribution.
