import ActivityKit
import SwiftUI
import WidgetKit

/// Widget Extension 入口（传统 app-extension + NSExtensionPointIdentifier=com.apple.widgetkit-extension，
/// 由 plugins/with-live-activity-widget.js 注入 Xcode 工程）。
/// - LiveActivityWidget：后台播放的灵动岛 / 锁屏 Live Activity
/// - LearningWidget：负一屏 / 主屏中号小组件（4×2 继续学习卡片）
@main
struct LiveActivityWidgetBundle: WidgetBundle {
  var body: some Widget {
    LiveActivityWidget()
    LearningWidget()
  }
}
