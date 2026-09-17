<p align="center"><a href="../README.md">English</a> · <strong>简体中文</strong></p>

<h1 align="center">PetLord</h1>

<p align="center">
  <img src="../assets/petlord-banner.png" alt="PetLord" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-000000?style=flat-square&amp;logo=apple&amp;logoColor=white" alt="macOS" />
  <a href="../LICENSE"><img src="https://img.shields.io/badge/License-MIT-97C83E?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">画一只桌面搭子，给它自己的性格，让它陪你和编程 Agent 一起工作。</p>

PetLord 把可编辑的像素绘画 Studio、可选的 AI 动画和独立桌面宠物放在一起。先免费使用内置原生像素宠物，再修改画稿、动作和互动方式。

- **没有模型账户也能创作。** 原生像素帧、图层、调色板和动画时间线可离线使用，不产生生成费用。
- **自己定义互动。** 把状态连接到点击、拖拽、鼠标方向、空闲和定时条件，预览后再应用到桌面。
- **让宠物响应 Agent。** Codex 接入后可触发工作、完成和需要操作的动画；配置与 hooks 信任需要明确完成，任务活动留在本机。
- **分享后仍可继续编辑。** `.petlord` 包可携带经过校验的可编辑源码，导入后继续修改。

使用说明见[原生像素陪伴](pixel-companion.md)、[Agent 与 MCP 接入](agent-design.md)和[模型服务](model-services.md)。

## PetLord 提供什么

PetLord 提供两套可组合、可复用的创作能力：

- **状态及过渡动作模型**：控制桌面搭子在什么情况下展示什么动作。
- **风格模板与形象模板**：复用风格和角色形象，支持批量创作桌面搭子。

创作平台与桌面客户端相互独立：在创作平台实时预览，快速创作、快速验证；完成后的宠物在桌面客户端独立运行。

![PetLord 产品演示](../assets/petlord-demo.gif)

![PetLord 桌面客户端](../assets/petlord-desktop.png)

## 状态及过渡动作模型

为点击、双击、悬停、拖拽、空闲和定时等条件配置动作，决定桌面搭子何时切换状态、播放什么过渡动作。

![PetLord 状态及过渡动作网络](../assets/petlord-state-graph.png)

## 本地运行

使用 Node.js 22.13 或更高版本，推荐 Node.js 24 LTS。启动项目和创作原生像素宠物不需要 API Token。

```bash
git clone https://github.com/Lajunkai929/petlord.git
cd petlord
npm ci
npm run dev
```

打开 `http://localhost:4310` 使用 Studio。开发服务运行后，下列命令会创建一份新的可编辑样例，不调用付费生成：

```bash
npm run design -- example lottery --endpoint http://127.0.0.1:4312
```

需要 AI 画稿时，从 Studio 左侧进入「模型」，分别添加图片和视频服务。凭据只保存在本机 `runtime-data/petlord.sqlite`，设置接口不会把凭据返回浏览器。生成使用所选服务，可能产生该服务的费用。

集成桌面客户端自带 Studio、CLI 和 MCP。桌面构建入口与 Agent 接入流程见[设计协议说明](agent-design.md)。

### 平台验证范围

当前桌面及集成验证覆盖 **macOS arm64**。生成图片的前景提取使用 Apple Vision，需要 **macOS 14 或更新系统**；原生像素绘画、媒体导入和包导出不依赖 Vision。仓库提供 Windows 和 Linux 打包目标，端到端验证尚未完成。

提交改动前运行 `npm run check`，它会依次执行类型检查、测试和所有工作区的生产构建。

欢迎贡献代码和可复现的问题报告。附文件前请阅读[贡献指南](../CONTRIBUTING.md)和[公开发布隐私检查](public-release-privacy.md)。公开问题和分享包使用合成样例；不要附上 API Key、本机配置、任务内容或私人参考照片。

## 发布到桌面客户端

正常交付不再需要“服务端导出文件、客户端手动导入”的中转：

1. 在创作平台打开「发布」，点击「发布到客户端订阅」。
2. 打开桌面客户端设置，刷新默认订阅地址 `http://127.0.0.1:4312`。
3. 点击「导入并使用」。同名宠物会原位更新，新名称会创建一套新的本地配置。

服务端会把每次发布保存成不可变、按内容寻址的 `.petlord` 版本，位置是 `runtime-data/published-packages/`。桌面客户端安装前会再次校验完整性；下载和手动导入 `.petlord` 仍作为离线备用流程保留。

远程订阅可以在客户端填写 HTTPS 服务地址。内置生成 API 仅监听本机回环地址；托管远程订阅服务需要单独部署并配置访问保护。
