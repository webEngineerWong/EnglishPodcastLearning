/**
 * 音频播放器核心引擎 —— 框架无关（基于 HTMLAudioElement）。
 * 解决：音频加载、播放状态、时间同步、单句/AB 循环、资源释放。
 * Web 与 Electron 共用。
 */
import { loopJump } from './loop';

export type LoopMode = 'off' | 'track' | 'paragraph' | 'ab';

export interface LoopRange {
  startMs: number;
  endMs: number;
}

export interface PlayerState {
  playing: boolean;
  loading: boolean;
  currentTimeMs: number;
  durationMs: number;
  rate: number;
  volume: number;
  muted: boolean;
  loopMode: LoopMode;
  loopRange: LoopRange | null;
  src: string | null;
  ended: boolean;
  error: string | null;
}

export type PlayerListener = (state: PlayerState) => void;
export type PlayerEventMap = {
  ended: void;
  error: string;
  statechange: PlayerState;
};

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/**
 * 核心引擎：所有 UI 通过 subscribe 获得状态，通过方法控制播放。
 * 一个引擎实例只持有一个 <audio> 元素，load(src) 会清理上一个资源。
 */
export class AudioEngine {
  /** 惰性创建：SSR/Node 环境无 Audio，首次真实访问时才初始化 */
  private _audio: HTMLAudioElement | null = null;
  private eventsBound = false;
  private listeners = new Set<PlayerListener>();
  private state: PlayerState = {
    playing: false,
    loading: false,
    currentTimeMs: 0,
    durationMs: 0,
    rate: 1,
    volume: 1,
    muted: false,
    loopMode: 'off',
    loopRange: null,
    src: null,
    ended: false,
    error: null
  };

  /** 曲目结束时回调（用于"下一篇"） */
  onEnded: (() => void) | null = null;
  /** 进度自动保存钩子（引擎内部节流调用） */
  onProgressTick: ((positionMs: number) => void) | null = null;

  private progressTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // audio 元素延迟到首次访问时创建（支持 SSR 预渲染）
  }

  private get audio(): HTMLAudioElement {
    if (!this._audio) {
      if (typeof Audio === 'undefined') {
        // Node/SSR 环境：返回一个最小 stub，任何控制调用都是 no-op
        return { addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLAudioElement;
      }
      const el = new Audio();
      el.preload = 'metadata';
      this._audio = el;
      if (!this.eventsBound) {
        this.bindEvents();
        this.eventsBound = true;
      }
    }
    return this._audio;
  }

  // ---------- 状态订阅 ----------
  subscribe(fn: PlayerListener): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  getState(): PlayerState {
    return { ...this.state };
  }

  private emit() {
    const snapshot = this.getState();
    for (const fn of this.listeners) {
      try {
        fn(snapshot);
      } catch (e) {
        console.error('player listener error', e);
      }
    }
  }

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  // ---------- 事件绑定 ----------
  private bindEvents() {
    const a = this.audio;
    a.addEventListener('play', () => this.set({ playing: true, ended: false }));
    a.addEventListener('pause', () => this.set({ playing: false }));
    a.addEventListener('waiting', () => this.set({ loading: true }));
    a.addEventListener('playing', () => this.set({ loading: false, error: null }));
    a.addEventListener('loadedmetadata', () =>
      this.set({
        durationMs: Number.isFinite(a.duration) ? a.duration * 1000 : 0,
        loading: false
      })
    );
    a.addEventListener('durationchange', () =>
      this.set({ durationMs: Number.isFinite(a.duration) ? a.duration * 1000 : this.state.durationMs })
    );
    a.addEventListener('timeupdate', () => {
      const tMs = a.currentTime * 1000;
      const jump = loopJump(tMs, this.state.loopMode, this.state.loopRange);
      if (jump !== null) {
        a.currentTime = jump / 1000;
        this.set({ currentTimeMs: jump });
        return;
      }
      this.set({ currentTimeMs: tMs, ended: false });
    });
    a.addEventListener('ended', () => {
      this.set({ playing: false, ended: true, currentTimeMs: this.state.durationMs });
      // 单篇循环：回到开头继续
      if (this.state.loopMode === 'track') {
        a.currentTime = 0;
        void a.play().catch(() => undefined);
      } else {
        this.onEnded?.();
      }
    });
    a.addEventListener('error', () => {
      const code = a.error?.code;
      const msg = ['', '加载被中断', '网络错误', '解码失败', '音频源不可用'][code ?? 0] ?? '音频加载失败';
      this.set({ error: msg, loading: false, playing: false });
    });
  }

  // ---------- 加载 ----------
  /** 加载新音频并可选恢复到指定位置 */
  async load(src: string, opts?: { startMs?: number; autoplay?: boolean; rate?: number }): Promise<void> {
    this.stopProgressTicker();
    this.set({ src, loading: true, error: null, currentTimeMs: 0, ended: false, loopRange: null });
    this.audio.src = src;
    if (opts?.rate) this.audio.playbackRate = opts.rate;
    if (opts?.startMs && opts.startMs > 0) {
      await this.restorePosition(opts.startMs);
    }
    if (opts?.autoplay) await this.play();
    this.set({ loading: false });
    this.startProgressTicker();
  }

  /**
   * 恢复播放位置：
   * - 元数据已就绪（缓存命中）时立即定位，不等待事件；
   * - 否则等待 loadedmetadata，兜底 3 秒（绝不白等 8 秒）；
   * - 监听器与定时器总是成对清理。
   */
  private restorePosition(startMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const apply = () => {
        const dur = Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : Infinity;
        const t = Math.min(startMs, Math.max(dur - 250, 0));
        if (t > 0) {
          this.audio.currentTime = t / 1000;
          this.set({ currentTimeMs: t });
        }
      };
      if (this.audio.readyState >= 1) {
        // HAVE_METADATA：已经可以定位
        apply();
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.audio.removeEventListener('loadedmetadata', onMeta);
        clearTimeout(timer);
        resolve();
      };
      const onMeta = () => {
        apply();
        finish();
      };
      const timer = setTimeout(finish, 3000);
      this.audio.addEventListener('loadedmetadata', onMeta);
    });
  }

  // ---------- 控制 ----------
  async play(): Promise<void> {
    try {
      await this.audio.play();
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : '播放失败' });
    }
  }

  pause(): void {
    this.audio.pause();
  }

  toggle(): void {
    if (this.state.playing) this.pause();
    else void this.play();
  }

  /** 跳转到绝对位置 */
  seek(ms: number): void {
    const dur = Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : this.state.durationMs;
    const t = Math.max(0, Math.min(ms, dur > 0 ? dur - 200 : ms));
    this.audio.currentTime = t / 1000;
    this.set({ currentTimeMs: t, ended: false });
  }

  /** 相对快进/快退（秒可为负） */
  skip(seconds: number): void {
    this.seek(this.state.currentTimeMs + seconds * 1000);
  }

  setRate(rate: number): void {
    const clamped = Math.min(2, Math.max(0.5, rate));
    this.audio.playbackRate = clamped;
    this.set({ rate: clamped });
  }

  setVolume(v: number): void {
    const clamped = Math.min(1, Math.max(0, v));
    this.audio.volume = clamped;
    this.audio.muted = clamped === 0;
    this.set({ volume: clamped, muted: clamped === 0 });
  }

  toggleMute(): void {
    this.audio.muted = !this.audio.muted;
    this.set({ muted: this.audio.muted });
  }

  setLoopMode(mode: LoopMode, range?: LoopRange | null): void {
    this.set({
      loopMode: mode,
      loopRange: mode === 'paragraph' || mode === 'ab' ? range ?? this.state.loopRange : null
    });
  }

  setLoopRange(range: LoopRange | null): void {
    this.set({ loopRange: range });
  }

  /** 设置 A 点（当前时间） */
  markA(): number {
    const range = { startMs: this.state.currentTimeMs, endMs: this.state.loopRange?.endMs ?? 0 };
    this.set({ loopRange: range });
    return range.startMs;
  }

  /** 设置 B 点（当前时间），若 B <= A 则无效 */
  markB(): LoopRange | null {
    const cur = this.state.loopRange?.startMs ?? 0;
    if (this.state.currentTimeMs <= cur) return this.state.loopRange;
    const range = { startMs: cur, endMs: this.state.currentTimeMs };
    this.set({ loopRange: range });
    return range;
  }

  // ---------- 进度节流上报 ----------
  private startProgressTicker() {
    this.stopProgressTicker();
    this.progressTimer = setInterval(() => {
      if (this.state.playing) this.onProgressTick?.(this.state.currentTimeMs);
    }, 5000);
  }

  private stopProgressTicker() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  // ---------- 资源释放 ----------
  destroy(): void {
    this.stopProgressTicker();
    this.pause();
    this.audio.removeAttribute('src');
    this.audio.load(); // 释放底层资源
    this.listeners.clear();
  }
}
