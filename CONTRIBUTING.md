# Contributing to PetLord

PetLord welcomes improvements to desktop interactions, native pixel tools, Agent integrations, model adapters, and documentation.

Use Node.js 22.13 or newer, install with `npm ci`, and run `npm run dev` for Studio. Run `npm run check` before opening a pull request. It checks public-release privacy, the shared design system, types, tests, and production builds.

For a bug report, include your OS, PetLord version, exact steps, expected result, and actual result. Prefer a small synthetic pet or test fixture. For an adapter, describe the protocol and use fake credentials in tests; never submit a live key or perform paid calls in the test suite.

UI changes must follow [the PetLord design-system Skill](.agents/skills/petlord-design-system/SKILL.md) and shared tokens. Keep unrelated artwork and existing local edits out of your change.

Before sharing a screenshot or `.petlord` package, inspect what it contains. Editable packages may include identity references and prompts. Do not attach private photos, task content, local database files, connection descriptors, or settings. See [public release privacy checks](docs/public-release-privacy.md) for the gate's scope and limits.

Keep changes focused and explain the resulting behavior and relevant validation. Report the platforms you actually tested; a packaging target alone does not establish working support.
