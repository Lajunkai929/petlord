<p align="center"><strong>English</strong> · <a href="docs/README.zh-CN.md">简体中文</a></p>

<h1 align="center">PetLord</h1>

<p align="center">
  <img src="assets/petlord-banner.png" alt="PetLord" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-000000?style=flat-square&amp;logo=apple&amp;logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows-0078D4?style=flat-square&amp;logo=windows11&amp;logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat-square&amp;logo=linux&amp;logoColor=black" alt="Linux" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-97C83E?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">Create interactive desktop companions at scale with reusable identity, style, and motion templates.</p>

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

PetLord requires Node.js 22.5 or newer. No API token is required to start the project.

```bash
git clone https://github.com/Lajunkai929/petlord.git
cd petlord
npm install
npm run dev
```

Open `http://localhost:4310`, then choose **Models & Providers** in the graph toolbar. Add image and video Providers independently; credentials stay in the local `runtime-data/petlord.sqlite` database and are never returned by the settings API. Multiple Providers of each kind can be saved and selected per project.

Run `npm run check` before submitting a change. It performs type checking, tests, and production builds for every workspace.
