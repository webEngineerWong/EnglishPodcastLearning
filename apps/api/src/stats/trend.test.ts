import { describe, expect, it } from 'vitest';
import { bucketTrend, localDayKey } from './trend';

/** 构造本地时区某日某时刻的 Date */
function at(y: number, m: number, d: number, h = 12, min = 0, s = 0): Date {
  return new Date(y, m - 1, d, h, min, s, 0);
}

describe('localDayKey', () => {
  it('按本地时区格式化 YYYY-MM-DD', () => {
    expect(localDayKey(at(2026, 11, 13))).toBe('2026-11-13');
    expect(localDayKey(at(2026, 1, 5))).toBe('2026-01-05');
    expect(localDayKey(at(2026, 12, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});

describe('bucketTrend', () => {
  it('缺日补 0 且旧→新排序，末位为今天', () => {
    const now = at(2026, 11, 13);
    const points = bucketTrend([], 7, now);
    expect(points).toHaveLength(7);
    expect(points.map((p) => p.date)).toEqual([
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13'
    ]);
    expect(points.every((p) => p.ms === 0)).toBe(true);
  });

  it('按本地日聚合时长（同日多会话求和）', () => {
    const now = at(2026, 11, 13);
    const points = bucketTrend(
      [
        { startedAt: at(2026, 11, 12, 9), endedAt: at(2026, 11, 12, 9, 30), durationMs: 60000 },
        { startedAt: at(2026, 11, 12, 21), endedAt: at(2026, 11, 12, 21, 10), durationMs: 30000 },
        { startedAt: at(2026, 11, 13, 8), endedAt: at(2026, 11, 13, 8, 5), durationMs: 90000 }
      ],
      3,
      now
    );
    expect(points).toHaveLength(3);
    expect(points.find((p) => p.date === '2026-11-12')?.ms).toBe(90000);
    expect(points.find((p) => p.date === '2026-11-13')?.ms).toBe(90000);
  });

  it('跨午夜会话按 endedAt 归入结束日', () => {
    const now = at(2026, 11, 13);
    const points = bucketTrend(
      [{ startedAt: at(2026, 11, 12, 23, 50), endedAt: at(2026, 11, 13, 0, 10), durationMs: 120000 }],
      2,
      now
    );
    expect(points.find((p) => p.date === '2026-11-12')?.ms).toBe(0);
    expect(points.find((p) => p.date === '2026-11-13')?.ms).toBe(120000);
  });

  it('进行中会话（endedAt 为空）按 startedAt 归日', () => {
    const now = at(2026, 11, 13);
    const points = bucketTrend([{ startedAt: at(2026, 11, 13, 10), endedAt: null, durationMs: 5000 }], 1, now);
    expect(points).toEqual([{ date: '2026-11-13', ms: 5000 }]);
  });

  it('窗口外的会话不计入', () => {
    const now = at(2026, 11, 13);
    const points = bucketTrend([{ startedAt: at(2026, 11, 1), endedAt: at(2026, 11, 1, 13), durationMs: 999999 }], 7, now);
    expect(points.every((p) => p.ms === 0)).toBe(true);
  });

  it('days 边界钳制到 1–90', () => {
    const now = at(2026, 11, 13);
    expect(bucketTrend([], 0, now)).toHaveLength(14); // 0/NaN 回落默认 14
    expect(bucketTrend([], NaN, now)).toHaveLength(14);
    expect(bucketTrend([], 200, now)).toHaveLength(90);
    expect(bucketTrend([], 2.9, now)).toHaveLength(2);
    expect(bucketTrend([], -5, now)).toHaveLength(1);
  });
});
