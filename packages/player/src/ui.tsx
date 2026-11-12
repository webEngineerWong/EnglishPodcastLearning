/** 完整音频播放器 UI —— Web 与 Electron 共用（图标走 @elp/icons 封装） */
import React from 'react';
import { Icon } from '@elp/icons';
import { AudioEngine, type PlayerState } from './engine';
import { RATES, type PlayerTrack } from './react';
import { formatTime } from './format';
import { isValidRange } from './loop';

export interface AudioPlayerProps {
  engine: AudioEngine;
  state: PlayerState;
  title?: string;
  onPrev?: () => void;
  onNext?: () => void;
  /** 供外部唤起单句循环 */
  onToggleParagraphLoop?: () => void;
  compact?: boolean;
  disabled?: boolean;
}

function SpinnerDot() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function AudioPlayer({ engine, state, title, onPrev, onNext, onToggleParagraphLoop, compact, disabled }: AudioPlayerProps) {
  const duration = state.durationMs;
  const pct = duration > 0 ? (state.currentTimeMs / duration) * 100 : 0;
  const abActive = state.loopMode === 'ab' && isValidRange(state.loopRange?.startMs, state.loopRange?.endMs);
  const paragraphLoopActive = state.loopMode === 'paragraph';
  const barRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  const seekFromClientX = (clientX: number) => {
    const el = barRef.current;
    if (!el || duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    engine.seek(ratio * duration);
  };

  /** 进度条拖动跟手：pointerdown 即 seek，按住移动持续 seek，抬起结束 */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekFromClientX(e.clientX);
  };
  const endDrag = () => {
    draggingRef.current = false;
  };

  const cycleLoopMode = () => {
    const order: PlayerState['loopMode'][] = ['off', 'track', 'ab', 'off'];
    if (onToggleParagraphLoop) order.splice(2, 0, 'paragraph');
    const idx = order.indexOf(state.loopMode === 'paragraph' && !onToggleParagraphLoop ? 'off' : state.loopMode);
    const next = order[(idx + 1) % order.length] ?? 'off';
    if (next === 'ab') {
      // 首次进入 A-B：以当前时间为 A 点
      if (!isValidRange(state.loopRange?.startMs, state.loopRange?.endMs)) {
        engine.setLoopMode('ab', { startMs: state.currentTimeMs, endMs: Math.max(state.currentTimeMs + 1000, state.durationMs || state.currentTimeMs + 1000) });
      } else {
        engine.setLoopMode('ab', state.loopRange);
      }
    } else {
      engine.setLoopMode(next);
    }
  };

  const ctrlBtn =
    'flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-muted hover:text-foreground disabled:opacity-40';

  return (
    <div className={`select-none rounded-xl border border-border bg-card p-3 ${compact ? '' : 'md:p-4'}`}>
      {/* 进度条：轨道 muted、已播放 primary、A-B 区间 warning、手柄 foreground+ring */}
      <div
        ref={barRef}
        className="group relative mb-2 h-2 w-full cursor-pointer touch-none rounded-full bg-muted"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="slider"
        aria-label="seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(state.currentTimeMs)}
      >
        <div className="pointer-events-none absolute inset-y-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
        {abActive && state.loopRange && duration > 0 && (
          <div
            className="pointer-events-none absolute inset-y-0 rounded-full bg-warning/60"
            style={{
              left: `${(state.loopRange.startMs / duration) * 100}%`,
              width: `${((state.loopRange.endMs - state.loopRange.startMs) / duration) * 100}%`
            }}
          />
        )}
        <div
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-foreground opacity-0 shadow ring-2 ring-background transition-opacity group-hover:opacity-100"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(state.currentTimeMs)}</span>
          <button className={ctrlBtn} onClick={() => engine.skip(-5)} disabled={disabled} aria-label="快退 5 秒">
            <Icon name="rewind" size="md" />
          </button>
          <button className={ctrlBtn} onClick={() => engine.skip(5)} disabled={disabled} aria-label="快进 5 秒">
            <Icon name="fastForward" size="md" />
          </button>
          <button className={ctrlBtn} onClick={onPrev} disabled={!onPrev || disabled} aria-label="上一集">
            <Icon name="skipBack" size="md" />
          </button>
          {/* 主播放按钮：44px 圆形实心，页面最突出元素 */}
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-primary-hover active:scale-[0.98] motion-reduce:active:scale-none disabled:opacity-40"
            onClick={() => engine.toggle()}
            disabled={disabled}
            aria-label={state.playing ? '暂停' : '播放'}
          >
            {state.loading ? <SpinnerDot /> : <Icon name={state.playing ? 'pause' : 'play'} size={26} fill="currentColor" />}
          </button>
          <button className={ctrlBtn} onClick={onNext} disabled={!onNext || disabled} aria-label="下一集">
            <Icon name="skipForward" size="md" />
          </button>
          <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(duration)}</span>
        </div>

        {title && !compact && <div className="mx-2 hidden min-w-0 flex-1 truncate text-center text-sm text-muted-foreground md:block">{title}</div>}

        <div className="flex shrink-0 items-center gap-1">
          {/* 单篇循环 */}
          <button
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-muted disabled:opacity-40 ${
              state.loopMode === 'track' ? 'bg-primary/15 text-primary' : 'text-foreground/80'
            }`}
            onClick={() => engine.setLoopMode(state.loopMode === 'track' ? 'off' : 'track')}
            disabled={disabled}
            aria-label="单篇循环"
          >
            <Icon name="repeat" size="sm" />
          </button>
          {onToggleParagraphLoop && (
            <button
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-muted disabled:opacity-40 ${
                paragraphLoopActive ? 'bg-primary/15 text-primary' : 'text-foreground/80'
              }`}
              onClick={onToggleParagraphLoop}
              disabled={disabled}
              aria-label="单句循环（L）"
            >
              <Icon name="repeatOne" size="sm" />
            </button>
          )}
          {/* A-B 循环：Repeat 图标 + A-B 文字标记 */}
          <button
            className={`flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-muted disabled:opacity-40 ${
              state.loopMode === 'ab' ? 'bg-warning/20 text-warning' : 'text-foreground/80'
            }`}
            onClick={cycleLoopMode}
            disabled={disabled}
            aria-label="A-B 循环"
          >
            <Icon name="repeat" size="sm" />
            A-B
          </button>
          {state.loopMode === 'ab' && (
            <>
              <button className={ctrlBtn} onClick={() => engine.markA()} disabled={disabled} aria-label="把当前时间设为 A 点">
                A
              </button>
              <button className={ctrlBtn} onClick={() => engine.markB()} disabled={disabled} aria-label="把当前时间设为 B 点">
                B
              </button>
              <button className={ctrlBtn} onClick={() => engine.setLoopMode('off')} disabled={disabled} aria-label="清除循环">
                <Icon name="close" size="sm" />
              </button>
            </>
          )}

          {/* 倍速：Gauge 图标 + select */}
          <div className="flex h-8 items-center gap-0.5 rounded-md border border-input bg-card px-1.5">
            <Icon name="gauge" size="sm" className="text-muted-foreground" />
            <select
              className="h-7 bg-transparent text-xs outline-none"
              value={RATES.find((r) => Math.abs(r - state.rate) < 1e-6) ?? state.rate}
              onChange={(e) => engine.setRate(Number(e.target.value))}
              disabled={disabled}
              aria-label="倍速"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}x
                </option>
              ))}
            </select>
          </div>

          {/* 音量 */}
          <div className="hidden items-center gap-1 md:flex">
            <button
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-muted ${
                state.muted || state.volume === 0 ? 'text-primary' : 'text-foreground/80'
              }`}
              onClick={() => engine.toggleMute()}
              aria-label={state.muted || state.volume === 0 ? '取消静音' : '静音'}
            >
              <Icon name={state.muted || state.volume === 0 ? 'volumeMute' : 'volume'} size="sm" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.muted ? 0 : state.volume}
              onChange={(e) => engine.setVolume(Number(e.target.value))}
              className="w-20 accent-[hsl(var(--primary))]"
              aria-label="音量"
            />
          </div>
        </div>
      </div>
      {state.error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <Icon name="error" size={12} />
          {state.error}
        </div>
      )}
    </div>
  );
}

// ==================== Mini Player（页面切换常驻底部条） ====================

export interface MiniPlayerProps {
  engine: AudioEngine;
  state: PlayerState;
  track: PlayerTrack;
  /** 关闭（暂停并卸载当前曲目） */
  onClose: () => void;
  /** 点标题/封面跳回课程详情 */
  onOpen?: () => void;
  /** 定位类（Web 侧边栏 14rem / Desktop 12rem，由调用方传） */
  className?: string;
}

/** 页面切换常驻的迷你播放条：封面 + 标题 + 拖动进度 + 播放控制，音频不中断 */
export function MiniPlayer({ engine, state, track, onClose, onOpen, className }: MiniPlayerProps) {
  const duration = state.durationMs;
  const pct = duration > 0 ? (state.currentTimeMs / duration) * 100 : 0;
  const barRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  const seekFromClientX = (clientX: number) => {
    const el = barRef.current;
    if (!el || duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    engine.seek(ratio * duration);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekFromClientX(e.clientX);
  };
  const endDrag = () => {
    draggingRef.current = false;
  };

  const ctrlBtn =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground/80 transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-muted hover:text-foreground';

  return (
    <div
      className={
        'fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-xl border border-border bg-card p-2 shadow-lg ' + (className ?? '')
      }
    >
      {/* 封面/占位 + 标题（可点击回详情页） */}
      <button
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        onClick={onOpen}
        aria-label={`${track.courseTitle} - ${track.audioName}`}
      >
        {track.coverUrl ? (
          <img src={track.coverUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary" aria-hidden>
            <Icon name="audio" size="md" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{track.courseTitle}</span>
          <span className="block truncate text-xs text-muted-foreground">{track.audioName}</span>
        </span>
      </button>

      {/* 进度条（窄屏隐藏，详情页内有完整进度条） */}
      <div
        ref={barRef}
        className="group relative hidden h-2 w-40 cursor-pointer touch-none rounded-full bg-muted sm:block lg:w-64"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="slider"
        aria-label="seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(state.currentTimeMs)}
      >
        <div className="pointer-events-none absolute inset-y-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
        <div
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-foreground opacity-0 ring-2 ring-background transition-opacity group-hover:opacity-100"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">{formatTime(duration)}</span>

      {/* 控制：±5s / 播放暂停 / 关闭 */}
      <button className={ctrlBtn} onClick={() => engine.skip(-5)} aria-label="快退 5 秒">
        <Icon name="rewind" size="md" />
      </button>
      <button
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-primary-hover active:scale-[0.98] motion-reduce:active:scale-none"
        onClick={() => engine.toggle()}
        aria-label={state.playing ? '暂停' : '播放'}
      >
        {state.loading ? <SpinnerDot /> : <Icon name={state.playing ? 'pause' : 'play'} size={18} fill="currentColor" />}
      </button>
      <button className={ctrlBtn} onClick={() => engine.skip(5)} aria-label="快进 5 秒">
        <Icon name="fastForward" size="md" />
      </button>
      <button className={ctrlBtn} onClick={onClose} aria-label="关闭播放器">
        <Icon name="close" size="md" />
      </button>
    </div>
  );
}
