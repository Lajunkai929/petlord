# Open provider workflows — 0.1.7

## Delivered behavior

Global **模型服务** owns connection management. Add uses a vendor picker followed by a configuration dialog; edit uses that same form. Ark, OpenAI and SiliconFlow presets provide editable defaults. Other accepts a manual Base URL, key, implemented protocol and model IDs. Model metadata survives edits and service restarts and reaches the actual generation adapter.

Project **生成设置** selects saved connections, models and output settings. It does not expand an inline connection form. Missing or disabled explicit selections remain visible until deliberately replaced. Identity and Style creation also use named dialogs with validation, cancellation and focus restoration. Ant Design controls and shared Radix dialog behavior retain the existing warm light/dark themes.

Keys remain server-owned; public snapshots expose masked hints. Empty replacement keys preserve saved credentials. Invalid updates are atomic. Editing/deleting a connection used by an active job is refused by both HTTP and Design API paths. Legacy Ark records retain their saved addresses, keys and model defaults without a read-time rewrite.

The existing budget guard accepts configured model unit estimates and rejects unknown prices before provider submission. Server estimates use the saved model and validated request, not client-supplied cost. Prototype-like model IDs, non-finite prices, arithmetic overflow and invalid budget totals have regression coverage. Estimated charges remain labeled as estimates.

## Verification

- Full suite: **100 files, 429 tests passed**, 2026-09-10 03:25 local.
- Studio, desktop and generation-api typechecks passed. Integrated desktop renderer, Studio, embedded service/CLI/MCP and native/default-pet resource builds passed.
- Backend integration uses real localhost HTTP servers, actual PNG fixtures and isolated SQLite stores. It covers all three image adapters, custom Ark video, reference translation, local media results, model/key-preserving updates, restart persistence, authentication/empty-response errors and budget refusal before network submission.
- Browser and packaged Electron workflows both passed: preset defaults, Other/custom model and estimate, cancel without writes, invalid-form recovery, masked/preserved key, connection test with only `GET /models`, enable, edit, cancel/delete, focus restoration, Identity/Style dialogs and both themes. Both recorded zero renderer page errors.
- Independent backend and UI reviews closed the inherited-price budget bypass, stale deleted-provider display and trimmed model-ID/price association findings. The final suite includes those regressions.
- No real provider credentials or paid generation requests were used. The adapters support the documented JSON Images protocols; arbitrary proxy formats and non-Ark video are not claimed.

Detailed local evidence and source screenshots remain private. Packaged tests use short isolated profile paths to fit macOS Unix socket limits and wait for Studio initialization before navigating.

## Release and local upgrade

- Installer: `apps/desktop/release/PetLord-0.1.7-arm64.dmg`, **192,634,311 bytes**.
- SHA-256: `7beac2102473aacf32b60d9a0528f8c90ac2102715356f48fe225043295b071b`.
- `codesign --verify --deep --strict` and `hdiutil verify` passed. This is a locally ad-hoc signed test build; Apple notarization was not performed.
- Previous 0.1.6 application retained at `apps/desktop/release/previous-0.1.6/PetLord.app`.
- The application was closed and a complete private backup was verified before replacement.
- The packaged **0.1.7** application and authenticated local service passed version and launch checks.

Post-upgrade checks confirmed preservation of project contents and revisions, installation associations, package byte hashes, provider settings and external configuration. Synchronization produced no duplicate imports or errors. No real provider was added, edited, tested or deleted during the upgrade. Detailed inventories, active-pet names and backup records remain private.

An earlier isolated QA process had remained alive and intercepted the first LaunchServices open. Only that identified test process tree was stopped; the normal application was then opened and the checks above completed.

User instructions: [模型服务配置](model-services.md).
