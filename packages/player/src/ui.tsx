/** 完整音频播放器 UI —— Web 与 Electron 共用 */
import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward, Repeat, Repeat1, Volume2, VolumeX, X } from 'lucide-react';
import { AudioEngine, type PlayerState } from './engine';
import { RATES } from './react';
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
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
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

  return (
    <div className={`select-none rounded-lg border border-border bg-card p-3 ${compact ? '' : 'md:p-4'}`}>
      {/* 进度条 */}
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
        <div
          className="pointer-events-none absolute inset-y-0 rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
        {abActive && state.loopRange && duration > 0 && (
          <div
            className="pointer-events-none absolute inset-y-0 rounded-full bg-amber-400/70"
            style={{
              left: `${(state.loopRange.startMs / duration) * 100}%`,
              width: `${((state.loopRange.endMs - state.loopRange.startMs) / duration) * 100}%`
            }}
          />
        )}
        <div
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover:opacity-100"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(state.currentTimeMs)}</span>
          <button className="rounded px-1.5 py-1 text-sm hover:bg-accent disabled:opacity-40" onClick={() => engine.skip(-5)} disabled={disabled} title="快退 5s">
            <Rewind size={16} className="shrink-0" />
          </button>
          <button className="rounded px-1.5 py-1 text-sm hover:bg-accent disabled:opacity-40" onClick={() => engine.skip(5)} disabled={disabled} title="快进 5s">
            <FastForward size={16} className="shrink-0" />
          </button>
          <button className="rounded px-1.5 py-1 hover:bg-accent disabled:opacity-40" onClick={onPrev} disabled={!onPrev || disabled} title="上一篇">
            <SkipBack size={16} className="shrink-0" />
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:opacity-90 disabled:opacity-40"
            onClick={() => engine.toggle()}
            disabled={disabled}
            title={state.playing ? '暂停' : '播放'}
          >
            {state.loading ? <SpinnerDot /> : state.playing ? <Pause size={16} fill="currentColor" className="shrink-0" /> : <Play size={16} fill="currentColor" className="shrink-0 translate-x-[1px]" />}
          </button>
          <button className="rounded px-1.5 py-1 hover:bg-accent disabled:opacity-40" onClick={onNext} disabled={!onNext || disabled} title="下一篇">
            <SkipForward size={16} className="shrink-0" />
          </button>
          <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(duration)}</span>
        </div>

        {title && !compact && <div className="mx-2 hidden min-w-0 flex-1 truncate text-center text-sm text-muted-foreground md:block">{title}</div>}

        <div className="flex shrink-0 items-center gap-1">
          {/* 循环 */}
          <button
            className={`rounded px-2 py-1 text-xs hover:bg-accent ${state.loopMode === 'track' ? 'bg-primary/15 text-primary' : ''}`}
            onClick={() => engine.setLoopMode(state.loopMode === 'track' ? 'off' : 'track')}
            disabled={disabled}
            title="单篇循环"
          >
            <Repeat size={14} className="shrink-0" />
          </button>
          {onToggleParagraphLoop && (
            <button
              className={`rounded px-2 py-1 text-xs hover:bg-accent ${paragraphLoopActive ? 'bg-primary/15 text-primary' : ''}`}
              onClick={onToggleParagraphLoop}
              disabled={disabled}
              title="单句循环（L）"
            >
              <Repeat1 size={14} className="shrink-0" />
            </button>
          )}
          <button
            className={`rounded px-2 py-1 text-xs hover:bg-accent ${state.loopMode === 'ab' ? 'bg-amber-500/20 text-amber-600' : ''}`}
            onClick={cycleLoopMode}
            disabled={disabled}
            title="A-B 循环"
          >
            A-B
          </button>
          {state.loopMode === 'ab' && (
            <>
              <button
                className="rounded px-1.5 py-1 text-xs hover:bg-accent"
                onClick={() => engine.markA()}
                disabled={disabled}
                title="把当前时间设为 A 点"
              >
                A
              </button>
              <button
                className="rounded px-1.5 py-1 text-xs hover:bg-accent"
                onClick={() => engine.markB()}
                disabled={disabled}
                title="把当前时间设为 B 点"
              >
                B
              </button>
              <button
                className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                onClick={() => engine.setLoopMode('off')}
                disabled={disabled}
                title="清除循环"
              >
                <X size={12} />
              </button>
            </>
          )}

          {/* 倍速 */}
          <select
            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
            value={RATES.find((r) => Math.abs(r - state.rate) < 1e-6) ?? state.rate}
            onChange={(e) => engine.setRate(Number(e.target.value))}
            disabled={disabled}
            title="倍速"
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>

          {/* 音量 */}
          <div className="hidden items-center gap-1 md:flex">
            <button className="rounded px-1.5 py-1 text-sm hover:bg-accent" onClick={() => engine.toggleMute()} title="静音">
              {state.muted || state.volume === 0 ? <VolumeX size={15} className="shrink-0" /> : <Volume2 size={15} className="shrink-0" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.muted ? 0 : state.volume}
              onChange={(e) => engine.setVolume(Number(e.target.value))}
              className="w-20 accent-[hsl(var(--primary))]"
              title="音量"
            />
          </div>
        </div>
      </div>
      {state.error && <div className="mt-2 text-xs text-red-500">{state.error}</div>}
    </div>
  );
}
