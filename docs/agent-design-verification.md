# Integrated desktop and agent design verification

Verified on macOS arm64, 2026-09-09. Implementation branch: `codex/agent-design-desktop`.

## Automated checks

`npm run check` passed: all typechecks, **79 test files / 308 tests**, and all workspace builds. Coverage includes real HTTP/SQLite command workflows, CLI processes, generation request assembly and reconciliation, exact PNG pixels, endpoint and timing validation, portable media traversal, actual Canvas drawing, concurrent edits and retry budgets.

Targeted integration tests use local Provider fixtures rather than paid calls. The video test substitutes only the fixture CDN transport; it uses real media bytes, FFmpeg, persistence, candidate reconciliation, frame extraction, approval and package export. Shutdown tests stop a real child process and resume a known remote video task after restart without resubmitting it.

## Packaged application

Built `apps/desktop/release/PetLord-0.1.4-arm64.dmg` and `apps/desktop/release/mac-arm64/PetLord.app`. The application includes built Studio, embedded API, CLI, FFmpeg, the macOS foreground-mask helper and an offline native pixel companion. Both `codesign --verify --deep --strict` and `hdiutil verify` passed.

This is an ad-hoc signed test build; Apple notarization has not been performed. Other platforms and architectures have packaging definitions but were not built or launched in this verification.

Three separate temporary data directories were used. No checkout development server served Studio or its backend.

| Acceptance path | Observed result |
| --- | --- |
| First launch | Only the transparent native Lottery pet appears; settings and Studio stay hidden. The default package contains an explicit idle animation and binary-alpha PNGs. |
| Discoverability | App menu exposes Settings, Open Studio and Show Pet; existing File/Edit/View/Window menus remain. Settings also opens Studio. |
| Integrated Studio | Loads from its assigned loopback origin inside the application, using the private session. |
| Agent route | Installed CLI creates the Lottery example, applies a frame edit, renders/downloads a contact sheet, exports and installs a portable package. |
| Human native editor | Canvas and scrolling frame list remain visible with 22 frames. A derived frame was created and two real pixel changes at (24,24) and (25,25) persisted to the backend. |
| Live synchronization | CLI changed the sitting-state label while Studio remained open; the label updated automatically and retained the human's saved source edits. |
| Animation runtime | Double-clicking the installed native pet played the authored sitting-to-resting sequence and reached the resting authority image. |
| Studio install | “Install and use” changed the active package and displayed a success message confirming the runtime switch. |
| Empty workspace | A third fresh instance initialized Studio without any Agent setup. Using only the human UI: new native project → blank template → load sample → create a state → bind initial frame → install and use, all succeeded. |
| Shutdown | All three application processes exited normally and removed their private connection descriptors. |

## Bundled-runtime smoke harness

`scripts/verify-packaged-design.mjs` was run by the bundled Electron with `ELECTRON_RUN_AS_NODE=1`, using the installed CLI launcher. Its Provider fixture also ran in that bundled runtime and read the reference image from `app.asar`; system Node/Python was not needed by the tested application or harness.

Results are saved to `apps/desktop/release/verification/packaged-design.json`:

- Native example: 4 states, 6 transitions, an added editable source frame, 28,313-byte exported package and a 1152×288 PNG contact sheet.
- Generated fixture: exactly one local image Provider request, successful bundled postprocessing to 1024×1024 with alpha, approval and a 1,009,760-byte exported package.
- External paid Provider calls: 0. The temporary fixture Provider was removed after verification.

## Review and corrections

Independent reviews covered desktop service/window isolation, production package installation, native rendering/runtime, command persistence, workspace synchronization and native authoring. Findings were corrected and re-reviewed: navigation/frame-origin boundaries, failed-window initialization cleanup, native target bridges, linked-project save acknowledgements, identity conflict recovery, layer ordering, process shutdown, conservative failed-attempt budgets, atomic retries, and atomic animation/repeat saves.

Actual GUI inspection additionally caught and corrected a branded icon being used as the default pet, an oversized implicit CSS Grid row hiding the canvas, and desktop publishing text that incorrectly described subscription delivery.

These checks establish deterministic artwork handling and usable workflows. The Lottery drawing is an original prototype; this report does not assert Stardew Valley production-art quality.
