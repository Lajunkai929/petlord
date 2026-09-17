# Open provider configuration and application forms

The user rejects creation/configuration forms expanding inline inside the Studio's existing content. They request proper application interactions and an open provider system: choose a vendor preset or Other, then edit Base URL, API key, model IDs and protocol. The prior explicit delegation of detailed product design remains in effect.

## Product design

- A global Model Services workspace lists every saved connection, including disabled providers. Add/Edit use a focused accessible modal. Add starts with vendor selection, then a configuration form. Cancel writes nothing; saving validates fields, displays errors in the form, preserves a blank replacement key on edit and closes only on success.
- Project generation settings select a saved image/video connection, model and output settings. A Manage Services action opens the global workspace. Provider create/edit fields never appear inline in either view.
- Initial vendor presets: Volcengine Ark, OpenAI, SiliconFlow; Other uses the same editable fields. Vendor preset identity is independent from the wire protocol. Protocols initially have real adapters for Ark image/video, OpenAI-compatible Images and SiliconFlow Images. Unsupported capability/protocol combinations are explicitly unavailable rather than advertised as working. More presets/protocols can be added through the catalog.
- Every connection persists its model list. Model IDs are user-editable; a vendor's hardcoded list is a default, not a validation whitelist. Legacy Ark configurations preserve their URL, secret, IDs and default model behavior.
- API keys remain server-owned after saving; responses contain a masked hint. No real user credentials are installed, tested or used during development. Adapter tests use local fake servers and real PNG fixtures, without provider generation charges.
- New Identity and New Style actions use modals rather than header forms. Existing dedicated editing surfaces and contextual inspector controls remain direct editors. Read-only disclosure panels are not creation forms.
- Retain the warm light/dark brand theme, mature controls, keyboard/focus handling and the existing local editing/apply workflow.

## Data contract

Keep the existing `type` field as the protocol adapter identifier for backward compatibility, expanded beyond `volcengine-ark`. Add optional `presetId` and persisted `models: GenerationProviderModel[]` to configurations and save inputs. Catalog entries gain an optional stable preset `id` (fallback to type for legacy clients). Snapshot gains `protocols` metadata (id, label, description, capabilities) for selectable actual adapters. Existing clients/fixtures may omit new metadata and receive safe legacy defaults. Registry updates accept protocol and models, validate capability consistency and refuse changing a provider used by active jobs through existing API/service guards.

## Acceptance

1. Add/Edit Provider, New Identity and New Style have named dialogs, keyboard focus, cancellation and visible validation; no inline creation form.
2. At least three documented vendor presets and a complete Other path work. Manual model IDs survive create/edit/restart and reach the chosen adapter unchanged.
3. Existing Ark image/video integrations remain compatible; custom models work when configured. New image adapters honor reference images instead of silently dropping them.
4. Verify adapter request/response translation, model validation, credentials, failed/blank-key edits and legacy persistence with meaningful tests.
5. Verify both themes and a complete add-other/edit/cancel/delete workflow in isolated browser/Electron profiles, then build/package and upgrade the local app with a backup. Do not replace or add real user providers as a test.
