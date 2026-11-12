# 三端现代化路线图（THREE_PLATFORM_ROADMAP）

> 2026-11-13 制定。原则：改善已有功能、不重写、不为功能引入复杂度。
> 每项标注状态：✅ 本轮完成 / ⏳ 进行中 / 📋 排期 / 🔭 远期。

## Sprint 1 — 审计与设计基线 ✅

- ✅ 三端技术栈审计（docs/UI_AUDIT.md、docs/IOS_AUDIT.md）
- ✅ 功能对齐表（docs/PLATFORM_PARITY.md）
- ✅ Design Tokens：globals.css 增补 radius/success/warning/shadow/字体栈/滚动条/::selection
- ✅ 图标体系：确认 lucide-react 三端已有依赖；Web/Desktop Emoji 功能图标全量替换为 lucide
- ✅ 明确不引入：shadcn CLI、Radix、Motion、TanStack Table、Recharts（现有手写组件覆盖需求，避免重写与体积）

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

## 后续排期（未在本轮实施）

| 项 | 优先级 | 备注 |
|---|---|---|
| iOS 倍速/循环/复制/收藏 | P1 | 纯 RN 层，无原生改动 |
| 播放器进度条拖动跟手（pointermove） | P1 | Web/Desktop 共用 ui.tsx |
| Mini Player（页面切换常驻） | P1 | Web/Desktop 布局层 |
| ActivityKit 灵动岛进度环 | P2 | 需 Widget Extension，免费签名可验证 |
| 离线下载 | P2 | 需 API 签名 URL 直下 + iOS 沙盒存储 |
| Recharts 学习趋势图 | P2 | 数据已有，非必需 |
| 生词释义词典源 | P2 | 不虚构数据，需接词典 API |
