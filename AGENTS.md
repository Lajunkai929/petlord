# PetLord 开发约定

修改 Studio、桌面设置、弹窗、插件界面或共享 UI 前，必须阅读并使用项目 Skill：

[petlord-design-system](.agents/skills/petlord-design-system/SKILL.md)

它约束共享组件入口、Logo/小狗配色、字号、尺寸、圆角、交互与无障碍验证。具体值以 `packages/ui/src/tokens.json` 为准，文档见 `docs/design-system.md`。UI 改动运行 `npm run check:design`；完整检查使用 `npm run check`。

纯后端、媒体编码、像素画稿内容和数据导入不需要执行无关的界面流程。不要把 UI 尺寸规范应用到宠物像素、帧时长或媒体坐标。

当前仓库同时提供开发代码和本机应用：运行中的应用位于 `apps/desktop/release/mac-arm64/PetLord.app`，数据位于 `~/.petlord`。构建候选安装包时使用独立输出目录；升级前备份并核对实际工作区记录、安装包与设置。不要用测试样本替换用户的项目或安装配置。

保留用户已有未提交内容；`assets/experiments/` 是用户现有素材，不因界面开发清理或纳入无关提交。
