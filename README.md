<p align="center"><strong>English</strong> · <a href="docs/README.zh-CN.md">简体中文</a></p>

<h1 align="center">PetLord</h1>

<p align="center">
  <img src="assets/petlord-banner.png" alt="PetLord" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-000000?style=flat-square&amp;logo=apple&amp;logoColor=white" alt="macOS" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-97C83E?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">Draw a desktop companion. Give it a personality. Let it keep you company while your coding agent works.</p>

PetLord combines an editable pixel-art Studio, optional AI animation, and an independent desktop pet. Start with the bundled native pixel companion for free, then change its drawings, actions, and reactions.

- **Create without a model account.** Native pixel frames, layers, palettes, and animation timelines work offline and have no generation charge.
- **Make interactions your own.** Connect states to clicks, dragging, mouse direction, idle time, and timers; preview changes before using them on your desktop.
- **See your coding agent at work.** The Codex integration can trigger working, completion, and attention animations. Setup and hook trust are explicit; task activity stays local.
- **Keep editing after sharing.** A `.petlord` package can include verified editable source, so a companion can be imported and customized again.

See [the native companion](docs/pixel-companion.md), [Agent and MCP setup](docs/agent-design.md), and [model services](docs/model-services.md).

## What PetLord provides

PetLord provides two composable, reusable creation systems:

- **State and transition model**: control which action a desktop companion performs and when.
- **Style and identity templates**: reuse visual styles and character identities to create desktop companions in batches.

The Creator and Desktop Client are separate: preview changes in real time to create and validate quickly, then run finished companions independently in the Desktop Client.

![PetLord product demo](assets/petlord-demo.gif)

![PetLord Desktop Client](assets/petlord-desktop.png)

## State and transition model

Bind actions to clicks, double-clicks, hover, drag, idle time, timers, and other conditions to control when a desktop companion changes state and which transition it plays.

![PetLord state and transition graph](assets/petlord-state-graph.png)

## Run locally

Use Node.js 22.13 or newer (Node.js 24 LTS is recommended). No API token is required to start or create a native pixel companion.

```bash
git clone https://github.com/Lajunkai929/petlord.git
cd petlord
npm ci
npm run dev
```

Open `http://localhost:4310` to use Studio. With the development server running, this command creates a fresh editable sample without a paid generation call:

```bash
npm run design -- example lottery --endpoint http://127.0.0.1:4312
```

For AI artwork, choose **Models** in Studio's sidebar and add image and video services independently. Credentials stay in the local `runtime-data/petlord.sqlite` database and are never returned by the settings API. Generation uses your selected provider and may incur that provider's charges.

The integrated Desktop Client includes Studio, CLI, and MCP. Desktop packaging commands and Agent setup are documented in [the design protocol guide](docs/agent-design.md).

### Platform status

Current desktop and integration verification covers **macOS arm64**. Generated-image foreground extraction uses Apple Vision and requires **macOS 14 or newer**. Native pixel authoring, media import, and package export do not use Vision. Windows and Linux packaging targets exist, but end-to-end verification is still pending.

Run `npm run check` before submitting a change. It performs type checking, tests, and production builds for every workspace.

Contributions and reproducible bug reports are welcome. Read [the contribution guide](CONTRIBUTING.md) and [public release privacy checks](docs/public-release-privacy.md) before attaching files. Share synthetic examples; keep API keys, local profiles, task content, and private reference photos out of public issues and packages.

## Publish to the Desktop Client

The normal handoff no longer requires exporting and re-importing a file:

1. In Studio, open **Publish** and choose **Publish to client subscription**.
2. Open the Desktop Client settings and refresh the default subscription at `http://127.0.0.1:4312`.
3. Choose **Import and use**. A package with the same name is updated in place; a new name creates another local configuration.

Published versions are immutable, content-addressed `.petlord` files under `runtime-data/published-packages/`. The Desktop Client verifies the package again before installing it. Manual `.petlord` download and import remain available as an offline fallback.

For a remote subscription server, enter its HTTPS origin in the Desktop Client. The built-in generation API binds only to loopback. Hosting a remote subscription service requires a separately secured deployment.
