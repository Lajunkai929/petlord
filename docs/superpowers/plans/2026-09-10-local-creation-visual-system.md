# Local creation and visual system implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent scoped tasks, with one implementation specialist at a time and controller integration.

**Goal:** Make PetLord visually consistent, accessible, responsive, and directly editable on the device where it runs.

**Architecture:** Shared warm brand tokens and Ant Design adapters serve the two existing React applications. The local design service records installation association and applies revision-checked approved snapshots through the desktop package store. A bounded gaze scheduler replaces repeated seek cancellation.

**Tech Stack:** Electron, React, TypeScript, Ant Design, existing Radix dialogs, SQLite and Canvas/video.

**Spec:** `docs/superpowers/specs/2026-09-10-local-creation-visual-system.md`

## Global constraints

- Default light; cream, charcoal/brown, honey/caramel. Both themes cover desktop, Studio, forms, portals and panels.
- Preserve transparent pet windows, native pixel edges, user packages, custom gestures and existing project edits.
- One implementation specialist at a time. No child agents from workers. No public publishing, remote provider spend, or real Codex configuration changes.
- New local updates must preserve project/installation identity and reject stale project edits.

## Task 1 — Gaze and click responsiveness

Files: `packages/runtime-react/src/index.ts`, `RuntimeMediaCanvas.tsx`, focused scheduler/test files, runtime-core pointer tests if needed. Desktop runtime hook only when needed for pointer dispatch. Main process read-only.

- [x] Reproduce rapid pointer target behavior and identify cancellation/render overhead.
- [x] Write a test for a pending decode followed by multiple targets; latest target must eventually render, in-flight decode must not be canceled, cleanup must stop updates.
- [x] Implement bounded scheduling/smoothing and retain alpha, transition interruption and native frame behavior.
- [x] Test immediate single-click dispatch when no double-click trigger is available and preserve configured double-click arbitration.
- [x] Report root cause, covering test results and any main-process integration recommendation; independent scoped review.

## Task 2 — Shared brand and accessible controls (controller)

Files: shared `packages/ui` theme/control adapter, both app dependencies, `uiTheme.ts`, theme hooks/bridges, desktop settings and Studio forms, both CSS files.

- [x] Extract the logo palette and implement shared light/dark tokens; initialize light without a dark flash.
- [x] Replace branded hardcoded greens, including selected controls, canvas chrome, toasts and plugin panels; use the actual logo in Studio.
- [x] Add Ant Design selectors with native-compatible change values and accessible labels, then migrate existing selectors. Use mature switches and segmented choices alongside semantically native numeric/text inputs. Retain existing accessible modal behavior.
- [x] Persist and synchronize theme in the integrated desktop using a narrow authenticated Studio bridge; standalone Studio uses its local preference.
- [x] Verify keyboard interaction, labels, portals, contrast and both themes in the native app.

## Task 3 — Direct local creation loop

Files: `installedPackages.ts`, DesignService/commands/server ports, package-store and Studio host/main/preloads, new local-installation hook/publish component, desktop Edit action, focused API/desktop tests.

- [x] Add read-only local binding/status and revision-checked apply operations. Store package key, project ID and applied revision after successful installation.
- [x] Test import/edit/rename/apply/restart/resync: one project and one intended installation, with unrelated pets unchanged.
- [x] Apply directly to the linked installation. New projects create their own installation; explicit replacements validate their target. Successful application refreshes desktop playback immediately.
- [x] Record the resulting package fingerprint before any automatic sync can reconstruct a duplicate.
- [x] Open the linked Studio project from an installed pet's Edit action.
- [x] Design the primary publish area around Update on this device / Use on this device, applied/draft status and preview; place Export for sharing and optional subscription below.
- [x] Cover revision conflicts, unavailable desktop mode and per-file failures; independent scoped review.

## Task 4 — Defaults and release validation

Files: bundled/native example/template trigger creation, related regression tests, version/docs/package resources.

- [x] Use left-click for new interactions and known bundled defaults; preserve user-customized triggers.
- [x] Full tests/typechecks/build and final scoped review; fix confirmed regressions.
- [x] Back up normal user data, verify application upgrade, both themes, direct local apply and imported editing with the actual installed pets.
- [x] Package an arm64 test build, verify signature/container, document measurable improvements and practical limits, commit local changes.

## Additional closure completed

- [x] Added explicit `pixel.document.save` to refresh existing native state/animation bindings in one CAS operation, preserving immutable history and behavior. Studio uses it and retains source/timeline conflict protection.
- [x] Verified exact pixel edits through the packaged application and real installed gaze media; see `docs/local-creation-visual-system-verification.md`.
