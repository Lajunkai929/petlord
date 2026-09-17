# Open provider workflows implementation plan

Spec: docs/superpowers/specs/2026-09-10-open-provider-workflows.md
Baseline: 5e3454e, current branch codex/agent-design-desktop. Preserve assets/experiments and all real user data. One implementation specialist at a time; controller implements independent UI. Independent reviewers do not modify files.

## Task 1 — Provider data and adapters (specialist)

Files: packages/generation/src/index.ts; generation-api providers/*, associated persistence/API guards and tests.

- Add catalog presets/protocol metadata and persisted preset/model lists with legacy defaults.
- Implement actual OpenAI-compatible and SiliconFlow image adapters; retain/customize existing Ark image/video validation. Use current official docs and local fixture servers.
- Cover custom model passthrough, reference image translation, URL/key validation, update preservation, failed authentication, empty responses and restart persistence. No real keys or paid network requests.
- Report exact public contract and scoped test evidence, then independent review.

## Task 2 — Complete application configuration UX (controller)

Files: Provider workspace/editor components, GenerationSettingsDialog, App/navigation/controller, IdentityLibraryWorkspace, StyleLibraryWorkspace, their hooks/tests and scoped CSS.

- Add the global Model Services workspace with all providers and Add/Edit/Test/Enable/Delete actions.
- Add a two-step preset/configure modal using Ant Design and accessible dialog behavior, model tag entry and protocol selection. Cancel never mutates settings; errors remain attached to the form.
- Keep project generation selection/output settings focused; add navigation to services and remove all inline provider editor state/form.
- Replace inline identity/style creation forms with focused name dialogs. Keep dedicated current-entity editor controls.
- Verify keyboard, validation, cancel/reset, key preservation, custom list and light/dark presentation.

## Task 3 — Integration, verification and release (controller)

- Review the data/UI interface and fixes; run full types/tests/integrated builds.
- Exercise fake-provider add/edit/cancel/test/delete in an isolated packaged app and verify provider metadata remains after restart, with no real provider writes.
- Bump version, build and verify arm64 test installer, back up user profile and upgrade the current local application, preserving projects/pets/providers and Codex configuration.
- Update docs/verification, commit locally, deliver usage path and actual limitations. No push or public publication.

## Completion record

All three tasks are implemented. Backend and UI review findings were corrected and independently closed. Final full suite: 100 files / 429 tests; three app typechecks and integrated builds pass. Browser and packaged application workflows pass in isolated profiles. The verified 0.1.7 arm64 installer was built, the normal user profile was backed up, and the local application was upgraded with all four projects, three pets, provider snapshot and Codex configuration preserved. See `docs/open-provider-workflows-verification.md` and `docs/model-services.md` for evidence and usage. No paid live provider request, push or public publication was performed.
