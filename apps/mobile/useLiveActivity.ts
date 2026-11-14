/**
 * ActivityKit 灵动岛 Live Activity hook（路线图 P2）
 *
 * 原生实现：apps/mobile/modules/live-activity（Expo Modules API 本地模块，iOS 16.4+）。
 * - start(courseTitle)   播放开始/恢复时调用（已有活动会先结束后重建）
 * - update(progress, isPlaying) 进度更新，hook 内部节流 ≥1s（isPlaying 变化时立即同步）
 * - stop()               暂停/播放结束/切换课程时结束活动
 * - reloadWidget()       负一屏小组件立即重拉 timeline（播放状态变化时调用）
 * - onPlaybackCommand    订阅小组件/锁屏卡片的播放控制命令（主 App 进程内转发）
 *
 * 优雅降级：非 iOS、原生模块缺失（Expo Go / 未编译进 dev client）或系统未授权
 * （ActivityAuthorizationInfo.areActivitiesEnabled === false）时所有调用静默 no-op。
 */
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type LiveActivityNativeModule = {
  start: (courseTitle: string, coverUrl?: string | null, subtitle?: string | null) => Promise<void>;
  update: (progress: number, isPlaying: boolean, subtitle?: string | null, coverUrl?: string | null) => Promise<void>;
  stop: () => Promise<void>;
  areActivitiesEnabled: () => boolean;
  reloadWidget: () => void;
  addListener: (
    eventName: 'onPlaybackCommand',
    listener: (event: { command: string }) => void
  ) => { remove: () => void };
};

let nativeModule: LiveActivityNativeModule | null = null;
try {
  nativeModule = requireNativeModule<LiveActivityNativeModule>('LiveActivity');
} catch {
  // Expo Go 或未包含本地模块的原生构建：保持 null，hook 全部降级为 no-op
  nativeModule = null;
}

/**
 * 总开关：默认关闭。
 * 音频类 App 的锁屏播放控制已由系统 Now Playing 卡片接管（expo-audio 自动提供封面/进度/按钮），
 * 而 Live Activity 激活后必然同时出现在锁屏（系统没有「仅灵动岛、不显锁屏」的开关），
 * 会与之重复成两张锁屏播放卡。需要灵动岛时改回 true 即可——原生模块与 Widget 扩展均保留。
 */
const LIVE_ACTIVITY_ENABLED = false;

const THROTTLE_MS = 1000;

export function useLiveActivity() {
  const lastUpdateAtRef = useRef(0);
  const lastPlayingRef = useRef<boolean | null>(null);
  const lastProgressRef = useRef(0);
  // 缓存启用状态：模块缺失/非 iOS 固定 false；iOS 上每次 start 重新检查
  const enabledRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!LIVE_ACTIVITY_ENABLED) {
      // 关闭态：清理旧版本可能残留的活动（不随本会话启动任何新活动）
      void nativeModule?.stop().catch(() => undefined);
      return;
    }
    // 卸载时结束活动（切课由 CourseScreen unmount 触发）
    return () => {
      void nativeModule?.stop().catch(() => undefined);
    };
  }, []);

  const isAvailable = useCallback((): boolean => {
    if (!LIVE_ACTIVITY_ENABLED) return false;
    if (Platform.OS !== 'ios' || !nativeModule) return false;
    try {
      enabledRef.current = nativeModule.areActivitiesEnabled();
    } catch {
      enabledRef.current = false;
    }
    return enabledRef.current === true;
  }, []);

  const start = useCallback(
    (courseTitle: string, coverUrl?: string | null, subtitle?: string | null) => {
      if (!isAvailable()) return;
      lastUpdateAtRef.current = Date.now();
      lastPlayingRef.current = true;
      lastProgressRef.current = 0;
      void nativeModule!
        .start(courseTitle, coverUrl ?? null, subtitle ?? null)
        .then(() => {
          enabledRef.current = true;
        })
        .catch(() => undefined);
    },
    [isAvailable]
  );

  const update = useCallback((progress: number, isPlaying: boolean, subtitle?: string | null, coverUrl?: string | null) => {
    if (!LIVE_ACTIVITY_ENABLED) return;
    const mod = nativeModule;
    if (!mod) return;
    const now = Date.now();
    // 节流：距上次更新 <1s 时丢弃普通进度更新；播放/暂停/字幕变化立即同步
    if (isPlaying === lastPlayingRef.current && now - lastUpdateAtRef.current < THROTTLE_MS) return;
    lastUpdateAtRef.current = now;
    lastPlayingRef.current = isPlaying;
    lastProgressRef.current = progress;
    void mod.update(Math.min(1, Math.max(0, progress)), isPlaying, subtitle ?? null, coverUrl ?? null).catch(() => undefined);
  }, []);

  const stop = useCallback(() => {
    if (!nativeModule) return;
    lastPlayingRef.current = null;
    void nativeModule.stop().catch(() => undefined);
  }, []);

  /** 负一屏小组件立即刷新播放状态显示（App 播放/暂停变化时调用） */
  const reloadWidget = useCallback(() => {
    // 豁免总开关：reloadWidget 只刷新负一屏 LearningWidget timeline（WidgetCenter），
    // 与 Live Activity 无关——灵动岛关闭时负一屏仍需实时更新当前播放状态。
    try {
      nativeModule?.reloadWidget();
    } catch {
      /* 降级 no-op */
    }
  }, []);

  /** 订阅播放控制命令；返回取消函数（不支持时返回 no-op）。
   *  命令通道独立于灵动岛展示开关（LIVE_ACTIVITY_ENABLED）：锁屏 ⏮⏭ 与负一屏按钮
   *  经 Darwin 跨进程广播 → 原生模块转发，始终可用。 */
  const onPlaybackCommand = useCallback((listener: (command: string) => void): (() => void) => {
    if (!nativeModule) return () => undefined;
    try {
      const sub = nativeModule.addListener('onPlaybackCommand', (event) => listener(event.command));
      return () => sub.remove();
    } catch {
      return () => undefined;
    }
  }, []);

  return { start, update, stop, reloadWidget, onPlaybackCommand, isAvailable, isSupported: nativeModule != null && Platform.OS === 'ios' };
}
