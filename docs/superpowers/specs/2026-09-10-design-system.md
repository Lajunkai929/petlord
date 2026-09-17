# PetLord shared design system

The user requests a consistent component library, typography, control dimensions and corner radii, with a repository Skill referenced by AGENTS.md. The attached green New Project screenshot is older than the current 0.1.9 interface. Keep the current dog/Logo palette: warm white, brown/caramel, warm dark neutrals. The user's prior explicit design delegation authorizes implementation and verification without another design approval.

## Decisions

- `@petlord/ui` is the application component entry point. Ant Design remains the controls implementation; Radix remains the accessible dialog lifecycle. Reuse their keyboard, focus, disabled, loading and validation behavior. Bespoke canvas/graph interaction surfaces remain domain components.
- Centralize CSS and Ant Design values in one checked-in token source. Preserve existing colors. Standard control height is 36 px, compact 28 px, large 44 px; standard control text is 14 px. Roles: metadata 12, small 13, body 14, section 16, dialog title 20, page title 24, exceptional display 32. Preserve the existing user font-size preference through shared role values.
- Radius roles: small/badge 4, control 8, panel/choice 12, dialog 16; circles and straight geometry are explicit exceptions. Spacing uses 4/8/12/16/20/24/32 px tokens. Font weights are 400/500/600/700, standard buttons 600.
- Native text/number fields, standard action buttons and library controls must share metrics. A SelectField wrapper provides layout only, with no second painted box. File/color/range inputs, drawing swatches, state nodes and native media geometry retain their purpose-specific behavior.
- Rebuild New Project on shared mature controls: name, optional identity, pet name, style, state template and optional prompt details. Avoid a tall stack of identity cards; keep choices keyboard accessible and allow a fresh pet without an identity. All fields and footer actions align, have predictable dimensions, and fit a 1280 × 800 laptop. Preserve the unified project semantics and prompt remapping.
- Keep object creation and multi-field configuration in dedicated dialogs. Dialog surfaces, headings, footers and close controls follow one shared contract. Use inline editing for already-selected object properties.
- Add a project-local `.agents/skills/petlord-design-system/SKILL.md`, discoverable from root `AGENTS.md`. Rules cover both Studio and desktop, standard component imports, token ownership, overlays, accessibility and verification. It must not govern unrelated backend or art-content changes.
- Add a working check to the repository's check command. Detect duplicated token output, bypassing the UI component boundary, arbitrary UI font sizes/radii and painted SelectField wrappers. Do not police image pixels or media dimensions.

## Acceptance

Current New Project inputs, selectors and footer buttons measure 36 px with the same 14 px font and 8 px control radius; compact controls use the explicit 28 px role. Light/dark remain warm. Existing identity/style/provider/import/subscription dialogs align with the same tokens. Keyboard navigation, nested selector Escape, canceled creation, form errors and loading still work. The Skill passes its validator and the automated design check catches deliberate violations. Full tests/types/build, installed UI workflows and screenshot review must pass before the local app is upgraded. Preserve the recently imported 7 projects, 10 styles, 7 identities, 3 installed pets and all user settings.
