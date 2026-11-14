# 三端现代化路线图（THREE_PLATFORM_ROADMAP）

> 2026-11-13 制定。原则：改善已有功能、不重写、不为功能引入复杂度。
> 每项标注状态：✅ 本轮完成 / ⏳ 进行中 / 📋 排期 / 🔭 远期。

## Sprint 1 — 审计与设计基线 ✅

- ✅ 三端技术栈审计（docs/UI_AUDIT.md、docs/IOS_AUDIT.md）
- ✅ 功能对齐表（docs/PLATFORM_PARITY.md）
- ✅ Design Tokens：globals.css 增补 radius/success/warning/shadow/字体栈/滚动条/::selection
- ✅ 图标体系：确认 lucide-react 三端已有依赖；Web/Desktop Emoji 功能图标全量替换为 lucide
- ✅ 明确不引入：shadcn CLI、Radix、Motion、TanStack Table、Recharts（现有手写组件覆盖需求，避免重写与体积）
  - ↪ 2026-11-13 修订：经用户确认，Recharts 仅用于「学习趋势图」场景引入（@elp/ui 共享组件），其余决策不变

## Sprint 2 — Web UI ✅

- ✅ Dashboard：时段问候、继续学习卡（封面+进度+Play）、6 统计卡带图标、快速入口行、全 lucide
- ✅ 课程列表：3 列封面卡、Bookmark 收藏、Search/Plus、空状态去 emoji
- ✅ API：课程 list/detail 返回 `coverUrl`（签名 URL）
- ✅ 课程详情：Paperclip/ImagePlus/Timer 按钮

## Sprint 3 — Desktop ✅

- ✅ 导航/主题/课程卡/导入页/生词收藏空状态图标对齐映射表
- ✅ typecheck/lint 0 告警 + build 通过

## Sprint 4 — iOS ✅

- ✅ 深色模式：PALETTES 色板（对齐 Web tokens）+ useColorScheme + makeStyles(palette)
- ✅ StatusBar 随主题
- ✅ 锁屏/灵动岛元数据与封面（expo-audio 内建能力，回退 App 图标）

## Sprint 5 — 阅读与数据 ⏳

- ✅ 双语阅读器：本轮审计确认现状良好（高亮/跟随/三模式/复制/收藏/生词），未做破坏性改动
- 📋 iOS：段落复制（Clipboard API）、句子收藏、段落加生词
- 📋 iOS：倍速（expo-audio setRate）、单句/A-B 循环（复用 packages/learning-core loop 纯函数）
- 📋 生词本/收藏：Web/Desktop 搜索与筛选增强
- 📋 Desktop：课程列表接 coverUrl、设置封面入口

## Sprint 6 — 质量与发布 ✅

- ✅ 三端 typecheck / lint / vitest / build 全绿
- ✅ Playwright 冒烟（web）：7 用例通过
- ✅ 移动端真机回归（Release 构建 + 真机启动）
- ✅ 文档更新（本文件 + 三份审计）

## Sprint 7 — 离线下载与学习趋势图 ✅

- ✅ 学习趋势图（Recharts）：API `GET /stats/trend?days=`（本地时区归日、缺日补零，含 vitest）+ api-client `getTrend` + @elp/ui 共享 `TrendChart`（颜色全走 --chart-1 等 tokens）+ Web/Desktop Dashboard 趋势卡（近 7/14/30 天切换）；iOS 不加（Recharts 为 Web DOM 库）
- ✅ 离线下载（iOS 完整离线）：expo-file-system 下载音频 + 课程详情 JSON 到 `documents/downloads/`，清单存 AsyncStorage（`elp-downloads`）；断网时本地播放 + 离线读缓存双语字幕；课程页「下载离线/下载中%/已离线·点按删除」
- ✅ 下载音频按钮：Web/Desktop 课程详情均可签名 URL 直下（本地存储 `?download=1` 强制 attachment）；API 签名 URL 已有，无后端改动

## Sprint 8 — Mini Player 与词典源 ✅

- ✅ Mini Player（页面切换常驻）：@elp/player 新增全局 `PlayerProvider`/`useGlobalPlayer`（引擎 + 曲目元信息 + 心跳统一上报，同曲目重入不重载不断播）+ 共享 `MiniPlayer` 底栏 UI（封面/标题/拖动进度/±5s/主播放/关闭）；Web AppShell 与 Desktop 布局接线（当前课程详情页自动隐藏，详情页改用全局引擎装载曲目；Desktop 保留磁盘缓存与系统媒体元数据）
- ✅ 生词释义词典源：API `GET /vocabulary/lookup/:word`（dictionaryapi.dev 音标/英文释义/发音 + MyMemory 中译；共享词表缓存，查不到返回 source=none，绝不虚构；查询不污染用户生词本）+ api-client `lookupWord` + Web/Desktop 生词本「查词典」按钮（cache/dictionary/none 三态提示）
- ✅ ActivityKit 灵动岛进度环：原生模块 + Widget Extension + JS hook 全链路已实现；因 Live Activity 必然同时出现在锁屏、与系统 Now Playing 卡重复成双卡，`useLiveActivity.ts` 加总开关默认关闭（启动时清理残留活动），需要时改回 `true` 即可
- ✅ iOS 白屏排查：03:12 真机包与 04:39 模拟器包均为 prebuild 半程产物（bundle 有效但渲染树异常），podspec 依赖名修正（ExpoModulesCore）+ pod install + 重新构建后 Release 模拟器/真机均正常渲染

## 后续排期（未在本轮实施）

_无——原排期表全部完成：iOS 倍速/循环/复制/收藏（P1）、进度条拖动跟手（P1）、Mini Player（P1）、灵动岛进度环（P2，默认关闭）、生词词典源（P2）。_
