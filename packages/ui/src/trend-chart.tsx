'use client';

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPointDto } from '@elp/types';
import { formatDuration } from '@elp/player';
import { useI18n } from './providers';

/** 横轴标签：YYYY-MM-DD 转 MM/DD */
function shortDay(date: string): string {
  return date.slice(5).replace('-', '/');
}

/**
 * 学习趋势面积图（Recharts）。颜色全部走 design tokens（--chart-1/border/muted-foreground），
 * 亮暗主题自动适配；check-ui-tokens 仅放行 hsl(var(--token)) 形式。
 */
export function TrendChart({ points, height = 208 }: { points: TrendPointDto[]; height?: number }) {
  const { t } = useI18n();

  const data = useMemo(
    () => points.map((p) => ({ ...p, minutes: Math.round(p.ms / 60000), label: shortDay(p.date) })),
    [points]
  );

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis
            width={34}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--border))' }}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
              color: 'hsl(var(--card-foreground))'
            }}
            labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
            formatter={(minutes) => formatDuration(Number(minutes) * 60000, t('minutes'), t('hours'))}
          />
          <Area
            type="monotone"
            dataKey="minutes"
            name={t('learningTrend')}
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            fill="hsl(var(--chart-1))"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
