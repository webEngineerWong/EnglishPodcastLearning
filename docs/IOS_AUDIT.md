# iOS 审计报告

> 审计时间：2026-11-13。技术栈由全仓扫描确认（.xcodeproj / Podfile / Swift / pubspec / app.json），
> 非预设。结论以仓库实际代码为准。

## 一、技术栈结论（扫描证据）

| 项 | 结论 | 证据 |
|---|---|---|
| 框架 | **React Native 0.88 + Expo SDK 58**（TypeScript），**不是** SwiftUI/UIKit/Flutter 应用 | `apps/mobile/package.json`（expo ~58.0.25, react-native 0.88.1）；仓库内无 Flutter `pubspec.yaml` |
| 原生工程 | Expo prebuild 生成的 iOS 工程（CNG 模式，`ios/` 不入库），AppDelegate/SceneDelegate 为 Expo 标准壳 | `apps/mobile/ios/app.xcodeproj`、`AppDelegate.swift`（仅 Expo 启动样板，无业务 Swift 代码） |
| 原生依赖 | CocoaPods：107 pods（expo-modules-core、expo-audio、hermes-engine、RNCAsyncStorage、react-native-slider 等） | `apps/mobile/ios/Podfile.lock` |
| 业务语言 | 全部业务逻辑在 `apps/mobile/App.tsx`（自包含 ~1100 行 TSX），Swift 层零业务代码 | 仓库扫描 |
| Bundle ID / 签名 | com.myenglishlearning.app，Apple Personal Team（免费签名，7 天有效期） | `app.json`、Signing & Capabilities |
| 最低 iOS 版本 | Expo SDK 58 默认（iOS 15.1+） | Podfile 平台版本 |
| 设备 | 已在真机 iPhone 17 Pro（Hzb）上以 Release 配置安装运行 | 本会话实测 |

**结论：不迁移 SwiftUI/UIKit（用户规则「不要擅自改变技术栈」）。UI 优化在 RN 层进行，
原生能力（音频会话/锁屏/灵动岛）通过 expo-audio 暴露的系统能力使用。**

## 二、音频播放实现（逐项核对）

| 能力 | 实现方式 | 状态 |
|---|---|---|
| 播放引擎 | `expo-audio` `useAudioPlayer` / `useAudioPlayerStatus`（AVFoundation 封装） | ✅ |
| 音频会话 | `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })` —— 静音键可播、后台持续 | ✅ |
| 后台播放 | UIBackgroundModes `audio`（app.json infoPlist） | ✅ |
| 锁屏/控制中心 | `player.setActiveForLockScreen(true, { title, artist, albumTitle, artworkUrl }, { showSeekBackward/Forward })`（expo-audio 内建 MPNowPlayingInfoCenter + MPRemoteCommandCenter 封装，见 expo-audio `MediaController.swift`） | ✅ |
| 灵动岛 | 后台播放时系统自动显示音波胶囊；点击回 App 由「启动恢复」承接（见下） | ✅ |
| 进度上报 | 播放中每 5s `POST /api/progress/heartbeat`（与 Web/Desktop 同一接口） | ✅ |
| 续播 | 冷启动读 `/api/stats/dashboard` continueLearning（<6h 且 position>3s）自动进入课程并 seek；课程内优先 `resumeMs`，其次 `lastPositionMs` | ✅ |
| 远程命令 | 锁屏/耳机 play/pause/seek 由 expo-audio MediaController 自动桥接 | ✅ |
| 进度条拖动 | `@react-native-community/slider` onValueChange/onSlidingComplete | ✅ |

## 三、页面与导航结构

- 内存路由（无 react-navigation）：Dashboard / Courses / CourseDetail / Import(含校对) / Vocabulary / Favorites
- 底部 4 Tab（学习台/课程/生词本/收藏）+ 详情页压栈 + 设置 Modal
- API 接入：`@elp/api-client` 的 `ApiClient`（fetch），地址可配置并持久化（AsyncStorage）

## 四、UI 现状与本次改动

| 项 | 改造前 | 本次改动 |
|---|---|---|
| 主题 | **仅浅色硬编码**（全部 hex 写死） | 色板 `PALETTES`（对齐 Web tokens）+ `useColorScheme` + `makeStyles(palette)`，全组件适配系统深浅模式 |
| 状态栏 | 固定 default | `barStyle` 随主题 |
| 图标 | Emoji（📊📚🔤⭐） | **保留 Emoji**：RN 接入 lucide 需要引入 `react-native-svg` 原生依赖（+pod install +构建链变更），收益不匹配风险；声明为允许的平台差异（Apple 原生彩色 emoji 观感自然） |
| 播放器 | 进度条 + 播放/暂停/«15s + A±字号 + 跟随开关 | 已具备（上阶段完成） |
| 字幕跟随 | FlatList + scrollToIndex + memo 段落行 | 已具备 |

## 五、已知问题 / 限制

1. 免费签名 7 天过期（`apps/mobile/scripts/reinstall.sh` 一键续期，设备 ID 本地化）。
2. 灵动岛 compact 形态只有音波动画——精细进度环需 ActivityKit Live Activity（Widget Extension），列为远期。
3. 无离线下载（P2，见 parity 文档）。
4. 生词/收藏「新增」入口在手机端缺失（列表与状态切换已有）——roadmap Sprint 5。
