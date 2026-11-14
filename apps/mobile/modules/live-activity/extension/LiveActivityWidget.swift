import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// 色板与 App.tsx PALETTES 对齐：深色 #0f1420 / 主色 #818cf8（dark primary）
private let islandPrimary = Color(red: 0.506, green: 0.549, blue: 0.973)
private let islandBackground = Color(red: 0.059, green: 0.078, blue: 0.125)

// MARK: - Lucide 图标（web 端 @elp/icons 的 lucide-react 图形，SVG path 原样移植）
// 24×24 viewBox、stroke 1.75、round cap/join；此处内置 SVG path 解释器精确还原。

/// 极简 SVG path 解释器：支持 M/L/H/V/C/S/Q/T/A/Z 与全部相对命令（足够覆盖 lucide 图形）
private enum SVGPathParser {
  static func path(_ d: String) -> Path {
    var p = Path()
    var tokens = tokenize(d)
    var index = 0
    var current = CGPoint.zero
    var start = CGPoint.zero
    var lastControl = CGPoint.zero
    var lastCommand: Character = " "

    func nextNumber() -> CGFloat? {
      guard index < tokens.count else { return nil }
      defer { index += 1 }
      if case .num(let v) = tokens[index] { return v }
      return nil
    }
    func nextPoint(_ dx: CGFloat = 0, _ dy: CGFloat = 0) -> CGPoint? {
      guard let x = nextNumber(), let y = nextNumber() else { return nil }
      return CGPoint(x: x + dx, y: y + dy)
    }
    func relativeParams(_ rel: CGFloat, _ abs: CGFloat, isRelative: Bool) -> CGFloat {
      isRelative ? rel : abs
    }

    while index < tokens.count {
      guard case .cmd(let cmd) = tokens[index] else { break }
      index += 1
      let isRel = cmd.isLowercase
      switch Character(cmd.uppercased()) {
      case "M":
        if let pt = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0) {
          p.move(to: pt); current = pt; start = pt
        }
        // 后续数字对按隐式 L 处理
        while index < tokens.count, case .num = tokens[index] {
          guard let pt = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0) else { break }
          p.addLine(to: pt); current = pt
        }
      case "L":
        while index < tokens.count, case .num = tokens[index] {
          guard let pt = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0) else { break }
          p.addLine(to: pt); current = pt
        }
      case "H":
        while index < tokens.count, case .num(let v) = tokens[index] {
          index += 1
          let x = isRel ? current.x + v : v
          p.addLine(to: CGPoint(x: x, y: current.y)); current = CGPoint(x: x, y: current.y)
        }
      case "V":
        while index < tokens.count, case .num(let v) = tokens[index] {
          index += 1
          let y = isRel ? current.y + v : v
          p.addLine(to: CGPoint(x: current.x, y: y)); current.y = y
        }
      case "C":
        while index < tokens.count, case .num = tokens[index] {
          guard let c1 = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0),
            let c2 = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0),
            let to = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0)
          else { break }
          p.addCurve(to: to, control1: c1, control2: c2)
          lastControl = c2; current = to
        }
      case "S":
        while index < tokens.count, case .num = tokens[index] {
          guard let c2 = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0),
            let to = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0)
          else { break }
          let c1 = lastCommand == "C" || lastCommand == "S"
            ? CGPoint(x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y)
            : current
          p.addCurve(to: to, control1: c1, control2: c2)
          lastControl = c2; current = to
        }
      case "Q":
        while index < tokens.count, case .num = tokens[index] {
          guard let c = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0),
            let to = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0)
          else { break }
          let c1 = CGPoint(x: current.x + (c.x - current.x) * 2 / 3, y: current.y + (c.y - current.y) * 2 / 3)
          let c2 = CGPoint(x: to.x + (c.x - to.x) * 2 / 3, y: to.y + (c.y - to.y) * 2 / 3)
          p.addCurve(to: to, control1: c1, control2: c2)
          lastControl = c; current = to
        }
      case "A":
        while index < tokens.count, case .num = tokens[index] {
          guard let rx = nextNumber(), let ry = nextNumber(), let rot = nextNumber(),
            let laf = nextNumber(), let swf = nextNumber(),
            let to = nextPoint(isRel ? current.x : 0, isRel ? current.y : 0)
          else { break }
          addArc(&p, from: current, to: to, rx: rx, ry: ry, rotation: rot, largeArc: laf > 0.5, sweep: swf > 0.5)
          current = to
        }
      case "Z":
        p.closeSubpath()
        current = start
      default:
        break
      }
      lastCommand = cmd
    }
    _ = relativeParams // 静默未用警告
    _ = tokens; _ = lastControl
    return p
  }

  private enum Token { case cmd(Character), num(CGFloat) }

  private static func tokenize(_ d: String) -> [Token] {
    var tokens: [Token] = []
    var num = ""
    for ch in d {
      if ch.isLetter {
        if !num.isEmpty { tokens.append(.num(CGFloat(Double(num) ?? 0))); num = "" }
        tokens.append(.cmd(ch))
      } else if ch.isNumber || ch == "." || ch == "-" || ch == "e" || ch == "E" {
        if ch == "-" && !num.isEmpty && !num.hasSuffix("e") && !num.hasSuffix("E") {
          tokens.append(.num(CGFloat(Double(num) ?? 0))); num = "-"
        } else {
          num.append(ch)
        }
      } else if !num.isEmpty {
        tokens.append(.num(CGFloat(Double(num) ?? 0))); num = ""
      }
    }
    if !num.isEmpty { tokens.append(.num(CGFloat(Double(num) ?? 0))) }
    return tokens
  }

  /// SVG arc (endpoint parameterization) → CGPath arc（标准中心参数化转换）
  private static func addArc(_ p: inout Path, from: CGPoint, to: CGPoint, rx: CGFloat, ry: CGFloat, rotation: CGFloat, largeArc: Bool, sweep: Bool) {
    let rad = rotation * .pi / 180
    let cosR = cos(rad), sinR = sin(rad)
    let dx2 = (from.x - to.x) / 2, dy2 = (from.y - to.y) / 2
    let x1p = cosR * dx2 + sinR * dy2
    let y1p = -sinR * dx2 + cosR * dy2
    let rxSq = max(rx * rx, 0.0001), rySq = max(ry * ry, 0.0001)
    let lambda = x1p * x1p / rxSq + y1p * y1p / rySq
    let rxAdj = lambda > 1 ? sqrt(lambda) * rx : rx
    let ryAdj = lambda > 1 ? sqrt(lambda) * ry : ry
    let num = rxAdj * rxAdj * ryAdj * ryAdj - rxAdj * rxAdj * y1p * y1p - ryAdj * ryAdj * x1p * x1p
    let den = rxAdj * rxAdj * y1p * y1p + ryAdj * ryAdj * x1p * x1p
    guard den > 0 else {
      p.addLine(to: to)
      return
    }
    var co = sqrt(max(0, num / den))
    if largeArc == sweep { co = -co }
    let cxp = co * rxAdj * y1p / ryAdj
    let cyp = -co * ryAdj * x1p / rxAdj
    let cx = cosR * cxp - sinR * cyp + (from.x + to.x) / 2
    let cy = sinR * cxp + cosR * cyp + (from.y + to.y) / 2
    let angle = { (ux: CGFloat, uy: CGFloat, vx: CGFloat, vy: CGFloat) -> CGFloat in
      let dot = ux * vx + uy * vy
      let len = sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
      var a = acos(min(1, max(-1, dot / max(len, 0.0001))))
      if ux * vy - uy * vx < 0 { a = -a }
      return a
    }
    let theta1 = angle(1, 0, (x1p - cxp) / rxAdj, (y1p - cyp) / ryAdj)
    var delta = angle((x1p - cxp) / rxAdj, (y1p - cyp) / ryAdj, (-x1p - cxp) / rxAdj, (-y1p - cyp) / ryAdj)
    if !sweep && delta > 0 { delta -= 2 * .pi }
    if sweep && delta < 0 { delta += 2 * .pi }

    let transform = CGAffineTransform(translationX: cx, y: cy)
      .rotated(by: rad)
      .scaledBy(x: rxAdj, y: ryAdj)
    let arc = CGMutablePath()
    arc.addArc(center: .zero, radius: 1, startAngle: theta1, endAngle: theta1 + delta, clockwise: !sweep, transform: transform)
    p.addPath(Path(arc))
  }
}

/// lucide 图标（SVG path 移植：play / pause / skipBack / skipForward，与 web 端 @elp/icons 同源）
private struct LucideIcon: View {
  /// lucide 24×24 viewBox 的 path d 列表（null path = roundedRect 描述）
  let paths: [String]
  let rects: [(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, rx: CGFloat)]
  let size: CGFloat
  var color: Color = .white
  var strokeWidth: CGFloat = 1.75
  /// 实心渲染（fill 替代 stroke）：播放/暂停按钮用
  var filled: Bool = false

  static func play(_ size: CGFloat, color: Color = .white) -> LucideIcon {
    // 实心三角（Spotify 式按钮）：fill 渲染而非描边
    LucideIcon(paths: ["M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"], rects: [], size: size, color: color, filled: true)
  }
  static func pause(_ size: CGFloat, color: Color = .white) -> LucideIcon {
    LucideIcon(paths: [], rects: [(14, 3, 5, 18, 1), (5, 3, 5, 18, 1)], size: size, color: color)
  }
  static func skipBack(_ size: CGFloat, color: Color = .white) -> LucideIcon {
    LucideIcon(
      paths: [
        "M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z",
        "M3 20V4"
      ],
      rects: [], size: size, color: color
    )
  }
  static func skipForward(_ size: CGFloat, color: Color = .white) -> LucideIcon {
    LucideIcon(
      paths: [
        "M21 4v16",
        "M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"
      ],
      rects: [], size: size, color: color
    )
  }

  var body: some View {
    let scale = size / 24
    ZStack {
      ForEach(rects.indices, id: \.self) { i in
        let r = rects[i]
        RoundedRectangle(cornerRadius: r.rx * scale, style: .continuous)
          .frame(width: r.w * scale, height: r.h * scale)
          .offset(
            x: (r.x + r.w / 2 - 12) * scale,
            y: (r.y + r.h / 2 - 12) * scale
          )
      }
      ForEach(paths.indices, id: \.self) { i in
        SVGPath(p: SVGPathParser.path(paths[i]), scale: scale, strokeWidth: strokeWidth, color: color, filled: filled)
          .frame(width: size, height: size)
      }
    }
    .frame(width: size, height: size)
  }
}

private struct SVGPath: View {
  let p: Path
  let scale: CGFloat
  let strokeWidth: CGFloat
  let color: Color
  var filled: Bool = false

  var body: some View {
    let scaled = p.applying(CGAffineTransform(scaleX: scale, y: scale))
    if filled {
      scaled.fill(color)
    } else {
      scaled
        .stroke(color, style: StrokeStyle(lineWidth: strokeWidth * scale, lineCap: .round, lineJoin: .round))
        .background(
          // 放大 stroke 命中区域（视觉与 lucide-react 一致：stroke 在 path 中线上）
          scaled.fill(color.opacity(0.0001))
        )
    }
  }
}

/// 液压玻璃基调背景：系统磨砂材质叠一层浅白，深浅壁纸下都呈明亮玻璃感（不用深色底）
private struct GlassBackground: View {
  var body: some View {
    Rectangle()
      .fill(.ultraThinMaterial)
      .overlay(Color.white.opacity(0.35))
  }
}

struct LiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveActivityAttributes.self) { context in
      // 锁屏 / 横幅卡片：拟态玻璃染色（封面主色）+ 封面/字幕/三键控制
      LockScreenCard(context: context)
        .activityBackgroundTint(hexColor(context.state.colorHex) ?? islandBackground)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      // 灵动岛
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          ProgressRing(progress: context.state.progress)
            .frame(width: 34, height: 34)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.courseTitle)
              .font(.system(size: 14, weight: .semibold))
              .lineLimit(1)
            Text(context.state.isPlaying ? "正在播放" : "已暂停")
              .font(.system(size: 11))
              .foregroundStyle(.secondary)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.isPlaying ? "▶" : "⏸")
            .font(.system(size: 17))
        }
        DynamicIslandExpandedRegion(.bottom) {
          ProgressView(value: context.state.progress)
            .progressViewStyle(.linear)
            .tint(islandPrimary)
        }
      } compactLeading: {
        // compact 左侧：播放进度环
        ProgressRing(progress: context.state.progress)
          .frame(width: 15, height: 15)
      } compactTrailing: {
        // compact 右侧：播放/暂停状态
        Text(context.state.isPlaying ? "▶" : "⏸")
          .font(.system(size: 11))
      } minimal: {
        ProgressRing(progress: context.state.progress)
          .frame(width: 15, height: 15)
      }
    }
  }
}

/// 圆环进度（trim 起点 0.001 保证空进度时也能看到描边）
struct ProgressRing: View {
  var progress: Double
  var body: some View {
    ZStack {
      Circle()
        .stroke(Color.white.opacity(0.25), lineWidth: 3)
      Circle()
        .trim(from: 0, to: max(0.001, min(1, progress)))
        .stroke(islandPrimary, style: StrokeStyle(lineWidth: 3, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
  }
}

/// hex 颜色解析（App 端封面取色结果，如 #RRGGBB）
private func hexColor(_ hex: String?) -> Color? {
  guard let hex = hex?.trimmingCharacters(in: .whitespacesAndNewlines), hex.hasPrefix("#"), hex.count == 7 else {
    return nil
  }
  var value: UInt64 = 0
  Scanner(string: String(hex.dropFirst())).scanHexInt64(&value)
  return Color(
    red: Double((value >> 16) & 0xff) / 255,
    green: Double((value >> 8) & 0xff) / 255,
    blue: Double(value & 0xff) / 255
  )
}

struct LockScreenCard: View {
  let context: ActivityViewContext<LiveActivityAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // ── 顶部：封面 + 音频名（Spotify 锁屏卡片字体样式：粗体大字 + 浅色副行）──
      HStack(alignment: .center, spacing: 10) {
        CoverFromUrl(coverUrl: context.state.coverUrl, size: 42)
        VStack(alignment: .leading, spacing: 3) {
          Text(context.attributes.courseTitle)
            .font(.system(size: 16, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
          Text(context.state.subtitle?.isEmpty == false ? context.state.subtitle! : "英语学习")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(.white.opacity(0.72))
            .lineLimit(1)
        }
        Spacer(minLength: 0)
      }

      // ── 进度条 ──
      ProgressView(value: context.state.progress)
        .progressViewStyle(.linear)
        .tint(.white.opacity(0.9))

      // ── 控制按钮行：上一课 / 播放暂停 / 下一课（iOS 17+ AppIntent 实时控制）──
      HStack(spacing: 0) {
        Spacer(minLength: 0)
        if #available(iOSApplicationExtension 17.0, *) {
          Button(intent: PrevEpisodeIntent()) {
            LucideIcon.skipBack(20, color: .white)
          }
          .buttonStyle(.plain)
          .padding(.horizontal, 14)
          Button(intent: TogglePlaybackIntent()) {
            ZStack {
              Circle()
                .fill(.white)
                .frame(width: 42, height: 42)
              if context.state.isPlaying {
                LucideIcon.pause(18, color: .black)
              } else {
                LucideIcon.play(18, color: .black)
              }
            }
          }
          .buttonStyle(.plain)
          .padding(.horizontal, 14)
          Button(intent: NextEpisodeIntent()) {
            LucideIcon.skipForward(20, color: .white)
          }
          .buttonStyle(.plain)
        }
        Spacer(minLength: 0)
      }
    }
    .padding(14)
  }
}

/// 锁屏封面（ContentState 带封面地址；无封面回退默认图）
private struct CoverFromUrl: View {
  let coverUrl: String?
  let size: CGFloat

  var body: some View {
    Group {
      // App 端已拼好绝对地址（含签名 URL），此处直接使用
      if let raw = coverUrl, !raw.isEmpty, let url = URL(string: raw) {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let img):
            img.resizable().scaledToFill()
          default:
            fallback
          }
        }
      } else {
        fallback
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
  }

  private var fallback: some View {
    Group {
      if let img = UIImage(named: "DefaultCover") {
        Image(uiImage: img).resizable().scaledToFill()
      } else {
        Image(systemName: "headphones").resizable().scaledToFit().padding(size * 0.2)
      }
    }
  }
}

// MARK: - 负一屏 / 主屏 中号小组件（4×2 systemMedium）：继续学习卡片
// 数据源：直接请求公网 API /api/stats/dashboard（小组件独立进程，不依赖 App Groups）；
// 点按深链 elp://resume?courseId=…&resumeMs=… 唤起 App 直达该课程续播。

/// API 地址候选（按序尝试，首个返回 200 的生效）：隧道域名全局可达优先，
/// LAN 直连同 Wi-Fi 提速。
/// 占位符不入库：部署者在 scripts/.env.device 配置 ELP_TUNNEL_URL / ELP_LAN_URL，
/// scripts/reinstall.sh 打包时自动注入真实地址、构建完成后再还原。
private let widgetApiCandidates = [
  "https://your-tunnel-domain.example",
  "http://192.168.1.100:3001"
]

// MARK: - 数据模型

private struct RecentCourse: Codable {
  let id: String
  let title: String
  let coverUrl: String?
  let lastPositionMs: Double
}

/// App 实时播放状态（心跳每 5s 上报，dashboard 返回；15s 未刷新即判定暂停）
private struct NowPlaying: Codable {
  let courseId: String
  let title: String
  let positionMs: Double
  let isPlaying: Bool
  let audioName: String?
  let coverUrl: String?
  /// 当前字幕（App 播放中随段落更新，经心跳上报）
  let subtitle: String?
}

private struct LearningDash: Codable {
  struct Continue: Codable {
    let courseId: String
    let title: String
    let positionMs: Double
  }
  let todayMs: Double
  let streakDays: Int
  let continueLearning: Continue?
  let recentCourses: [RecentCourse]?
  let nowPlaying: NowPlaying?
}

// MARK: - 播放控制（Interactive Widget，iOS 17+）
// 关键：AppIntent 默认在 widget 扩展进程执行，与主 App 不共享 NSNotificationCenter
// （原实现点击无效的根因）。改用 AudioPlaybackIntent —— 系统保证其 perform() 在
// 主 App 进程执行（媒体类 intent 的官方机制），进程内通知 → LiveActivityModule
// 监听 → sendEvent 转发 JS → expo-audio 播放器实际执行。

@available(iOS 17.0, *)
private struct TogglePlaybackIntent: AudioPlaybackIntent {
  static let title: LocalizedStringResource = "播放/暂停"
  static let description = IntentDescription("控制英语学习音频的播放与暂停")

  func perform() async throws -> some IntentResult {
    NotificationCenter.default.post(
      name: Notification.Name("elp.playback.command"),
      object: nil,
      userInfo: ["command": "toggle"]
    )
    return .result()
  }
}

@available(iOS 17.0, *)
private struct NextEpisodeIntent: AudioPlaybackIntent {
  static let title: LocalizedStringResource = "下一课"
  static let description = IntentDescription("切换到下一课音频")

  func perform() async throws -> some IntentResult {
    NotificationCenter.default.post(
      name: Notification.Name("elp.playback.command"),
      object: nil,
      userInfo: ["command": "next"]
    )
    return .result()
  }
}

@available(iOS 17.0, *)
private struct PrevEpisodeIntent: AudioPlaybackIntent {
  static let title: LocalizedStringResource = "上一课"
  static let description = IntentDescription("切换到上一课音频")

  func perform() async throws -> some IntentResult {
    NotificationCenter.default.post(
      name: Notification.Name("elp.playback.command"),
      object: nil,
      userInfo: ["command": "prev"]
    )
    return .result()
  }
}

private struct LearningEntry: TimelineEntry {
  let date: Date
  let dash: LearningDash?
  /// 当前播放封面的主色（拟态玻璃染色；nil 时回退玻璃白）
  let accentColor: Color?
  /// 本次数据实际命中的 API base（封面相对 URL 拼接用）
  let apiBase: String
}

// MARK: - Timeline Provider

private struct LearningProvider: TimelineProvider {
  func placeholder(in context: Context) -> LearningEntry {
    LearningEntry(date: .now, dash: nil, accentColor: nil, apiBase: widgetApiCandidates[0])
  }

  func getSnapshot(in context: Context, completion: @escaping (LearningEntry) -> Void) {
    Task {
      completion(await Self.fetch())
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<LearningEntry>) -> Void) {
    Task {
      let entry = await Self.fetch()
      // 10 分钟兜底刷新（App 播放状态变化时另有 reloadTimelines 即时刷新）
      let next = Calendar.current.date(byAdding: .minute, value: 10, to: .now) ?? .now.addingTimeInterval(600)
      completion(Timeline(entries: [entry], policy: .after(next)))
    }
  }

  /// 封面主色内存缓存（timeline 刷新间复用，key = 完整 URL）
  private static var colorCache: [String: Color] = [:]

  /// 依次尝试候选地址（隧道优先，LAN 回退），首个 200 且可解码的生效
  private static func fetch() async -> LearningEntry {
    for base in widgetApiCandidates {
      guard let url = URL(string: "\(base)/api/stats/dashboard") else { continue }
      var req = URLRequest(url: url, timeoutInterval: 8)
      req.setValue("EnglishPodcastWidget/1.0", forHTTPHeaderField: "User-Agent")
      if let (data, resp) = try? await URLSession.shared.data(for: req),
        (resp as? HTTPURLResponse)?.statusCode == 200,
        let dash = try? JSONDecoder().decode(LearningDash.self, from: data)
      {
        let accent = await accentColor(for: dash.nowPlaying?.coverUrl, base: base)
        return LearningEntry(date: .now, dash: dash, accentColor: accent, apiBase: base)
      }
    }
    return LearningEntry(date: .now, dash: nil, accentColor: nil, apiBase: widgetApiCandidates[0])
  }

  /// 下载封面缩略图并取平均主色（提饱和压亮度，近似 Spotify 拟态染色）
  private static func accentColor(for coverUrl: String?, base: String) async -> Color? {
    guard let raw = coverUrl, !raw.isEmpty else { return nil }
    let full = raw.hasPrefix("http") ? raw : base + raw
    if let cached = colorCache[full] { return cached }
    guard let url = URL(string: full) else { return nil }
    guard let (data, resp) = try? await URLSession.shared.data(from: url),
      (resp as? HTTPURLResponse)?.statusCode == 200,
      let cg = UIImage(data: data)?.cgImage
    else { return nil }
    let color = averageColor(of: cg)
    colorCache[full] = color
    return color
  }

  private static func averageColor(of cg: CGImage) -> Color? {
    let size = CGSize(width: 16, height: 16)
    guard let ctx = CGContext(
      data: nil, width: Int(size.width), height: Int(size.height),
      bitsPerComponent: 8, bytesPerRow: Int(size.width) * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }
    ctx.interpolationQuality = .medium
    ctx.draw(cg, in: CGRect(origin: .zero, size: size))
    guard let buf = ctx.data else { return nil }
    let px = buf.bindMemory(to: UInt8.self, capacity: 16 * 16 * 4)
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
    for i in stride(from: 0, to: 16 * 16 * 4, by: 4) {
      r += CGFloat(px[i]); g += CGFloat(px[i + 1]); b += CGFloat(px[i + 2])
    }
    let n = CGFloat(16 * 16)
    r /= n * 255; g /= n * 255; b /= n * 255
    // RGB → HSL：压亮度到白字可读区间、保住饱和度（Spotify 式中等饱和染色）
    let mx = max(r, g, b), mn = min(r, g, b)
    let l = (mx + mn) / 2
    let d = mx - mn
    var h: CGFloat = 0
    var s: CGFloat = 0
    if d > 0.0001 {
      s = d / (1 - abs(2 * l - 1))
      if mx == r { h = ((g - b) / d).truncatingRemainder(dividingBy: 6) / 6 }
      else if mx == g { h = ((b - r) / d + 2) / 6 }
      else { h = ((r - g) / d + 4) / 6 }
      if h < 0 { h += 1 }
    }
    s = min(0.62, max(0.22, s))
    let lAdj = min(0.42, max(0.24, l))
    return Color(hue: h, saturation: s, brightness: lAdj)
  }
}

// MARK: - 封面缩略图（AsyncImage；无封面/加载失败回退品牌色首字占位）

/// 无封面占位：品牌色底 + 标题首字（Spotify 风格，比 App 图标更易区分课程）
private struct CoverInitial: View {
  let title: String
  let size: CGFloat

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [islandPrimary.opacity(0.85), islandBackground.opacity(0.9)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      Text(title.trimmingCharacters(in: .whitespacesAndNewlines).first.map(String.init) ?? "E")
        .font(.system(size: size * 0.42, weight: .bold))
        .foregroundColor(.white)
    }
  }
}

/// 封面缩略图：宽高同时铺满所在槽位（负一屏底部一排大图占满卡片剩余空间，Spotify 式）
private struct CoverThumbnail: View {
  let course: RecentCourse
  /// 数据实际命中的 API base（相对封面 URL 拼接）
  let base: String

  private var coverAbsUrl: URL? {
    guard let raw = course.coverUrl, !raw.isEmpty else { return nil }
    if raw.hasPrefix("http") { return URL(string: raw) }
    return URL(string: base + raw)
  }

  var body: some View {
    Group {
      if let url = coverAbsUrl {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let img):
            img.resizable().scaledToFill()
          default:
            CoverInitial(title: course.title, size: 72)
          }
        }
      } else {
        CoverInitial(title: course.title, size: 72)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .clipped()
  }
}

// MARK: - 主卡片（布局 A：顶部今日时长+播放钮，下方4封面横排）

private struct LearningCard: View {
  let entry: LearningEntry

  private var todayMin: Int {
    Int((entry.dash?.todayMs ?? 0) / 60000)
  }

  private var continueLink: URL {
    if let c = entry.dash?.continueLearning {
      return URL(string: "elp://resume?courseId=\(c.courseId)&resumeMs=\(Int(c.positionMs))") ?? URL(string: "elp://resume")!
    }
    return URL(string: "elp://resume")!
  }

  private var recentCourses: [RecentCourse] {
    Array((entry.dash?.recentCourses ?? []).prefix(5))
  }

  /// App 实时播放状态（null = 未在播放/已暂停超时）
  private var nowPlaying: NowPlaying? {
    entry.dash?.nowPlaying
  }

  /// 拟态玻璃染色（当前封面主色）：有播放时 Spotify 式彩底白字，无播放时玻璃白深字
  private var tinted: Bool { entry.accentColor != nil }
  private var fgPrimary: Color { tinted ? .white : .primary }
  private var fgSecondary: Color { tinted ? Color.white.opacity(0.75) : Color.primary.opacity(0.62) }

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {

      // ── 上半区：当前播放音频（封面 + 名称 + 字幕 + 播放/暂停圆钮，参考 Spotify 锁屏卡片）──
      if let np = nowPlaying {
        HStack(alignment: .center, spacing: 10) {
          NowPlayingCover(coverUrl: np.coverUrl, title: np.audioName?.isEmpty == false ? np.audioName! : np.title, size: 44, base: entry.apiBase)
          VStack(alignment: .leading, spacing: 3) {
            Text(np.audioName?.isEmpty == false ? np.audioName! : np.title)
              .font(.system(size: 15, weight: .bold))
              .foregroundColor(fgPrimary)
              .lineLimit(1)
            // 字幕行：App 播放中随段落实时更新（经心跳上报）
            Text(np.subtitle?.isEmpty == false ? np.subtitle! : (np.isPlaying ? "正在播放" : "已暂停"))
              .font(.system(size: 11, weight: .medium))
              .foregroundColor(fgSecondary)
              .lineLimit(1)
          }
          Spacer(minLength: 0)
          if #available(iOSApplicationExtension 17.0, *) {
            Button(intent: TogglePlaybackIntent()) {
              ZStack {
                Circle()
                  .fill(Color.white.opacity(tinted ? 0.96 : 0.9))
                  .frame(width: 38, height: 38)
                if np.isPlaying {
                  LucideIcon.pause(16, color: .black)
                } else {
                  LucideIcon.play(16, color: .black)
                }
              }
            }
            .buttonStyle(.plain)
          }
        }
      } else {
        // 无播放：今日学习时长 + 续播按钮
        HStack(alignment: .center) {
          Text("🎧 今日 \(todayMin) 分钟")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(islandPrimary)
            .lineLimit(1)
          Spacer(minLength: 0)
          Link(destination: continueLink) {
            ZStack {
              Circle()
                .fill(islandPrimary)
                .frame(width: 38, height: 38)
              Text("▶")
                .font(.system(size: 15))
                .foregroundColor(.white)
            }
          }
        }
      }

      // ── 下半区：最近课程封面一排，宽高同时吸收卡片剩余空间（Spotify 式铺满）──
      if recentCourses.isEmpty {
        Text("打开 App 开始学习")
          .font(.system(size: 12))
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        HStack(alignment: .top, spacing: 10) {
          ForEach(recentCourses, id: \.id) { course in
            let link = URL(
              string: "elp://resume?courseId=\(course.id)&resumeMs=\(Int(course.lastPositionMs))"
            ) ?? URL(string: "elp://resume")!
            Link(destination: link) {
              CoverThumbnail(course: course, base: entry.apiBase)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
          }
        }
        .frame(maxHeight: .infinity)
      }
    }
    .frame(maxHeight: .infinity, alignment: .top)
    .padding(13)
  }
}

/// 当前播放封面（无封面回退品牌色首字占位；nowPlaying 标题取音频名去掉扩展名更像曲目名）
private struct NowPlayingCover: View {
  let coverUrl: String?
  let title: String
  let size: CGFloat
  /// 数据实际命中的 API base（相对封面 URL 拼接）
  let base: String

  private var absUrl: URL? {
    guard let raw = coverUrl, !raw.isEmpty else { return nil }
    return URL(string: raw.hasPrefix("http") ? raw : base + raw)
  }

  var body: some View {
    Group {
      if let url = absUrl {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let img):
            img.resizable().scaledToFill()
          default:
            CoverInitial(title: title, size: size)
          }
        }
      } else {
        CoverInitial(title: title, size: size)
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
  }
}

// MARK: - Widget 注册

/// 负一屏 / 主屏小组件（中号 4×2）
struct LearningWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "LearningWidget", provider: LearningProvider()) { entry in
      // 拟态玻璃：磨砂材质为主 + 当前封面主色轻染（罩层压低让壁纸玻璃感透出）
      let background = Rectangle()
        .fill(.ultraThinMaterial)
        .overlay(entry.accentColor?.opacity(0.38) ?? Color.white.opacity(0.14))
      if #available(iOSApplicationExtension 17.0, *) {
        LearningCard(entry: entry)
          .containerBackground(for: .widget) { background }
      } else {
        LearningCard(entry: entry)
          .padding(14)
          .background(background)
      }
    }
    .configurationDisplayName("今日学习")
    .description("当前播放音频与最近课程封面，点封面直达续播，可控制播放。")
    .supportedFamilies([.systemMedium])
  }
}
