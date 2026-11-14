import ActivityKit
import CoreFoundation
import ExpoModulesCore
import MediaPlayer
import WidgetKit

/**
 * LiveActivityModule — Expo Modules API 本地模块（iOS 16.4+）。
 * JS 侧：useLiveActivity.ts 经 requireNativeModule('LiveActivity') 调用。
 *
 * 说明：
 * - 使用 ActivityKit 本地 Live Activity（无需推送），App 内直接 update。
 * - 不使用 App Groups：ActivityKit 的 start/update 都发生在主 App 进程内，
 *   Extension 只负责渲染 UI；这样免费 Apple 开发者账号（Personal Team）也能签名。
 * - 所有函数幂等：重复 start 会先结束已有活动；无活动时 update/stop 为 no-op。
 *
 * 双向控制（锁屏原生 Now Playing 三键 + 负一屏小组件按钮）：
 * - 本模块在 OnCreate 直接向 MPRemoteCommandCenter 注册 next/previousTrack handler
 *   （MPRemoteCommandCenter 的多个 handler 并行调用，与 expo-audio 自己的 handler 互不影响），
 *   直接 sendEvent 转发 JS —— 这是锁屏 ⏮⏭ 切课的最短路径。
 * - expo-audio patch（AudioPlayer supports 与 nextTrack）保证系统在 options.showNextTrack=true
 *   时把 nextTrackCommand.isEnabled 打开（enabled 与 handler 是两回事，两者都要满足）。
 * - 负一屏小组件按钮：AppIntent 可能被系统派发到 Widget 扩展进程执行，进程内通知不可达——
 *   命令经 libnotify Darwin 通知（notify_post，elp.cmd.toggle/next/prev，免权限、无需 App Groups）
 *   跨进程广播，本模块 notify_register_dispatch 监听 → sendEvent 转发 JS。
 * - reloadWidget()：App 播放状态变化时让 WidgetKit 立即重拉负一屏 timeline。
 */
public class LiveActivityModule: Module {
  /// 负一屏按钮命令的 Darwin 通知 token（notify_register_dispatch 返回，OnDestroy 逐个 cancel）
  private var notifyTokens: [Int32] = []
  private var remoteTargets: [(MPRemoteCommand, Any)] = []
  /// 封面主色缓存（key = 封面 URL；start/update 间复用，避免重复下载取色）
  private static var colorCache: [String: String] = [:]

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    Events("onPlaybackCommand")

    OnCreate {
      // 负一屏小组件按钮命令（跨进程）：widget 侧 notify_post → 本模块按通知名注册
      // notify_register_dispatch handler（主队列）→ sendEvent 转发 JS
      let queue = DispatchQueue.main
      for cmd in ["toggle", "next", "prev"] {
        var token: Int32 = 0
        elpNotifyRegisterDispatch("elp.cmd.\(cmd)", &token, queue) { [weak self] _ in
          self?.sendEvent("onPlaybackCommand", ["command": cmd])
        }
        if token != 0 { self.notifyTokens.append(token) }
      }
      // 锁屏系统媒体键（⏮⏭）：MPRemoteCommandCenter 多 handler 并行，与 expo-audio 的
      // handler 独立执行；直接 sendEvent 最短路径，不依赖中间转发
      let center = MPRemoteCommandCenter.shared()
      let next = center.nextTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onPlaybackCommand", ["command": "next"])
        return .success
      }
      let prev = center.previousTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onPlaybackCommand", ["command": "prev"])
        return .success
      }
      self.remoteTargets = [(center.nextTrackCommand, next), (center.previousTrackCommand, prev)]
    }

    OnDestroy {
      for token in self.notifyTokens {
        elpNotifyCancel(token)
      }
      self.notifyTokens = []
      for (command, target) in self.remoteTargets {
        command.removeTarget(target)
      }
      self.remoteTargets = []
    }

    /// 系统是否允许显示 Live Activity（设置里被关掉/低电量模式下为 false，JS 侧据此优雅降级）
    Function("areActivitiesEnabled") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// 开始新的 Live Activity（结束已有活动后重建，progress 归 0、状态为播放中）
    AsyncFunction("start") { (courseTitle: String, coverUrl: String?, subtitle: String?) async throws in
      for activity in Activity<LiveActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      let colorHex = await Self.accentHex(for: coverUrl)
      let attributes = LiveActivityAttributes(courseTitle: courseTitle)
      let content = ActivityContent(
        state: LiveActivityAttributes.ContentState(
          progress: 0,
          isPlaying: true,
          updatedAt: Date(),
          subtitle: subtitle,
          coverUrl: coverUrl,
          colorHex: colorHex
        ),
        staleDate: nil
      )
      _ = try Activity.request(attributes: attributes, content: content)
    }

    /// 更新进度（progress 0~1）与播放状态；段落切换时同步当前字幕与封面
    AsyncFunction("update") { (progress: Double, isPlaying: Bool, subtitle: String?, coverUrl: String?) async throws in
      let clamped = min(1, max(0, progress))
      let colorHex = await Self.accentHex(for: coverUrl)
      let content = ActivityContent(
        state: LiveActivityAttributes.ContentState(
          progress: clamped,
          isPlaying: isPlaying,
          updatedAt: Date(),
          subtitle: subtitle,
          coverUrl: coverUrl,
          colorHex: colorHex
        ),
        staleDate: nil
      )
      for activity in Activity<LiveActivityAttributes>.activities {
        await activity.update(content)
      }
    }

    /// 结束当前 Live Activity（暂停/播放结束/切换课程）
    AsyncFunction("stop") { () async throws in
      for activity in Activity<LiveActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }

    /// 负一屏小组件立即重拉 timeline（App 播放状态变化时调用，显示实时 ▶/⏸）
    Function("reloadWidget") {
      WidgetCenter.shared.reloadTimelines(ofKind: "LearningWidget")
    }
  }

  /// 下载封面缩略图并计算主色（hex，压亮度提饱和供白字叠底；失败返回 nil）
  private static func accentHex(for coverUrl: String?) async -> String? {
    guard let raw = coverUrl, !raw.isEmpty else { return nil }
    if let cached = Self.colorCache[raw] { return cached }
    guard let url = URL(string: raw),
      let (data, resp) = try? await URLSession.shared.data(from: url),
      (resp as? HTTPURLResponse)?.statusCode == 200,
      let cg = UIImage(data: data)?.cgImage
    else { return nil }
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
    // RGB → HSL：压亮度到白字可读区间、保住饱和度
    let mx = max(r, g, b), mn = min(r, g, b)
    let l = (mx + mn) / 2
    let d = mx - mn
    var h: CGFloat = 0
    var s: CGFloat = 0
    if d > 0.0001 {
      s = d / (1 - abs(2 * l - 1))
      if mx == r { h = ((g - b) / d) / 6 }
      else if mx == g { h = ((b - r) / d + 2) / 6 }
      else { h = ((r - g) / d + 4) / 6 }
      if h < 0 { h += 1 }
    }
    s = min(0.62, max(0.22, s))
    let lAdj = min(0.5, max(0.3, l))
    let (rr, gg, bb) = Self.hslToRgb(h: h, s: s, l: lAdj)
    let hex = String(format: "#%02X%02X%02X", Int(rr * 255), Int(gg * 255), Int(bb * 255))
    Self.colorCache[raw] = hex
    return hex
  }

  private static func hslToRgb(h: CGFloat, s: CGFloat, l: CGFloat) -> (CGFloat, CGFloat, CGFloat) {
    if s == 0 { return (l, l, l) }
    let q = l < 0.5 ? l * (1 + s) : l + s - l * s
    let p = 2 * l - q
    func hue(_ t: CGFloat) -> CGFloat {
      var tt = t
      if tt < 0 { tt += 1 }
      if tt > 1 { tt -= 1 }
      if tt < 1 / 6 { return p + (q - p) * 6 * tt }
      if tt < 1 / 2 { return q }
      if tt < 2 / 3 { return p + (q - p) * (2 / 3 - tt) * 6 }
      return p
    }
    return (hue(h + 1 / 3), hue(h), hue(h - 1 / 3))
  }
}

/// libnotify 的 Darwin 通知 C API 在此 SDK 未暴露给 Swift，经 @_silgen_name 链接；
/// libnotify 随 libSystem 自动链接（无需额外链接参数），免权限、跨进程。
/// 注意：@_silgen_name 不会像 C 导入那样自动做 Swift 闭包 → C block 的转换，
/// handler 必须显式声明 @convention(block)，否则注册时的立即回调会按错误 ABI 调用（SIGBUS 闪退）。
@_silgen_name("notify_register_dispatch")
private func elpNotifyRegisterDispatch(
  _ name: UnsafePointer<CChar>,
  _ token: UnsafeMutablePointer<Int32>,
  _ queue: DispatchQueue,
  _ handler: @convention(block) (Int32) -> Void
) -> UInt32

@_silgen_name("notify_cancel")
private func elpNotifyCancel(_ token: Int32)
