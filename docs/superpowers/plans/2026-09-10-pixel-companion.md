# Pixel Companion Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for three independent modules and scoped review; the controller owns artwork, shared desktop wiring, import and packaging.

**Goal:** Finish the Lottery native pixel pet and connect its daily/working actions to desktop behavior.
**Architecture:** Native frame data uses existing deterministic rendering and transitions; schema/export support native gaze. Desktop-only motion/waste adapters are opt-in and react to completed runtime actions. Codex lifecycle events drive a dedicated working animation.
**Tech Stack:** React/TypeScript, shared UI, native pixel DSL, Electron, Node, macOS AppKit/Finder, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-09-10-pixel-companion.md.

## Global constraints

Preserve all existing data and assets/experiments. No paid provider calls, public push, implicit real desktop garbage or hook-trust bypass. Use test profiles and no actual Codex changes until the integrated button is concrete and verified. Standard UI36/28/44px, existing tokens/Skill. Desktop version target0.1.11.

### Task 1 — Native gaze (specialist)

Own schema/native gaze rendering and export/import support plus tests. Produces optional eight-direction native gaze artifact/URI collections, exposed consistently to authoring and package round-trip. Consumes existing NativePixelDocument/rendered PNGs. Do not edit desktop main/bridge/UI or artwork example. Communicate exact field shape before root creates the project bindings.

- [x] Add failing round-trip and native canvas direction/return/transition-priority tests.
- [x] Extend schema, media URI collection/remap, authoring export and NativeSpriteCanvas; preserve video gaze behavior.
- [x] Verify direction ordering, nearest-neighbor rendering, bounded preload, resize and missing-frame behavior.

### Task 2 — Desktop motion and waste (specialist)

Own new desktop companion adapter/controller/settings component and tests. Root owns main.cjs, preload.cjs, desktopBridge.ts, useDesktopRuntime.ts and DesktopSettingsWindow.tsx integrations. Consumes semantic actions `run`, `poop`, `pee`; returns bounded movement and one completion-keyed file operation. Adapter receives actual Desktop path, screen bounds, current pet bounds and enabled flag; never trusts caller paths.

- [x] Write failing tests for disabled behavior, completed-vs-interrupted actions, duplicate IDs, unique filenames, monitor clamping and owned-only cleanup.
- [x] Implement platform adapter and meaningful error results for icon/position failure; use AppKit helper for actual custom icons where available.
- [x] Provide shared-UI settings/actions component and exact bridge integration instructions; test temporary directories first, then verify real Desktop positioning with owned disposable files and cleanup.

### Task 3 — Codex lifecycle notifications (specialist)

Own new Codex notification modules, helper updates, Agent activity plugin/controller, CodexDesignSettings.tsx and tests. Root owns shared Electron main/bridge/preload wiring. Inputs are official hook JSON; output existing AgentEvent with working/needs-attention/turn-completed states and bounded public headings. Preserve prior notifier and hooks; don't alter actual user config during development.

- [x] Verify current official hooks docs and local Codex support; write failing lifecycle/config-preservation tests.
- [x] Implement install/status/repair/test, hook payload normalization and optional visible-heading extraction with fallback.
- [x] Working event starts `working`/`dig` semantic loop; completion/attention interrupts it, multiple sessions don't prematurely clear work. Provide exact root wiring contract.

### Task 4 — Artwork and root integration (controller)

- [x] Read/render existing48×48 frames. Add native frame data for all requested poses and loops, return transitions,8-direction gaze and collar anchor.
- [x] Integrate specialist contracts into desktop IPC/settings/runtime and API authoring, retaining drag/default-left-click behavior.
- [x] Build completed project in an isolated service, validate/export/render every state/transition, inspect enlarged sprite sheets and animations, and correct art/logic defects.
- [x] Scoped reviews, full checks, candidate0.1.11 and actual packaged action/file/notification/UI tests.
- [x] Back up local app/data, upgrade, update the existing native project and install/activate its complete companion. Verify untouched other projects/styles/identities/packages, exact asset hashes, local CLI and Codex setup outcome; record evidence and commit locally.

Final result: installed 0.1.11; existing Lottery project revision 47, 12 states / 78 frames / 36 transitions, active installation synchronized. Source and verification notes: `docs/pixel-companion.md` and `docs/pixel-companion-verification.md`. Real Codex config remains unchanged; the verified setup button requires Codex’s first-use `/hooks` review.
