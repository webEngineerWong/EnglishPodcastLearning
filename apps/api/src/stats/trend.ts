import type { TrendPointDto } from '@elp/types';

/** 本地时区日期键 YYYY-MM-DD（趋势图按本地日归档，与 todayStart 的本地午夜一致） */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface TrendSessionRow {
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number;
}

/**
 * 学习趋势聚合：最近 days 天（含今天），按本地时区归日，缺日补 0，旧→新。
 * 归属日取 endedAt ?? startedAt（与 dashboard todayMs 的 endedAt 归属一致，跨午夜计入结束日）。
 */
export function bucketTrend(rows: TrendSessionRow[], days: number, now: Date): TrendPointDto[] {
  const count = Math.max(1, Math.min(90, Math.floor(days) || 14));
  const sums = new Map<string, number>();
  for (const r of rows) {
    const at = r.endedAt ?? r.startedAt;
    const key = localDayKey(at);
    sums.set(key, (sums.get(key) ?? 0) + r.durationMs);
  }
  const points: TrendPointDto[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < count; i++) {
    const key = localDayKey(cursor);
    points.unshift({ date: key, ms: sums.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() - 1);
  }
  return points;
}
