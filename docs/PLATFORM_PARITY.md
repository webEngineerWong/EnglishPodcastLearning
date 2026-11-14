# 三端功能对齐表（PLATFORM_PARITY）

> 2026-11-13 审计快照。✅=已实现 ✅*=本次现代化中改进 ⏳=部分/待补 ❌=未实现。
> 状态以代码为准，未实现项不标完成。

| 功能 | Web | Desktop | iOS | 优先级 |
|---|---|---|---|---|
| 首页 Dashboard | ✅* 欢迎区/继续学习(封面)/统计/快速入口/最近列表 | ✅ 统计+继续学习+最近导入 | ✅ 统计+继续学习 | P1 |
| 课程列表 | ✅* 封面 Grid(3列)+搜索/分类/收藏筛选+分页 | ✅ 列表卡(搜索/新建/收藏) | ✅ 列表+下拉刷新 | P1 |
| 课程详情 | ✅* 播放器sticky+三标签(字幕/资料/笔记)+时间编辑 | ✅ 三标签对齐 | ✅ 播放卡+双语+笔记打开 | P1 |
| 音频播放 | ✅* AudioEngine：播放/拖动/«5s | ✅ 同 Web | ✅ expo-audio+Slider+«15s | P0 |
| 倍速播放 | ✅ 0.5–2x | ✅ 0.5–2x | ❌ **待补**（expo-audio setRate） | P1 |
| 单句循环 | ✅ Repeat1+L键 | ✅ | ❌ **待补** | P1 |
| A-B 循环 | ✅ markA/markB | ✅ engine 有、UI 未挂 | ❌ | P1 |
| 字幕同步 | ✅ findActiveParagraph+autoScroll | ✅ | ✅ 高亮+跟随+开关 | P0 |
| 双语阅读 | ✅ 双语/英/中+复制+收藏+生词 | ✅ 同左 | ✅ 双语展示+点击跳转；复制/收藏 ❌ | P0 |
| 生词本 | ✅ 列表+状态切换+搜索 | ✅ 列表+状态切换 | ✅ 列表+状态切换；新增入口 ❌ | P1 |
| 收藏 | ✅ 课程+句子 | ✅ 课程+句子 | ✅ 列表；新增入口 ❌ | P1 |
| 学习记录 | ✅ sessions+stats | ✅ dashboard | ✅ 学习台统计 | P1 |
| 学习趋势图 | ✅ Recharts 近7/14/30天 | ✅ 同 Web | ❌（RN 无 Recharts，不做） | P2 |
| 进度同步 | ✅ heartbeat 5s | ✅ heartbeat 5s | ✅ heartbeat 5s | P0 |
| 离线学习 | ⏳ 仅音频下载按钮 | ⏳ 仅音频下载按钮 | ✅ 下载音频+双语字幕到沙盒，断网播放/阅读 | P2 |
| 文件导入 | ✅ 拖拽+批量+进度 | ✅ 原生对话框+批量 | ❌（设计为桌面/网页端职责） | P1 |
| 封面展示 | ✅* 列表/继续学习卡 | ⏳ 列表卡未接 coverUrl | ✅* 锁屏封面(回退App图标) | P1 |
| 封面设置 | ✅* 设置封面按钮 | ❌ | ❌（消费端） | P1 |
| 学习笔记 PDF | ✅ 三标签+上传/删除+inline预览 | ✅ 对齐 | ✅ 系统浏览器打开（RN 无内嵌 PDF；Safari 渲染完整） | P0 |
| 学习台欢迎区 | ✅* 时段问候 | ❌（直接统计） | ❌ | P2 |
| 快捷键 | ❌ | ✅ 全局 Alt+E/P | ✅ 锁屏/耳机（系统） | P1 |

## 允许的平台差异（设计决定，非缺陷）

| 能力 | Web | Desktop | iOS |
|---|---|---|---|
| 文件上传 | 浏览器选择/拖拽 | 原生对话框 IPC | 不做（资料整理在电脑端完成） |
| 播放引擎 | HTMLAudio（packages/player AudioEngine） | 同 Web | AVFoundation（expo-audio） |
| 后台播放 | 浏览器限制 | Electron 悬浮 | 原生后台音频+锁屏 |
| 快捷键 | 无 | 全局快捷键 | 耳机/锁屏控制 |
| 图标 | lucide-react | lucide-react | Emoji（RN 接 lucide 需 react-native-svg 原生链，暂不引入） |
| 笔记 PDF | iframe 内嵌 | iframe 内嵌 | 系统浏览器打开（iOS WebView PDF 只显首页） |

## 统一数据源

三端仅通过 REST API 同步：课程/段落/时间戳/收藏/生词/进度(heartbeat)/学习记录。
客户端零本地业务数据库；iOS 持久化仅限 API 地址与字号偏好（AsyncStorage）。
