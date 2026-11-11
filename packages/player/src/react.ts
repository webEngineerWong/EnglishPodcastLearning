/**
 * React 绑定层：useAudioEngine + usePlayerState。
 * UI 组件（AudioPlayer）在 ui.tsx 中，依赖最小化。
 */
import { useEffect, useRef, useState } from 'react';
import { AudioEngine, type PlayerState } from './engine';

export function useAudioEngine(): AudioEngine {
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new AudioEngine();
  }
  const engine = engineRef.current;
  useEffect(() => {
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // 仅在卸载时销毁
    // 依赖刻意收窄（仅卸载/指定值触发）
  }, []);
  return engine;
}

export function usePlayerState(engine: AudioEngine): PlayerState {
  const [state, setState] = useState<PlayerState>(() => engine.getState());
  useEffect(() => engine.subscribe(setState), [engine]);
  return state;
}

/** 播放位置记忆：进入时恢复，播放中节流保存，卸载/切歌时保存 */
export function usePositionPersistence(
  engine: AudioEngine,
  opts: {
    src: string | null;
    getPositionMs: () => number;
    restore: () => Promise<{ startMs: number; autoplay: boolean } | null>;
    save: (positionMs: number, playing: boolean) => void;
  }
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const lastSavedRef = useRef(0);

  // 切换音频源：恢复位置
  useEffect(() => {
    if (!opts.src) return;
    let cancelled = false;
    void (async () => {
      const r = await optsRef.current.restore();
      if (cancelled || !r) return;
      await engine.load(opts.src!, {
        startMs: r.startMs,
        autoplay: r.autoplay
      });
    })();
    return () => {
      cancelled = true;
    };
    // 依赖刻意收窄（仅卸载/指定值触发）
  }, [opts.src, engine]);

  // 节流保存 + 卸载保存
  useEffect(() => {
    const tick = setInterval(() => {
      const engineState = engine.getState();
      if (engineState.playing && engineState.src) {
        optsRef.current.save(engineState.currentTimeMs, true);
        lastSavedRef.current = Date.now();
      }
    }, 5000);
    const saveNow = () => {
      const s = engine.getState();
      if (s.src && s.currentTimeMs > 0 && Date.now() - lastSavedRef.current > 3000) {
        optsRef.current.save(s.currentTimeMs, false);
      }
    };
    window.addEventListener('beforeunload', saveNow);
    return () => {
      clearInterval(tick);
      window.removeEventListener('beforeunload', saveNow);
      saveNow();
    };
    // 依赖刻意收窄（仅卸载/指定值触发）
  }, [engine]);
}

/** 键盘快捷键（作用域内挂载；输入框聚焦时自动跳过） */
export function useKeyboardShortcuts(
  engine: AudioEngine,
  actions?: { onNext?: () => void; onPrev?: () => void; onLoopParagraph?: () => void }
) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const eng = engine;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          eng.toggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          eng.skip(e.shiftKey ? -30 : -5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          eng.skip(e.shiftKey ? 30 : 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          eng.setVolume(Math.min(1, eng.getState().volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          eng.setVolume(Math.max(0, eng.getState().volume - 0.1));
          break;
        case '[':
          eng.setRate(Math.max(0.5, eng.getState().rate - 0.25));
          break;
        case ']':
          eng.setRate(Math.min(2, eng.getState().rate + 0.25));
          break;
        case 'l':
        case 'L':
          actionsRef.current?.onLoopParagraph?.();
          break;
        case 'n':
        case 'N':
          actionsRef.current?.onNext?.();
          break;
        case 'p':
        case 'P':
          actionsRef.current?.onPrev?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [engine]);
}

export const RATES: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function nextRate(current: number): number {
  const idx = RATES.findIndex((r) => Math.abs(r - current) < 1e-6);
  return RATES[Math.min(idx + 1, RATES.length - 1)] ?? 1;
}

export { AudioEngine } from './engine';
export type { PlayerState, LoopMode, LoopRange } from './engine';
export { loopJump, isValidRange } from './loop';
