/** 循环跳转判定 —— 独立模块，便于单测 */
export interface LoopRange {
  startMs: number;
  endMs: number;
}

export type LoopMode = 'off' | 'track' | 'paragraph' | 'ab';

/**
 * 给定当前时间与循环模式，返回应跳转的时间；null 表示不跳转。
 * 仅 paragraph / ab 生效：越过 endMs 时回到 startMs。
 */
export function loopJump(tMs: number, mode: LoopMode, range: LoopRange | null): number | null {
  if (mode !== 'paragraph' && mode !== 'ab') return null;
  if (!range || !Number.isFinite(range.startMs) || !Number.isFinite(range.endMs)) return null;
  if (range.endMs > range.startMs && tMs >= range.endMs) return range.startMs;
  return null;
}

/** 区间有效性：start < end 且时长 > 100ms */
export function isValidRange(startMs?: number | null, endMs?: number | null): boolean {
  return (
    typeof startMs === 'number' &&
    typeof endMs === 'number' &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    endMs - startMs > 100
  );
}
