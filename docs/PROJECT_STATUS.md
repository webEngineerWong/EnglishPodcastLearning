# 项目状态（PROJECT_STATUS）

> 断点恢复入口：每次继续开发前，先读本文件与 `docs/NEXT_STEPS.md`。
> 最后更新：2026-11-12（Phase 0–8 全部完成；.app 已产出；待 GitHub 授权推送）

## 当前阶段总览

| Phase | 状态 | 说明 |
|---|---|---|
| 0 环境检查 | ✅ 完成 | macOS 26.3 / M4 / Node 24 / pnpm 12 / Docker 29；gh 未装（本地 git 优先） |
| 1 工程初始化 | ✅ 完成 | pnpm + Turborepo monorepo；6 packages + 3 apps + services/pdf-parser |
| 2 数据库与后端 | ✅ 完成 | PostgreSQL 18 (Docker) + Prisma 6 + 16 模型 + migration + seed；NestJS 全模块 + Swagger |
| 3 Web 学习平台 | ✅ 完成 | Dashboard/课程/播放器/双语阅读/生词/收藏/导入中心；浏览器实测通过 |
| 4 PDF 导入 | ✅ 完成 | Python(PyMuPDF) 解析 + 中英配对 + 页眉过滤 + SRT 时间戳对齐 + 校对 + 发布；真实资料实测 |
| 5 Electron | ✅ 完成 | 窗口/托盘/快捷键/IPC 导入实测：渲染器(5173)与 API(3001) 连接建立；.app 打包中 |
| 6 学习记录 | ✅ 完成 | 心跳进度/会话/统计/收藏/生词 API 实测通过 |
| 7 存储抽象 | ✅ 完成 | LocalStorageService 实测；R2StorageService 就绪（等密钥，STORAGE_DRIVER=local） |
| 8 完整验收 | ✅ 通过 | typecheck 13/13、test 9/9（21 tests）、lint 13/13、build 8/8 |
| 9 交付 | ✅ 完成 | 3 次 git 提交；docs 全套；.app 产物；GitHub 推送命令见 NEXT_STEPS |

## 已完成事项（关键成果）

1. **Monorepo**：`apps/{web,desktop,api}` + `packages/{types,api-client,learning-core,player,ui,config}`，turbo build/dev/test/lint/typecheck 全部可用。
2. **共享播放器核心** `@elp/player`：AudioEngine（加载/播放/seek/倍速 0.5–2x/音量/单篇循环/单句循环/A-B 循环/键盘快捷键/进度节流上报/资源释放）+ React 绑定 + 完整 UI。Web 与 Electron 共用。
3. **共享双语阅读器** `@elp/ui`：BilingualReader（点击段落播放/当前段高亮/自动滚动/双语切换/低置信度标记/收藏与生词动作）。
4. **API**（NestJS，/api 前缀，Swagger /docs）：users/categories/courses/uploads/import/progress/stats/favorites/vocabulary + 存储（local/r2）+ 统一错误处理 + DTO 校验。
5. **数据库**：16 模型（User/Course/Category/AudioAsset/DocumentAsset/Transcript/TranscriptParagraph/TranscriptSentence/LearningProgress/LearningSession/Vocabulary/UserVocabulary/Favorite/ImportJob/ImportFile/StorageObject），时间戳可空，支持多用户。
6. **音频服务**：`GET /storage/file/*` 支持 HTTP Range（206），音频拖动进度已实测。
7. **PDF 智能导入**（真实数据验证）：
   - PyMuPDF 解析：Episode 23 对照 PDF → 35 段、34 段中英配对成功、公众号水印过滤 ✓
   - 滚动卡拉OK式 SRT 处理：769 cue → 行级去重 367 行 → 时间戳对齐 **21/35（60%）**，其余保持 null（绝不伪造时间）
   - 文件名匹配：PDF/MP3/SRT `Episode N` 自动配对 ✓
   - 校对界面：编辑/拆分/合并/排序/删除/低置信度标记 ✓
   - 发布：生成正式课程 + AudioAsset + DocumentAsset（原始 PDF 保留）✓
8. **学习记录**：心跳保存 positionMs → continueLearning 恢复播放位置 ✓；Dashboard 统计/连续天数 ✓。

## 测试结果摘要（真实执行）

- `@elp/learning-core` 单测：**14/14 通过**（SRT 解析/滚动字幕/时间戳对齐/循环逻辑/streak）
- `@elp/player` 单测：**7/7 通过**（loopJump/isValidRange）
- API 实测：/users/me、/courses、Range 流式 206、heartbeat、stats/dashboard、import 全链路
- 浏览器实测（IAB）：Dashboard 渲染、EP1 播放器（点击段落→0:08→自动播放→0:09）、单句循环锁回 0:08、EP23（真实 MP3 20:07）点击段落→0:48→播放至 0:50
- Web build：7 路由全部生成 ✓

## 2026-11-12 追加 2：Electron 打包版可用性修复

用户反馈打包客户端"一直转圈"。根因链与修复：
1. **CORS 拒绝**：打包版从 file:// 加载（Origin `null`）不在白名单 → API CORS 改为回调式放行（3000/5173/null）。
2. **无限转圈 UX**：查询失败后永远 Spinner → Dashboard/课程页改为错误提示 + 重试指引。
3. **导入按钮空请求**：桌面导入页多余的一次空表单请求（必 400）→ 删除，改用 `api.baseUrl`。
4. **打包版静默退出**：userData 与 dev 版相同（`@elp/desktop`）→ 共用单实例锁，dev 窗口开着时打包版立即退出 → `app.setName('English Learning Platform')` 独立 userData。
5. **builder 产物坏签名 + asar 完整性校验**：afterPack 用 @electron/fuses 关闭 `EnableEmbeddedAsarIntegrityValidation` 并自动 ad-hoc 重签。
6. 产物：`release/mac-arm64/English Learning Platform.app`（可正常启动并连接 API）。

## 2026-11-12 追加：双语字幕导入（用户反馈修复）

用户反馈"导入不能解析中文"（英文/中文字幕是两个独立 SRT 文件）。根因与修复：

1. **multer 文件名 Latin-1 乱码**（中文文件名变 `ï¼è¯æ...`）→ `fixFilename()` 修复，匹配恢复。
2. **中文字幕被忽略**：只取第一个匹配 SRT → 新增 `buildBilingualFromSrts`：英/中滚动字幕行级时间重叠配对（≥60%）→ 12s/句末标点重新聚段 → 双语段落（时间戳 100% 真实）。
3. **纯字幕任务无法发布** → `publishJob` 支持合成双语 SRT 生成课程。
4. **重复导入被静默跳过** → DUPLICATE 文件也参与解析与合成（可通过 retry 重导）。

实测（用户真实 Episode 1 资料：英文 SRT 769 cue + 中文 SRT 462 cue + MP3）：
**64 段 100% 双语、100% 真实时间戳**，点击段落跳转播放验证通过。

## 已知问题

1. Electron 二进制下载中（`node_modules/electron/dist` 缺失，手动 `node <pnpm>/electron/install.js` 后台执行）。
2. R2 未接真实密钥（STORAGE_DRIVER=local 开发）。
3. 时间戳对齐 60% 覆盖率：剩余段落需人工校对（界面支持）；后续可加 Whisper 自动对齐。
4. gh CLI 未安装，GitHub 仓库尚未创建（PART 10 规定不阻塞开发）。
5. 批量导入 UI 已支持多文件（一次任务 100 文件），248 篇全量导入建议分批（每批 ≤50）。

## 本轮文件变更摘要

- 全部源码（见 git status）
- docs/*.md 全套
- services/pdf-parser/.venv（本地，gitignore）

## 下一步

见 `docs/NEXT_STEPS.md`。
