/**
 * 双语文本阅读器 —— Web 与 Electron 共用。
 * 段落与音频时间戳关联；没有时间戳的段落照样显示，点击时提示。
 * 允许一个段落含多句话，也允许一句话对应一段翻译（不强制一一对应）。
 */
import React, { memo, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Icon } from './icons';
import type { TranscriptParagraphDto } from '@elp/types';
import { formatTime } from '@elp/player';

// ==================== TODO(DEBUG): 临时诊断（?debug=1），验证后整段删除 ====================
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
let debugLines: string[] = [];
let debugOverlay: HTMLDivElement | null = null;
function debugLog(msg: string) {
  if (!DEBUG) return;
  console.log('[subtitle-debug]', msg);
  debugLines = [msg, ...debugLines].slice(0, 6);
  if (!debugOverlay) {
    debugOverlay = document.createElement('div');
    debugOverlay.setAttribute('aria-hidden', 'true');
    debugOverlay.style.cssText =
      'position:fixed;top:3.5rem;left:4px;z-index:9999;max-width:92vw;padding:4px 6px;font:10px/1.5 ui-monospace,monospace;background:rgba(0,0,0,.55);color:hsl(var(--success));border-radius:4px;pointer-events:none;white-space:pre-wrap;';
    document.body.appendChild(debugOverlay);
  }
  debugOverlay.textContent = debugLines.join('\n');
}
// ==================== TODO(DEBUG) 结束 ====================

export type DisplayMode = 'both' | 'en' | 'zh';

/**
 * 将元素滚动到视口中央（等价于 scrollIntoView({ block: 'center' })），但用手动 rAF
 * 动画代替原生 behavior: 'smooth'：
 * - iOS WebKit 的程序化 smooth 滚动与 sticky/fixed 层组合时，存在动画结束后局部 tile
 *   不重绘的 bug（列表中部出现一整块与页面背景同色的空白，触碰后恢复）；
 * - 重复触发的原生 smooth 动画会互相打断，加剧该问题；手动逐帧 scrollTop 走正常
 *   绘制路径，且新动画开始前先取消上一个（由调用方 effect cleanup 保证）。
 * - 滚动目标：最近的可滚动祖先（Electron 壳为内部 main 容器，Web 为 window），
 *   与 scrollIntoView 实际作用的对象一致。
 * 返回取消函数。
 */
function scrollToCenter(el: HTMLElement): () => void {
  let scroller: HTMLElement | null = null;
  for (let n = el.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) {
      scroller = n;
      break;
    }
  }
  const isWindow = !scroller;
  const s: HTMLElement = scroller ?? (document.scrollingElement as HTMLElement) ?? document.documentElement;
  const scrollerTop = scroller ? scroller.getBoundingClientRect().top : 0;
  const elRect = el.getBoundingClientRect();
  const viewH = isWindow ? window.innerHeight : scroller!.clientHeight;
  const elTopInScroller = elRect.top - scrollerTop + s.scrollTop;
  const maxTop = Math.max(0, s.scrollHeight - viewH);
  const target = Math.min(maxTop, Math.max(0, elTopInScroller - (viewH - elRect.height) / 2));

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    s.scrollTop = target;
    return () => undefined;
  }

  const from = s.scrollTop;
  const dist = target - from;
  if (Math.abs(dist) < 1) return () => undefined;

  let raf = 0;
  const listenTarget: HTMLElement | Window = isWindow ? window : scroller!;
  const removeListeners = () => {
    listenTarget.removeEventListener('touchmove', onUserScroll);
    listenTarget.removeEventListener('wheel', onUserScroll);
  };
  const cancel = () => {
    cancelAnimationFrame(raf);
    removeListeners();
  };
  // 用户手势滚动时立即让位，不与手动滚动冲突（passive，不拦截手势本身）
  const onUserScroll = () => cancel();
  listenTarget.addEventListener('touchmove', onUserScroll, { passive: true });
  listenTarget.addEventListener('wheel', onUserScroll, { passive: true });

  const dur = Math.min(480, 200 + Math.abs(dist) * 0.3);
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    s.scrollTop = from + dist * (1 - Math.pow(1 - p, 3));
    if (p < 1) raf = requestAnimationFrame(step);
    else cancel();
  };
  raf = requestAnimationFrame(step);
  return cancel;
}

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
    const el = activeRef.current;
    if (!autoScroll || !activeParagraphId || !el) return;
    // TODO(DEBUG): 跟随目标与位置日志（与文件头部 DEBUG 段一起删除）
    const doc = document.scrollingElement ?? document.documentElement;
    const idx = paragraphs.findIndex((p) => p.id === activeParagraphId);
    debugLog(
      `follow -> idx=${idx} id=…${activeParagraphId.slice(-6)} scrollY=${Math.round(window.scrollY)} scrollTop=${Math.round(doc.scrollTop)} viewH=${window.innerHeight} docH=${doc.scrollHeight}`
    );
    return scrollToCenter(el);
  }, [activeParagraphId, autoScroll, paragraphs]);

  return (
    <div
      className={clsx('space-y-1', className)}
      style={DEBUG ? { outline: '2px solid rgba(34,211,238,.9)', outlineOffset: '-2px', background: 'rgba(34,211,238,.06)' } : undefined}
    >
      {paragraphs.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">—</div>}
      {paragraphs.map((p, i) => {
        const active = p.id === activeParagraphId;
        const hasTime = typeof p.startTimeMs === 'number';
        const isHeading = p.type === 'HEADING';
        return (
          <div
            key={p.id}
            ref={active ? activeRef : undefined}
            style={
              DEBUG
                ? { outline: '1px solid rgba(244,63,94,.85)', outlineOffset: '-1px', background: i % 2 ? 'rgba(244,63,94,.08)' : 'rgba(59,130,246,.08)' }
                : undefined
            }
            className={clsx(
              'group rounded-md border px-3 py-2 transition-colors',
              active ? 'border-l-2 border-l-primary bg-accent/60' : 'border-l-2 border-l-transparent hover:bg-muted/50',
              p.confidence < 0.5 && !active && 'border-l-warning'
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
              <div className="mt-1 flex items-center gap-1 text-[10px] text-warning">
                <Icon name="alert" size={10} />
                低置信度（{Math.round(p.confidence * 100)}%）
              </div>
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
