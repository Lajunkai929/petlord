# PetLord local creation and visual system

The user requests left-click as the default interaction, a light minimal interface using the dog's and logo's colors, consistent light/dark themes across the application, mature accessible components, editable imported pets, direct local updates, and smoother pointer gaze. They explicitly delegate detailed product design to the assistant.

## Product decisions

- Default to a light theme. Use warm cream surfaces, charcoal/brown text, honey/caramel emphasis and the logo's coral only for an appropriate semantic accent. Dark mode uses warm charcoal and the same honey palette. Remove green brand colors across desktop settings, Studio, editors, dialogs and runtime panels. Preserve transparent desktop pet windows and original image pixels.
- Use the existing Ant Design component system for reusable form selection, switches, numeric controls and feedback; retain existing Radix dialogs where they already provide focus trapping and keyboard behavior. Shared tokens drive both apps. Controls need names, visible focus, keyboard navigation, disabled/loading/error states and portal compatibility.
- A project is an editable working copy. Saving keeps local edits. A clear primary action applies the saved approved snapshot directly to the local pet. Package files are for sharing or transfer, not a required step for local work.
- Saving a native pixel canvas refreshes its already-bound state images and animation frames in one revision-checked operation. Existing immutable media remains available; new unbound frames still require an explicit state/animation assignment. Local apply then uses the refreshed approved snapshots.
- Track project-to-installed-pet association. Updating a linked local pet replaces its own installation even after renaming, preserves the association and avoids duplicate projects on sync. New/unlinked projects can be used on this device without overwriting an unrelated installation by name. Show whether the linked pet is active and whether edits remain to be applied.
- Provide an Edit action for an installed pet, opening the corresponding Studio project. Keep import/export and portable source support. Imported old packages remain editable with accurate source limitations.
- New interaction defaults use left-click. Retain intentionally configured double-click gestures; migrate known bundled/example defaults rather than rewriting arbitrary user-authored triggers. Single-click-only states should respond without waiting for an unused double-click gesture.
- Optimize gaze based on the existing video pipeline and observable evidence. Avoid issuing video seeks faster than decoding, keep the latest target, smooth motion and preserve interruption, state transition, alpha and native pixel behavior.

## Acceptance

1. Fresh startup is light; light/dark selections persist and integrated settings/Studio stay consistent. Main screens and portals use the brand palette without green selected states.
2. A keyboard user can open/select/close key selectors, reach labeled controls, and see focus. Existing dialogs retain focus restoration and Escape behavior.
3. Import → edit → save → update on this device refreshes the intended installed pet immediately, including renamed projects, without another file round-trip, subscription step or duplicate project. Other pets remain intact. Stale revisions/errors are visible.
4. New sample and trigger defaults use left-click; custom double-click behavior remains available and single-click-only dispatch is prompt.
5. Gaze scheduling does not repeatedly cancel in-flight seeks; tests cover rapid target changes, pause/interruption and cleanup. Actual installed gaze media is examined in the packaged app.
6. Run relevant tests, full typecheck/build, independent review, and both-theme native GUI checks. Back up user data before upgrading the running app; verify current pet/project preservation and produce an updated arm64 installer.
