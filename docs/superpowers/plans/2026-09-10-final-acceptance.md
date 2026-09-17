# Final acceptance and correction pass

Baseline: `3460f82`. The user requires every previously raised issue to be finished and independently verified, with design decisions delegated. Existing specs for agent design, local creation/visual system and open Provider workflows remain the acceptance criteria. Work stays on the current feature branch; preserve `assets/experiments`, real projects/pets/providers and Codex configuration. No paid generation or public publishing.

## 1. Installed-pet associations

Correct the reproduced cases where identical imports under separate installation keys lose an Edit association and where deleting an imported project leaves a stale binding. Each deliberate keep-both installation must remain independently editable and update its own key. Reconcile missing projects without overwriting surviving local edits or duplicating normal upgrades/sync. Add failing regression tests first, then implement and obtain scoped review.

## 2. Configuration integrity and truthful controls

Separate successful Provider mutations from subsequent failed list refreshes so a successful create is not reported as failure or retried into duplicates. Make SiliconFlow model-controlled image dimensions explicit in generation settings. Review the desktop subscription URL creation disclosure and use a focused dialog consistent with the application's form conventions. Preserve accessible control states, cancellation and brand themes.

## 3. Agent and packaged acceptance

Verify one-click Codex registration through the real packaged UI in an isolated config, then use its registered MCP launcher to read/edit/render artwork and reconnect after restart. Investigate the review's bounded job-wait/client-timeout mismatch and correct it with a reproducible test if confirmed. Re-run the native canvas save → renamed same-key update → changed pixels on desktop path, single-click playback, gaze seek scheduling, Provider CRUD, and both themes against the final package.

## 4. Release and evidence

Run full types/tests/builds after fixes, independent scoped reviews, and signature/installer verification. Back up and update the normal local app if production changes require a new build; verify all installed pets, project associations, active pet, provider snapshot and Codex configuration. Produce one consolidated acceptance record mapping all user requests to actual evidence, distinguish artwork judgment and real paid-provider limits, then commit locally.

## Completion

All four tasks completed. Independent reviews closed the import/recovery, Provider acknowledgment, model sizing, MCP timeout and Radix/Ant Design visual-type findings. Final check: 102 files /444 tests, all types/builds. Four packaged end-to-end workflows passed against the final 0.1.8 candidate. Normal local app upgraded after backup, with complete project/revision/package/settings/provider/Codex preservation verified. Consolidated record: `docs/final-acceptance-0.1.8.md`. No public push or paid provider request.
