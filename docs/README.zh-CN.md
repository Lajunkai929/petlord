<p align="center"><a href="../README.md">English</a> · <strong>简体中文</strong></p>

<h1 align="center">PetLord</h1>

<p align="center">
  <img src="../assets/petlord-banner.png" alt="PetLord" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-20232A?style=flat-square&amp;logo=react&amp;logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Electron-191970?style=flat-square&amp;logo=electron&amp;logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&amp;logo=sqlite&amp;logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-333333?style=flat-square" alt="macOS, Windows and Linux" />
  <a href="../LICENSE"><img src="https://img.shields.io/badge/License-MIT-97C83E?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">用可复用的形象、风格与动作模板，批量创作可交互的桌面搭子。</p>

## PetLord 提供什么

PetLord 提供两套可组合、可复用的创作能力：

- **状态及过渡动作模型**：控制桌面搭子在什么情况下展示什么动作。
- **风格模板与形象模板**：复用风格和角色形象，支持批量创作桌面搭子。

创作平台与桌面客户端相互独立：在创作平台实时预览，快速创作、快速验证；完成后的宠物在桌面客户端独立运行。

[![PetLord 产品演示](../assets/petlord-demo-cover.png)](../assets/petlord-demo.mp4)

**[▶ 播放完整演示视频（35 秒）](../assets/petlord-demo.mp4)**

![PetLord 桌面客户端](../assets/petlord-desktop.png)

## 状态及过渡动作模型

为点击、双击、悬停、拖拽、空闲和定时等条件配置动作，决定桌面搭子何时切换状态、播放什么过渡动作。

![PetLord 状态及过渡动作网络](../assets/petlord-state-graph.png)
