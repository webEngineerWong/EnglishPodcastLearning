/**
 * 双语文本阅读器 —— Web 与 Electron 共用。
 * 段落与音频时间戳关联；没有时间戳的段落照样显示，点击时提示。
 * 允许一个段落含多句话，也允许一句话对应一段翻译（不强制一一对应）。
 */
import React, { memo, useEffect, useRef } from 'react';
import clsx from 'clsx';
import type { TranscriptParagraphDto } from '@elp/types';
import { formatTime } from '@elp/player';

export type DisplayMode = 'both' | 'en' | 'zh';

export interface BilingualReaderProps {
  paragraphs: TranscriptParagraphDto[];
  /** 当前激活（按时间定位）的段落 id */
  activeParagraphId?: string | null;
  /** 点击段落（默认行为：跳转播放对应时间） */
  onParagraphClick?: (p: TranscriptParagraphDto) => void;
  /** 找不到时间戳时的提示回调 */
  onNoTimestamp?: (p: TranscriptParagraphDto) => void;
  mode?: DisplayMode;
  autoScroll?: boolean;
  fontSize?: 'sm' | 'md' | 'lg';
  /** 段落额外操作（收藏、生词等），由调用方渲染 */
  renderParagraphActions?: (p: TranscriptParagraphDto) => React.ReactNode;
  className?: string;
}

export function BilingualReaderImpl({
  paragraphs,
  activeParagraphId,
  onParagraphClick,
  onNoTimestamp,
  mode = 'both',
  autoScroll = true,
  fontSize = 'md',
  renderParagraphActions,
  className
}: BilingualReaderProps) {
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && activeParagraphId && activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeParagraphId, autoScroll]);

  return (
    <div className={clsx('space-y-1', className)}>
      {paragraphs.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">—</div>}
      {paragraphs.map((p) => {
        const active = p.id === activeParagraphId;
        const hasTime = typeof p.startTimeMs === 'number';
        const isHeading = p.type === 'HEADING';
        return (
          <div
            key={p.id}
            ref={active ? activeRef : undefined}
            className={clsx(
              'group rounded-md border px-3 py-2 transition-colors',
              active ? 'border-primary/60 bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted/40',
              p.confidence < 0.5 && !active && 'border-l-2 border-l-amber-400'
            )}
            onClick={() => {
              if (!hasTime) onNoTimestamp?.(p);
              onParagraphClick?.(p);
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {p.textEn && (mode === 'both' || mode === 'en') && (
                  <p
                    className={clsx(
                      'text-foreground',
                      isHeading ? 'text-base font-semibold' : { sm: 'text-sm', md: 'text-[15px]', lg: 'text-lg' }[fontSize],
                      mode === 'both' && p.textZh && 'mb-1'
                    )}
                  >
                    {p.textEn}
                  </p>
                )}
                {p.textZh && (mode === 'both' || mode === 'zh') && (
                  <p className={clsx('text-muted-foreground', { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }[fontSize])}>{p.textZh}</p>
                )}
                {!p.textEn && !p.textZh && <p className="text-sm italic text-muted-foreground">（空段落）</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {hasTime && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {formatTime(p.startTimeMs!)}
                    {typeof p.endTimeMs === 'number' ? `–${formatTime(p.endTimeMs)}` : ''}
                  </span>
                )}
                {renderParagraphActions?.(p)}
              </div>
            </div>
            {p.confidence < 0.5 && (
              <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">⚠ 低置信度（{Math.round(p.confidence * 100)}%）— 建议校对</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const BilingualReader = memo(BilingualReaderImpl);

/**
 * 根据播放位置找当前段落：
 * 返回 startTimeMs <= t 的段落中"开始最晚"的一个 ——
 * 段落区间允许重叠（人工校准产物），取最近开始者消除歧义；
 * 两段之间的空隙保持上一个段落高亮（不提前跳）。
 */
export function findActiveParagraph(paragraphs: TranscriptParagraphDto[], tMs: number): TranscriptParagraphDto | null {
  let active: TranscriptParagraphDto | null = null;
  let bestStart = -1;
  for (const p of paragraphs) {
    if (typeof p.startTimeMs !== 'number') continue;
    if (p.startTimeMs <= tMs && p.startTimeMs > bestStart) {
      bestStart = p.startTimeMs;
      active = p;
    }
    if (p.startTimeMs > tMs) break;
  }
  return active;
}
