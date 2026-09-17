# Unified project authoring

The user rejects a project-level choice between native pixel and AI-generated production. Their explicit design delegation and requirement to finish and verify persist. Treat this as one pet project with multiple tools and media sources.

## Product decisions

- Remove production-route selectors from both the project header and New Project. A project has one state/action graph; uploaded, generated and pixel-authored state assets can coexist.
- Creation views are **状态与动作**, **绘图**, **预览**, **发布**. All projects expose all four. Graph is the default editing surface; drawing opens the existing deterministic pixel editor as a tool for the same project. Native transitions link to drawing; state inspectors offer drawing alongside generation/upload. Navigating tools never changes project data or a production-route field.
- New projects need a project name and pet name. An existing identity is an optional reusable source, not a prerequisite for offline drawing/import. Do not silently substitute an unrelated active identity when the user chooses a new pet.
- Independent projects can later attach a reusable identity, upload project-owned character references, or use an authored state image as a character reference. The same project can then generate images when a provider is configured. Reference configuration uses a focused dialog and preserves deliberate existing artwork.
- Pixel metadata lives on images and animation frames. Thumbnail rendering follows the selected image's native metadata, not a project-wide route. Runtime keeps exact native pixels and explicit frame timing while video/generated assets retain their current behavior.
- Keep old productionRoute fields readable/accepted for compatibility, but remove their UI branching, forced writes during pixel save/set/import/example creation and misleading default classification in command summaries. Existing user source/approved assets are preserved.
- Pixel source drafts must survive tool navigation. Expose their pending state across views and prevent preview/publish from implying unsaved drawings have been applied. Saving refreshes already-bound assets as before. Entering drawing from a selected state/animation selects its associated native frame when available.
- Every unsaved drawing or animation draft has a clear discard action. Incompatible native animation endpoints have explicit guidance and cannot submit an invalid bind. Discard restores the existing project data and releases the publish guard.
- Keep dedicated object editing direct; creation/configuration still use the established dialogs, shared controls, warm default light/dark themes and left-click behavior.

## Acceptance

1. Create a project with no identity and no route field. Creation and project UI contain no route switch.
2. The same project exposes drawing, imported assets and AI generation controls without project conversion; old native/generated projects receive the same tools.
3. API integration proves native authoring does not force a mode and native plus generated/imported assets coexist through edit, approval, export and runtime metadata.
4. Existing native frame pixels, state/animation bindings and durations survive the unified UI. Tool navigation preserves unsaved drafts and saving makes preview/publish available.
5. Run focused regressions, independent reviews, full checks and actual packaged UI/native/mixed-media flows. Build a new macOS arm64 installer, back up/update the local app and verify project/pet/config preservation.
