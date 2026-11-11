/**
 * 学习资料阅读器（文档式预览）—— 与字幕阅读器刻意不同：
 * - 无段落边框/无点击跳转/无操作按钮，纯文档排版
 * - 标题段渲染为大字标题，正文段英文为主、中文为辅注
 * - 播放时按时间戳跟随定位：当前段落以左侧竖线 + 淡底提示当前位置
 * 由对照 PDF / 笔记解析而来，供学习时参考。
 */
import React, { memo, useEffect, useRef } from 'react';
import clsx from 'clsx';
import type { TranscriptParagraphDto } from '@elp/types';

export interface MaterialReaderProps {
  paragraphs: TranscriptParagraphDto[];
  /** 当前音频位置对应的段落 id（由父组件按时间戳计算） */
  activeParagraphId?: string | null;
  /** 跟随音频滚动 */
  followAudio?: boolean;
  className?: string;
}

function MaterialReaderImpl({
  paragraphs,
  activeParagraphId,
  followAudio = true,
  className
}: MaterialReaderProps) {
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (followAudio && activeParagraphId && activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeParagraphId, followAudio]);

  return (
    <div className={clsx('space-y-3 leading-relaxed', className)}>
      {paragraphs.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">—</div>}
      {paragraphs.map((p) => {
        const active = p.id === activeParagraphId;
        const isHeading = p.type === 'HEADING';
        return (
          <div
            key={p.id}
            ref={active ? activeRef : undefined}
            className={clsx(
              'rounded-md transition-colors',
              active ? 'border-l-2 border-l-primary bg-primary/5 pl-3' : 'border-l-2 border-l-transparent pl-3',
              isHeading && 'pt-1'
            )}
          >
            {p.textEn && (
              <p className={clsx(isHeading ? 'mt-1 text-base font-semibold' : 'text-[15px]', 'text-foreground')}>
                {p.textEn}
              </p>
            )}
            {p.textZh && (
              <p className={clsx('text-muted-foreground', isHeading ? 'text-sm' : 'mt-0.5 text-[13px]', !p.textEn && 'text-foreground')}>
                {p.textZh}
              </p>
            )}
            {!p.textEn && !p.textZh && <p className="text-sm italic text-muted-foreground">（空段落）</p>}
          </div>
        );
      })}
    </div>
  );
}

export const MaterialReader = memo(MaterialReaderImpl);
