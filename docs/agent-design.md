# Agent 设计协议与原生像素绘画

PetLord 的桌面客户端包含透明宠物、运行时设置、Studio、设计服务、CLI 和 MCP。首次打开只显示宠物；从应用菜单或托盘打开设置和设计平台。Studio 发布后直接安装并切换到新宠物。桌面用户无需安装 Node、Python 或另开开发服务器。

## 一键接入 Codex

打开 PetLord 设置 → 接入 Agent → 一键接入 Codex。客户端检测本机 Codex，备份现有配置，再注册本机 PetLord Design 工具。随后在 Codex 设置中重启 MCP 连接，或重启 Codex；新任务即可发现工具。添加服务器和重新加载的方式遵循 [OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp)。

连接通过 `~/.petlord/bin/petlord-mcp` 启动客户端自带的运行时。端口和令牌随每次工具调用重新读取，因此 PetLord 重启后无需重新接入。初始化和工具发现不要求宠物软件已经打开；读写作品时需要保持 PetLord 运行。

工具包括连接状态、命令发现、项目读取、带版本号的修改、真实图片预览和有时限的任务等待。Agent 可以直接提交画布、调色板、单帧图层及动画时间线。设置页可复制一段开始指令。

Codex → 宠物的提醒在同页「任务提醒 → 配置任务提醒」接入，配置时会启用内置 Agent 动态插件。它备份并合并 PetLord hooks，保留其他 hooks 和已有通知命令。首次使用仍需在 Codex 的 `/hooks` 中审查、信任这些 hooks，这是 [Codex 官方 hooks 流程](https://learn.chatgpt.com/docs/hooks)要求的步骤。界面区分配置已写入、自测已送达、已收到真实任务；前两项不能证明真实任务已经接通。

工作事件驱动宠物的 `working` 动作持续循环；完成、需要操作或中断会切换动作。气泡优先显示事件中提供的公开摘要小标题，缺失时使用可见进度或工具状态。标题随 hooks 事件更新，不能保证取得每一个界面标题。像素彩票的完整动作、桌面文件开关与验证范围见 [像素陪伴使用说明](pixel-companion.md)。

`petlord_job_wait` 默认等待 30 秒，每次最多 45 秒，留出客户端调用超时的余量。返回可重试的 `WAIT_TIMEOUT` 和仍在运行的任务时，使用相同 `jobId` 再次等待，不要重新提交生成。这适配 Codex 默认 60 秒的工具时限；无需改动用户的时限配置。

已停用或自定义的同名连接会显示明确状态，并保留用户设置；可在 Codex 的 MCP 设置中启用或调整。自动配置的目标是本机 Codex，其他电脑和其他 Agent 需要分别配置。Windows / Linux 尚未进行本轮安装验证。

## 已安装宠物与本地项目

客户端启动和导入宠物时，会把安装目录中的每份 `.petlord` 同步到 Studio。项目库提供「同步已安装宠物」及逐文件错误说明。升级会补充原生像素 Lottery 样例，并保留当前使用的宠物。安装库不再因超过 30 个包而自动删除旧作品。

新导出和安装的包默认包含经哈希校验的可编辑源码，包括原生像素文档、图层与帧继承、候选素材、状态图和动画。共享形象参考图及身份/风格提示词会固化到包内，便于换设备继续创作。

较早的包只包含运行素材。导入会恢复状态、动画、注视、拖拽和触发条件，并明确标注无法恢复的原始提示词、候选历史与图层信息。符合原生像素约束的 PNG 可无损恢复为单图层。损坏包会单独报告；其他包继续同步。

同一安装位置的重复同步不会创建副本，已经编辑的项目不会被后台同步覆盖。明确选择「新建配置方案」保留两份相同的包时，每份都有独立项目，修改和应用各自生效。删除对应项目后，再点击宠物的「编辑」会从仍安装的包恢复项目。内容不同的外部包即使使用同一源码项目 ID，也会恢复为独立项目，保留旧稿。

从「宠物 → 编辑这个宠物」打开关联项目后，在「发布」点击「更新本机宠物」即可保存并应用到原安装位置，改名也不会新增副本。未关联项目使用「在本机使用」创建自己的安装；导出和订阅用于分享。Agent 可用 `package.installation.get` 查询安装关联、正在使用状态及待应用修改，再以项目的 `expectedRevision` 调用 `package.install`。

## 连接与发现

运行客户端后，macOS / Linux 的入口为 `~/.petlord/bin/petlord-design`，Windows 为同目录下的 `.cmd`。`PETLORD_USER_DATA_DIR` 可隔离整套工作区。CLI 通过该目录的 `design-connection.json` 读取实际端口和私有令牌，并使用客户端附带的运行时执行。

```sh
~/.petlord/bin/petlord-design describe
~/.petlord/bin/petlord-design describe pixel.frame.upsert
~/.petlord/bin/petlord-design project list
```

开发仓库也可使用 `npm run design -- describe`。显式连接使用 `--connection <文件>` 或 `--endpoint http://127.0.0.1:端口`；令牌优先放在连接文件或 `PETLORD_DESIGN_TOKEN`，不写入命令历史。服务只监听本机回环地址，桌面 Studio 使用私有会话 Cookie。CLI 不修改其他 Agent 应用的配置。

协议使用 JSON，可直接通过 HTTP 或 CLI 调用：

- `GET /api/design/v1/commands`：命令说明、输入 JSON Schema、是否需要项目及版本号。
- `POST /api/design/v1/execute`：执行一个命令。

```json
{
  "requestId": "unique-edit-001",
  "command": "state.create",
  "projectId": "lottery",
  "expectedRevision": 42,
  "responseMode": "summary",
  "input": {"id": "sit", "label": "坐着", "description": "安静坐着"}
}
```

成功返回 `protocolVersion`、`requestId`、`result`；失败返回 `error.code/message/details/retryable`。修改项目时，使用最近读取的 `revision`。`responseMode: "summary"` 保留新版本号、操作结果和 `projectSummary`，省略整份项目及绘画源码；默认 `full` 返回完整项目。读取源码可用 `pixel.document.get`。

同一次重试必须保留完整请求及相同 `requestId`，服务会回放成功回执；相同 ID 配不同输入返回 `REQUEST_ID_REUSED`。遇到 `REVISION_CONFLICT` 先重新读取与合并，新的编辑使用新的请求 ID。不要自动用最新版本号覆盖旧快照。

```sh
~/.petlord/bin/petlord-design execute --input edit.json
~/.petlord/bin/petlord-design call state.create --project lottery --revision 42 --input state.json --response-mode summary
```

## 原生像素路线

画布、图层、调色板、渲染器和播放器已经建好。Agent 提供绘画数据，服务输出确定的 RGBA PNG；不需要为每只宠物生成绘图程序，也不需要先生成大图再缩小。

下列是可直接交给 `pixel.document.set` 的最小输入：

```json
{
  "document": {
    "schemaVersion": 1,
    "width": 3,
    "height": 2,
    "palette": {"R": "#FF0000", "B": "#0000FF"},
    "frames": [
      {"id": "sit", "layers": [{"id": "body", "x": 0, "y": 0, "rows": [".R.", "RRR"]}]},
      {"id": "blink", "baseFrameId": "sit", "patches": [{"layerId": "body", "x": 1, "y": 0, "rows": ["B"]}]}
    ]
  }
}
```

每个字符是一个像素，`.` 为透明。基础帧包含图层，派生帧可以复用基础帧并替换图层或局部矩形。`patches` 的坐标相对于目标图层；同名图层替换后保留绘制顺序，新图层追加。图层替换须提供完整矩形和坐标。颜色限 `#RRGGBB` 或透明，无半透明或抗锯齿。尺寸、源单元数量和继承展开量都有限制；非法颜色、越界、继承循环会提供诊断。

建议工作过程：

1. 用 `project.create` 建立项目，或读取已有项目；不需要设置或切换制作路线。
2. `pixel.document.set` 提交母版和关键姿态；`pixel.frame.upsert` 提交单帧增量定义，`pixel.palette.update` 修改调色板。
3. `pixel.validate` 检查结构；`pixel.render` 输出原始尺寸 PNG；`pixel.feedback` 返回最近邻放大的逐帧对照图、包围盒、非透明像素数、相对前帧的像素差异数量。
4. `state.create` 建立逻辑状态；`pixel.state.bind` 将指定帧渲染并批准为状态展示图，首次可指定 `setInitial: true`。
5. `transition.create` 连接源变体和目标状态；`pixel.animation.bind` 一次提交 `frames: [{frameId, durationMs}]`、可选 `playback: {repeatMode, minCycles, maxCycles}` 和 `approve: true`。
6. 下载反馈图并实际查看。修正已有作品时，使用 `pixel.document.save` 提交完整文档并刷新已经绑定的状态和动画；新帧仍需首次绑定。通过 `project.inspect` 后可用 `package.install` 更新本机，或导出分享。

动画第一帧必须与源变体的已绑定图像完全一致，最后一帧必须与目标状态的已绑定图像一致。循环回到源帧。每帧持续时间显式指定，运行时保留原生像素与透明边缘。原生序列使用完整区间和正向播放；需要往返动作时明确列出反向帧。循环次数仍可配置。原生动画不做视频补帧或首尾渐变。

原生注视可以在状态的 `pointerGaze.nativeImageArtifactIds` 中绑定八张同尺寸 PNG，顺序固定为左、左上、上、右上、右、右下、下、左下。导出后对应 `nativeImageUris`。注视可以接管闲置循环，主动动作和拖拽优先；离开注视范围后恢复原状态。保存像素文档会同步已绑定帧的新素材，删除注视绑定的帧需要先解除绑定。

`pixel.document.set`、单帧增量及独立渲染保持源码与批准图片分离。Studio 的「保存画布」使用显式 `pixel.document.save`：按帧来源生成新的不可变 PNG，并在同一次版本校验提交中更新已有状态、变体和动画引用；历史图片保留，时长、触发器及审批状态保持原样。删除仍被绑定的帧或遇到并发版本冲突时，整份项目不会部分更新。

### 立即试用彩票

```sh
~/.petlord/bin/petlord-design example lottery --project lottery-native-demo
~/.petlord/bin/petlord-design project inspect lottery-native-demo
~/.petlord/bin/petlord-design call pixel.feedback --project lottery-native-demo --json '{"frameIds":["sitting","resting","sleeping","stretching"],"columns":4,"scale":6}'
```

这是已有原创试作的可编辑转换，含 4 个状态、20 张不同绘画帧、6 段动画（含两段明确倒序的返回动作）。它展示完整工具流程，不代表已达到《星露谷物语》的成品美术质量。CLI 返回的对照图 URI 用 `media get` 保存；查看实际图片再决定哪里需要修正。

```sh
~/.petlord/bin/petlord-design media get /api/media/返回的文件名.png --out lottery-feedback.png
~/.petlord/bin/petlord-design export lottery-native-demo --out lottery.petlord
~/.petlord/bin/petlord-design install lottery-native-demo --revision 最近读取的版本号
```

Studio 的每个项目都有「状态与动作」「绘图」「预览」「发布」四个视图。在「绘图」中编辑像素、调色板和图层，派生帧、绑定状态、编排时序并设置触发器；在同一项目中也能生成或导入图片、视频。素材自身记录格式，项目无需选制作类型。旧文件中的 `productionRoute` 仅兼容读取，不限制工具。

切换视图会保留未保存的画布与动画草稿。保存或明确放弃草稿后，才可预览和发布；修改已安装宠物，在「发布」点击「更新本机宠物」即可更新原配置。Agent 与 Studio 使用同一工作区；独立字段的修改会合并，同一字段冲突会保留本地内容并提示处理。

新建项目可以选择「新宠物」，只填项目名和宠物名。之后通过侧栏「配置参考图」上传图片、复用已有角色，或使用当前已确认的状态图，再直接在本项目生成。复用角色会跟随该角色的参考更新；追加项目图片或当前状态后，参考独立保存到项目。切换参考来源保留已有状态、动画和历史素材。

## 在同一项目生成图片与视频

`provider.list/create/update/test/delete` 管理图片与视频 Provider。只有明确配置的凭据会提交到相应 Provider；列表只返回凭据提示。模型、能力和可选设置从命令与 Provider 列表发现。

0.1.7 的 `provider.list` 同时返回厂商预设 `catalog` 和已实现的 `protocols`。配置的 `type` 是调用协议（`volcengine-ark`、`openai-compatible`、`siliconflow`），`presetId` 是可选厂商标识。`models` 可保存自定义模型 ID、名称、描述和可选 `estimatedUnitCostCny`（图片元／张，视频元／秒）；生成使用该连接保存的模型列表。更新时省略模型列表或留空替换密钥会保留旧值。当前视频协议为 Ark；OpenAI 兼容指 JSON Images 生成／编辑接口。图形界面的完整路径见 [模型服务配置](model-services.md)。

1. `identity.create/update` 和 `media.import` 准备身份参考；`style.create/update` 设置图片/视频风格提示词；`template.save` 保存状态与行为模板，再用 `project.create` 的 `templateId` 复用。
2. `state.generate` 读取项目、身份、风格、描述和调用者覆盖的生成设置，返回持久任务。
3. `job.get` / `job.list` / CLI `job wait` 获取进度、成本估算或结算、错误、远端任务 ID 和结果。任务由本地后台协调，Studio 关闭也能继续完成并收录候选。
4. `state.candidates` 返回图片 URI 和元数据；检查后 `state.approve` 选择权威图及变体。
5. `transition.create/update` 配置端点、动作、时长、透明处理、播放、触发器；`transition.generate` 提交视频任务，完成后检查视频及尾帧，`transition.approve` 批准。
6. `state.gaze.generate` 生成鼠标注视素材；详细的 pointerGaze 设置通过 `state.update` 编辑。

没有内置价格或已保存预估单价的模型会被预算保护阻止，返回 `PRICE_UNAVAILABLE`，需要先补充模型预估费用；任务费用包含已有预留和消费。用户填写的单价仅用于预算估算，不代表实际结算。`job.retry` 仅接受失败任务，有远端视频任务 ID 时继续该任务。提交期间断网或关闭且没有返回远端 ID 时，服务不会自动再次付费提交；错误中会提示先核对 Provider 记录。

CLI `job wait` 返回码：成功 0，失败 1，等待到期 2。超时不取消后台任务。`--request-timeout-ms` 控制单次请求超时，`--timeout-ms` 控制总等待时间。

### 微调与媒体反馈

`media.import` 接收图片或视频 data URL，保存在本地媒体库；可为状态登记候选。`artifact.get/update/register/delete` 管理元数据和引用。`media.process` 使用本地工具处理现有视频：

- `extract-frame`：指定 `videoArtifactId` 和 `timeMs`，输出准确时间位置的 PNG。
- `ping-pong`：指定视频及 `segmentStartMs/segmentEndMs`，生成实际正向加倒放片段。
- `transparentize`：指定视频、尾图、分辨率、背景色和相似度，输出透明视频与尾帧。

返回的新素材不会自动替换当前版本。用 `transition.update` 选择新 `videoArtifactId/extractedTailArtifactId`、`selectedEndMs` 和播放参数，再批准；视频尾帧路线应同步目标变体的图片，或清除 `toVariantId` 后重新批准。历史版本数组、任意变体、插件、交互区域、拖拽锚点与订单参数均可通过对应 update 命令完整编辑。输入字段要求以 `describe <命令>` 为准。

## 打包与数据

`npm run dist:desktop:mac` 构建 macOS arm64 DMG；`npm run dist:dir -w @petlord/desktop` 构建当前平台目录应用。构建同时生成 Studio 静态站点、嵌入式服务、CLI 和本机 FFmpeg / 前景处理工具，不依赖开发端口。其他目标必须准备匹配架构的原生工具；以实际构建与验证记录为准。

用户文件保存在 `~/.petlord`，安装宠物时保留先前文件；升级保留用户选中的宠物。可通过 `PETLORD_USER_DATA_DIR` 启动隔离测试实例。原生绘画源码留在设计项目里，导出的宠物包包含可直接播放的图片与时间序列，运行时无需绘图语言或生成 Provider。
