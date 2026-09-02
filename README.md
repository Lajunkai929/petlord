<p align="center"><strong>English</strong> · <a href="docs/README.zh-CN.md">简体中文</a></p>

<h1 align="center">PetLord</h1>

<p align="center">
  <img src="assets/petlord-banner.png" alt="PetLord" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-20232A?style=flat-square&amp;logo=react&amp;logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Electron-191970?style=flat-square&amp;logo=electron&amp;logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&amp;logo=sqlite&amp;logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-333333?style=flat-square" alt="macOS, Windows and Linux" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-97C83E?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">Create interactive desktop companions at scale with reusable identity, style, and motion templates.</p>

## What PetLord provides

PetLord provides two composable, reusable creation systems:

- **State and transition model**: control which action a desktop companion performs and when.
- **Style and identity templates**: reuse visual styles and character identities to create desktop companions in batches.

The Creator and Desktop Client are separate: preview changes in real time to create and validate quickly, then run finished companions independently in the Desktop Client.

[![PetLord product demo](assets/petlord-demo-cover.png)](assets/petlord-demo.mp4)

**[▶ Watch the full demo (35 seconds)](assets/petlord-demo.mp4)**

![PetLord Desktop Client](assets/petlord-desktop.png)

## State and transition model

Bind actions to clicks, double-clicks, hover, drag, idle time, timers, and other conditions to control when a desktop companion changes state and which transition it plays.

![PetLord state and transition graph](assets/petlord-state-graph.png)
