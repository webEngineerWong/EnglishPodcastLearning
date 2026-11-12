# UI 审计报告（Web / Desktop）

> 审计时间：2026-11-13 · 基于真实代码扫描，非推测。

## 一、共享层

| 项 | 现状 |
|---|---|
| 组件库 | `packages/ui` 手写 shadcn 风格组件（Button/Card/Badge/Input/Select/Modal/Tabs/EmptyState/Spinner/ProgressBar），无第三方 UI 依赖 |
| 图标 | `lucide-react@1.71` 已在 web/desktop/ui 三处依赖（无需新装）；但页面大量使用 **Emoji 充当功能图标** |
| 主题 | `globals.css` 已有完整 shadcn 双主题 CSS Variables（light/dark），ThemeMode 跟随系统+手动 |
| 本次新增 tokens | `--radius`、`--success/--warning`、`--shadow-sm/md/lg`、统一字体栈、::selection、滚动条样式 |

**决策：不引入 shadcn CLI / Radix / Motion / TanStack Table / Recharts。**
理由：现有手写组件已是 shadcn 风格且覆盖所需原语；引入完整库属于重写，违背「保留已有成熟业务」原则。lucide-react 已有无需安装。图表场景（Dashboard）当前 6 个数字卡足够，Recharts 列为远期可选项。

## 二、Web（Next.js 15）

| 页面 | 现状 | 本次改动 |
|---|---|---|
| Dashboard `app/page.tsx` | 统计卡+继续学习+最近学习/播放/导入，结构合理；emoji 图标（▶📚🎧📥）、无欢迎区、无快速入口 | 重构：时段问候、封面化继续学习卡、快速入口行、全 lucide |
| 课程列表 `app/courses/page.tsx` | 2 列 Grid、搜索/分类/收藏筛选、分页；卡片无封面、★☆ emoji | 3 列封面卡（lg:grid-cols-3）、Bookmark/Headphones/Search/Plus 图标 |
| 课程详情 `courses/[id]` | 播放器(sticky)+标签栏(实时字幕/学习资料/学习笔记)+双语阅读器+时间编辑器；按钮 emoji | 📎🖼⏱ → Paperclip/ImagePlus/Timer |
| 导入 `import` + 校对 `[jobId]` | 拖拽上传/任务列表/角色徽标/预览齐全；fileIcon 用 emoji | fileIcon → lucide（见 parity） |
| 生词本/收藏 | 列表+操作齐全；emoji 图标 | 同上清理 |
| 导航 `shell.tsx` | lucide 导航已有；主题按钮 ☀️/🌙、Logo 文字块 | House/Library/FileUp/BookOpen/Bookmark + Sun/Moon + Headphones Logo |
| 封面 | API 无 coverUrl 输出 | list/detail 均返回 `coverUrl`；新增共享 `CourseCover` 组件（缺省品牌占位） |

## 三、Desktop（Electron）

- 复用 `@elp/ui` + `@elp/player`，页面结构与 Web 对齐（单文件 main.tsx）。
- 导入中心：本机文件 IPC 导入 + 历史任务列表 + 角色徽标/预览（已对齐 Web）。
- 本次改动：导航图标对齐映射表（House/Library/FileUp/BookOpen/Bookmark）、主题 Sun/Moon、课程卡 Bookmark/Headphones、导入页 Inbox/Search、空状态去 emoji。
- 已知平台差异（允许）：全局快捷键（CommandOrControl+Alt+E/P）为桌面独有。

## 四、遗留问题（不阻塞，已记录）

1. `EmptyState` 组件的 `icon?: string` prop 天然接收 emoji——已从主要页面移除用法，组件签名保留（向后兼容）。
2. 部分页面存在硬编码中文（历史遗留），i18n 覆盖了本次新增文案。
3. 播放器进度条为 click-to-seek，拖动跟手（pointermove）未做——列入 roadmap P1。
4. 播放器 `ui.tsx` 已全 lucide，质量良好，本次未动。
