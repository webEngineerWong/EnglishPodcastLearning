import ActivityKit
import Foundation

/**
 * Live Activity 属性定义 —— 主 App（LiveActivity pod）与 Widget Extension 共享。
 * Extension 端由 config plugin 以相对路径（../modules/live-activity/ios/…）引用本文件，
 * 保证两端的 Attributes/ContentState 定义永远一致（单一事实来源，不要复制改动）。
 */
struct LiveActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// 播放进度 0~1
        var progress: Double
        /// 是否正在播放（锁屏卡片展示播放状态）
        var isPlaying: Bool
        /// 状态更新时间（用于展示“已暂停 X 分钟”等）
        var updatedAt: Date
        /// 当前字幕（App 播放中随段落切换 update，锁屏卡片副行展示）
        var subtitle: String?
        /// 当前音频封面地址（锁屏卡片缩略图）
        var coverUrl: String?
        /// 封面主色 hex（App 端取色，锁屏卡片拟态玻璃染色）
        var colorHex: String?
    }

    /// 课程名（compact 区域与锁屏卡片展示）
    var courseTitle: String
}
