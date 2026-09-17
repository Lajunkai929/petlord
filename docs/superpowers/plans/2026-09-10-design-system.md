# PetLord Design System Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the bounded New Project task and scoped reviews; the controller owns shared tokens, remaining integration and repository guidance. Keep file ownership separate.

**Goal:** Ship a consistent, enforced dog/Logo-based component system in both installed applications.
**Architecture:** A shared token source drives generated CSS variables and Ant Design theme values; shared UI exports own primitive behavior and a repository checker enforces the boundary. Domain layouts consume semantic size/radius tokens.
**Tech Stack:** React, TypeScript, Ant Design, Radix Dialog, CSS, Vitest and packaged Electron/Playwright.
**Spec:** `docs/superpowers/specs/2026-09-10-design-system.md`.

## Global Constraints

Preserve the existing warm palette, default light theme, unified project model, left-click defaults and local editing/apply flow. Preserve user data (7 projects, 10 styles, 7 identities and 3 pets). Do not touch assets/experiments, external credentials or real Codex configuration. No paid generation or public push. Controls: 36/28/44 px, fonts 12/13/14/16/20/24/32 px, radii 4/8/12/16 px. The source token file is authoritative.

### Task 1 — Shared tokens and controls (controller)

Files: `packages/ui/src/{tokens.json,theme.ts,theme.css,index.tsx,controls.test.ts}`, new generated token CSS and base control CSS; `apps/studio/src/{App.tsx,styles.css}`, `apps/desktop/src/{main.tsx,styles.css}`.

- [x] Capture installed New Project metrics and screenshot in `.superpowers/sdd/design-system/`.
- [x] Expose Button/Input/TextArea/Radio/Alert/ConfigProvider through `@petlord/ui` with existing Ant Design props, plus `FormField` and shared dialog frame classes.
- [x] Make theme token values read the single source, generate CSS variables, apply the font preference to the same role values, and remove the Studio-wide small-control override.
- [x] Tokenize existing application fonts/radii and standard controls; remove visual styling from SelectField wrappers without removing their layout widths.
- [x] Verify shared control keyboard/form/overlay behavior with `npx vitest run packages/ui/src/controls.test.ts` and types.

### Task 2 — New Project (specialist)

Own `apps/studio/src/components/NewOrderDialog.tsx`, new `NewOrderDialog.css`, and relevant new-project tests. Consume the shared exports from Task 1; do not edit shared tokens or global CSS.

- [x] Preserve no-route/optional-identity creation and materialized-name remapping tests.
- [x] Use shared library controls, a compact identity selector/preview, explicit accessible template choices and aligned fields/footer.
- [x] Add keyboard selection and cancel/error regressions where behavior changes; run the relevant New Project/creation tests.
- [x] Report files, validation and any integration needs for scoped review.

### Task 3 — Remaining component integration and guidance (controller)

Files: current standard forms in Studio and desktop, `AGENTS.md`, `.agents/skills/petlord-design-system/SKILL.md`, `docs/design-system.md`, `scripts/check-design-system.mjs`, token-generation script and `package.json`.

- [x] Route standard primitive imports through the shared UI package and bring remaining text/action controls and dialog headings/footers onto the shared metrics.
- [x] Add `npm run check:design` with an actual token/CSS/import boundary check; include it in `npm run check`. Verify that a deliberate token drift and raw metric violation are rejected, then restore valid content.
- [x] Write the project-local Skill and root AGENTS routing, with concrete component/token references and state/keyboard/screenshot checks. Validate with the skill-creator `quick_validate.py` script.

### Task 4 — Review and installed verification (controller)

- [x] Independent scoped reviews of shared system, New Project and development guidance; close actionable findings.
- [x] Run `npm run check`; verify light/dark controls and small-laptop New Project with computed metrics, keyboard, dropdown Escape and focus return.
- [x] Build a separate 0.1.10 candidate and run the five existing packaged regressions plus design-system checks; inspect screenshots. Verify codesign and DMG.
- [x] Back up and upgrade the local app; compare complete workspace entities, media/package hashes, active pet and settings. Record results, update this plan and commit locally.

## Delivery evidence

Installed 0.1.10 verified on 2026-09-10; see `docs/design-system-verification.md`. Full check:110 files /495 tests. Two themes, three font preferences and three control sizes passed rendered measurements; all five packaged workflows passed. Upgrade retained 7 projects,7 identities,10 styles,3 pets and297 media files.
