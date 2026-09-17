# Unified project authoring implementation

Spec: `docs/superpowers/specs/2026-09-10-unified-project-authoring.md`. Baseline `18e9b82`, current feature branch. Preserve assets/experiments and real user data. User design delegation supersedes another design-approval pause.

## Task 1 — Source and mixed-media contract (specialist)

Own schema/design-core/native/import/API files and targeted tests. Keep legacy route fields compatible but stop forcing route during native edits, reconstructed imports and example creation. Remove misleading fallback route from summary output; discovery labels the legacy hint accurately. Verify an ordinary project can hold native and generated/imported approved media and export/play metadata without changing a project type. Preserve legacy source, native geometry/timing and all existing apply/import rules.

## Task 2 — One project, complete tools (controller)

Own Studio: remove route controls/branching; add universal drawing view and selection-aware entry points; optional identity/new-pet project creation; data-driven thumbnails; shared draft state so navigation preserves work and preview/publish respects unsaved pixel source. Keep default graph/state/action editing and existing styles, dialogs and provider workflows. Write focused behavior regressions and inspect real UI.

## Task 3 — Review, package and upgrade (controller)

Independent scoped reviews of both tasks, fix actionable findings, run full checks and actual packaged unified-project flows. Build0.1.9 in a separate candidate directory, verify signature/DMG, back up then replace normal0.1.8 application, confirm user projects/pets/config preserved. Update usage/verification docs and commit locally; no paid provider calls/public push.

## Completion

All three tasks are complete. One project now exposes the graph, drawing, preview and publish views; project references enable later generation without changing project type. Mixed-media/backend, core reference preservation, UI and atomic reference persistence reviews passed. Full check: 108 files / 484 tests, types and workspace builds. The final 0.1.9 package passed all five actual desktop workflows and both themes, including retained drafts and same-key local updates. Normal app upgraded after backup; all four projects, three package hashes and user configuration preserved. See `docs/unified-projects-0.1.9.md`. No paid provider calls, real Codex configuration edits or public push.
