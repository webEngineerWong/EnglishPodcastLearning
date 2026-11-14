/**
 * 学习趋势图（react-native-svg）—— 与 Web/Desktop 的 Recharts 版视觉对齐：
 * 单调三次曲线 + 主色 15% 面积填充 + 虚线网格 + 轴标签（MM/DD）。
 * 数据：GET /api/stats/trend?days=N → TrendPointDto[]（{ date: 'YYYY-MM-DD', ms }）
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';

export type TrendPoint = { date: string; ms: number };

/** Catmull-Rom → 三次贝塞尔平滑（近似 recharts 的 monotone 曲线） */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function shortDay(date: string): string {
  return date.slice(5).replace('-', '/');
}

export function TrendChartRN({
  points,
  height = 190,
  primary,
  label,
  grid
}: {
  points: TrendPoint[];
  height?: number;
  /** 线与面积主色 */
  primary: string;
  /** 轴标签文字色 */
  label: string;
  /** 网格线色 */
  grid: string;
}) {
  const [width, setWidth] = useState(320);

  const geo = useMemo(() => {
    const padL = 34;
    const padR = 8;
    const padT = 10;
    const padB = 20;
    const chartW = Math.max(40, width - padL - padR);
    const chartH = Math.max(20, height - padT - padB);
    const minutes = points.map((p) => Math.round(p.ms / 60000));
    const maxMinutes = Math.max(1, ...minutes);
    const n = Math.max(1, points.length);
    const x = (i: number) => padL + (n === 1 ? chartW / 2 : (i * chartW) / (n - 1));
    const y = (v: number) => padT + chartH - (v / maxMinutes) * chartH;
    const line = smoothPath(points.map((_, i) => ({ x: x(i), y: y(minutes[i]) })));
    const area =
      n > 1
        ? `${line} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`
        : `${line} L ${x(0)} ${padT + chartH} L ${x(0)} ${y(0)} Z`;
    return {
      padL,
      chartW,
      chartH,
      padT,
      padB,
      maxMinutes,
      minutes,
      line,
      area,
      x,
      y,
      midY: y(maxMinutes / 2)
    };
  }, [points, width, height]);

  const last = points.length - 1;
  const midIdx = Math.floor(last / 2);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width={width} height={height}>
        {/* 横向虚线网格：0 / 中位 / 峰值 */}
        <Line x1={geo.padL} y1={geo.y(0)} x2={width - 8} y2={geo.y(0)} stroke={grid} strokeDasharray="3 3" strokeWidth={1} />
        <Line x1={geo.padL} y1={geo.midY} x2={width - 8} y2={geo.midY} stroke={grid} strokeDasharray="3 3" strokeWidth={1} />
        <Line x1={geo.padL} y1={geo.y(geo.maxMinutes)} x2={width - 8} y2={geo.y(geo.maxMinutes)} stroke={grid} strokeDasharray="3 3" strokeWidth={1} />
        <SvgText x={geo.padL - 6} y={geo.y(geo.maxMinutes) + 4} fill={label} fontSize={10} textAnchor="end">
          {geo.maxMinutes}
        </SvgText>
        <SvgText x={geo.padL - 6} y={geo.midY + 4} fill={label} fontSize={10} textAnchor="end">
          {Math.round(geo.maxMinutes / 2)}
        </SvgText>
        <SvgText x={geo.padL - 6} y={geo.y(0) + 4} fill={label} fontSize={10} textAnchor="end">
          0
        </SvgText>
        {/* 面积 + 曲线 */}
        <Path d={geo.area} fill={primary} fillOpacity={0.15} />
        <Path d={geo.line} fill="none" stroke={primary} strokeWidth={2} strokeLinecap="round" />
        {/* 横轴日期：首 / 中 / 尾 */}
        {points.length > 0 && (
          <SvgText x={geo.x(0)} y={height - 6} fill={label} fontSize={10} textAnchor="middle">
            {shortDay(points[0].date)}
          </SvgText>
        )}
        {points.length > 2 && (
          <SvgText x={geo.x(midIdx)} y={height - 6} fill={label} fontSize={10} textAnchor="middle">
            {shortDay(points[midIdx].date)}
          </SvgText>
        )}
        {points.length > 1 && (
          <SvgText x={geo.x(last)} y={height - 6} fill={label} fontSize={10} textAnchor="middle">
            {shortDay(points[last].date)}
          </SvgText>
        )}
      </Svg>
    </View>
  );
}
