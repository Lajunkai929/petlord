# PetLord 设计系统

应用从 `@petlord/ui` 使用标准控件。Ant Design 负责控件行为，Radix 负责对话框生命周期；应用共享一套视觉和交互规范。默认浅色，保留暗色及用户已有字号偏好。

## Token 所有权

`packages/ui/src/tokens.json` 是数值来源。`packages/ui/src/theme.ts` 将它映射到 Ant Design；`scripts/ui-token-css.mjs` 生成 `tokens.generated.css`，由 `@petlord/ui/theme.css` 引入。执行 `npm run tokens:ui` 更新生成文件；`npm run check:design` 校验同步和使用边界。

现有应用外观声明放在 `@layer petlord-application`，使共享控件拥有自己的颜色、边框、字体和内边距。应用布局可以定义宽度、网格、滚动、位置和媒体几何。不要在后面添加高优先级“修补皮肤”。

## 配色

| 角色 | 浅色 | 暗色 |
| --- | --- | --- |
| 页面 | `#FAF8F4` 暖白 | `#201C19` 暖炭色 |
| 文字 | `#342C25` 深棕 | `#F7EEE2` 奶油白 |
| 主色 | `#96602D` 棕色 | `#E9BA76` 焦糖色 |
| 选择背景 | `#F6E8CF` 浅奶油 | `#493827` 暖棕 |
| 边框 | `#E2D9CC` 暖灰 | `#4A3E33` 暖灰棕 |

这些颜色来自小狗与 Logo 的搭配。成功状态使用主色并附图标/文字，错误使用共享砖红色，警告使用共享赭色。禁用态保留可读性；不能只靠颜色表达状态。应用 CSS 不增加自己的 hex/rgb/hsl 调色板；画布中的作品颜色不受此限制。

## 字体与尺寸

系统字体栈包含 SF Pro、PingFang SC 和 Segoe UI；仅代码和原始数据使用等宽角色。字号偏好通过共享角色一起缩放，不能只放大一种控件。

| 角色 | 默认字号 / 行高 | 使用 |
| --- | --- | --- |
| `--font-xs` | 12 / 16 | 辅助信息、计数 |
| `--font-sm` | 13 / 20 | 表单标签、紧凑说明 |
| `--font-body` | 14 / 22 | 正文和标准控件 |
| `--font-section` | 16 / 24 | 面板标题 |
| `--font-dialog` | 20 / 28 | 弹窗标题 |
| `--font-page` | 24 / 32 | 工作区标题 |
| `--font-display` | 32 / 40 | 少量独立展示标题 |

字重使用 400、500、600、700 角色，标准按钮为 600。不要让同一表单混用 12px 输入、13px 选择器和14px按钮。

| 控件规格 | 高度 | 使用 |
| --- | --- | --- |
| 标准 | 36px | 默认表单、弹窗、操作栏 |
| 紧凑 | 28px | 明确的密集编辑行；同行一起使用 |
| 大号 | 44px | 明确需要更大点击目标的入口 |

普通控件圆角为 8px；小标记4px；面板/选择卡12px；弹窗16px。圆形状态点和画布直角是几何例外。间距使用 `--space-1/2/3/4/5/6/8`，对应4/8/12/16/20/24/32px；布局尺寸可按内容和窗口确定。不要把所有容器、按钮和输入都做成胶囊。

## 组件用法

```tsx
import { Button, FormField, Input, SelectField } from "@petlord/ui";

<FormField label="项目名称" required hint="用于在本机查找这个项目" error={error}>
  <Input value={name} onChange={event => setName(event.target.value)} />
</FormField>
<Button type="primary" htmlType="submit" loading={saving}>保存项目</Button>
```

`FormField` 统一标签、帮助、错误和必填关联。复杂数字使用 `InputNumber`；需要保留字符串输入/已有数字校验时可用 `Input type="number"`。原生 file/range/color/hidden 输入保留浏览器职责；标准文本、下拉选择、复选框、单选框不得绕过共享入口。

`SelectField` 保持 HTML 表单值和既有 onChange 接口，提供库内键盘行为。外层 `.pl-select-control` 只允许布局属性，不能有第二层 border、padding、背景或高度。通过 `status` 表达错误。

`Button` 的 `type` 表达主/次/文本视觉，`htmlType` 表达 button/submit/reset。共享层兼容 Radix `asChild` 注入的原生 type，避免取消按钮落入不受支持的视觉类型。非提交操作应为 button。

桌面侧栏的导航与底部操作都使用标准 `Button`：36px 高、14px 字号、16px 图标、8px 圆角，图标与文字左对齐。页面导航保持 `variant="text"`，用 `aria-current="page"` 和主色表达当前位置；共享层提供选中背景。不要在选中时切换按钮 variant，组件库可能替换按钮节点而丢失键盘焦点。底部操作放在同一个容器中，由容器设置一次 `margin-top: auto`；不要给多个按钮分别设置自动上边距。桌面应用支持的最小窗口内仍保持纵向侧栏。

新建项目、形象、风格、Provider 和多字段配置使用 `Dialog` + `DialogContent`；标题、关闭、底部动作遵循共享框架。已选状态或动画的直接属性可就地编辑。媒体审核、图节点、帧缩略图和画布是有专用几何的编辑表面，不套普通按钮尺寸。

Studio 使用 `PreviewableImage` 显示可放大的素材，并传入 `artifact.nativePixel`。容器需要明确可收缩的宽高；通过 Image 的尺寸及语义 styles API 设置实际图片的 `contain`，不要只在应用 CSS layer 覆盖其高度。原生素材在缩略图、单图/组内放大、锚点中保持最近邻，放大预览按原生尺寸选择初始整数倍；普通照片保持正常插值。锚点编辑面的比例必须与原生画布一致，透明边缘也属于画布，不能为了填满卡片而裁掉。

## 必须检查的状态

标准组件覆盖默认、hover、键盘 focus、pressed、disabled、loading、error 和selected。焦点使用共享2px轮廓；不能删除 focus-visible 或依赖鼠标。对话框必须有标题和描述，关闭恢复焦点；下拉菜单先处理 Escape，第二次 Escape 才关闭弹窗。

先运行 `npm run check:design`、涉及的测试和类型检查，再在真实浏览器或安装包检查两种主题与1280×800窗口。测量实际控件，不只查看CSS声明；确认长名称、错误、加载中和选项弹层不遮住关键动作。数据、媒体与渲染逻辑的检查按其实际改动范围执行。
