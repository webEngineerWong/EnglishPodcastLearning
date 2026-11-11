import { describe, expect, it } from 'vitest';
import { loopJump, isValidRange } from './loop';

describe('loopJump', () => {
  const range = { startMs: 1000, endMs: 5000 };

  it('off 模式永不跳转', () => {
    expect(loopJump(6000, 'off', range)).toBeNull();
  });

  it('paragraph 模式超过终点回起点', () => {
    expect(loopJump(5000, 'paragraph', range)).toBe(1000);
    expect(loopJump(8000, 'ab', range)).toBe(1000);
  });

  it('区间内不跳转', () => {
    expect(loopJump(3000, 'paragraph', range)).toBeNull();
  });

  it('终点小于起点（未设置完 A-B）不跳转', () => {
    expect(loopJump(500, 'ab', { startMs: 1000, endMs: 500 })).toBeNull();
  });

  it('range 为 null 不跳转', () => {
    expect(loopJump(5000, 'paragraph', null)).toBeNull();
  });
});

describe('isValidRange', () => {
  it('有效区间', () => {
    expect(isValidRange(100, 2000)).toBe(true);
  });
  it('null / 无效 / 太短', () => {
    expect(isValidRange(null, 2000)).toBe(false);
    expect(isValidRange(2000, 100)).toBe(false);
    expect(isValidRange(100, 150)).toBe(false);
  });
});
