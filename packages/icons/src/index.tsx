/**
 * @elp/icons —— 共享图标原语（Web/Desktop/iOS 桥接共用）
 * 页面只通过此处使用图标；规格：strokeWidth 1.75、currentColor、尺寸 sm16/md18/nav20/player24/empty48。
 * Tooltip 为纯图标按钮的无障碍配套（Radix）。
 */
import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, BookOpen, BookPlus, Bookmark,
  Captions, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, Copy,
  File, FileText, FileUp, Film, Gauge, Headphones, House, ImagePlus, Inbox, Library, LoaderCircle, Moon,
  Paperclip, Pause, Pencil, Play, Plus, RefreshCw, Repeat, Repeat1, RotateCcw, RotateCw, ScanSearch,
  Scissors, Search, Settings2, SkipBack, SkipForward, Star, Sun, Timer, Trash2, TrendingUp, Volume2, VolumeX, X
} from 'lucide-react';

export const ICONS = {
  dashboard: House,
  library: Library,
  import: FileUp,
  vocabulary: BookOpen,
  favorites: Bookmark,
  audio: Headphones,
  audioFile: AudioLines,
  trendingUp: TrendingUp,
  pdf: FileText,
  srt: Captions,
  video: Film,
  file: File,
  paperclip: Paperclip,
  pencil: Pencil,
  scissors: Scissors,
  trash: Trash2,
  close: X,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  refresh: RefreshCw,
  play: Play,
  pause: Pause,
  skipBack: SkipBack,
  skipForward: SkipForward,
  rewind: RotateCcw,
  fastForward: RotateCw,
  gauge: Gauge,
  volume: Volume2,
  volumeMute: VolumeX,
  repeat: Repeat,
  repeatOne: Repeat1,
  sun: Sun,
  moon: Moon,
  search: Search,
  scanSearch: ScanSearch,
  settings: Settings2,
  timer: Timer,
  check: Check,
  checkCircle: CheckCircle2,
  alert: AlertTriangle,
  error: CircleAlert,
  loading: LoaderCircle,
  copy: Copy,
  star: Star,
  inbox: Inbox,
  plus: Plus,
  imagePlus: ImagePlus,
  bookPlus: BookPlus
} as const;

export type IconName = keyof typeof ICONS;

const SIZES = { sm: 16, md: 18, nav: 20, player: 24, empty: 48 } as const;

export type IconSize = keyof typeof SIZES;

export function Icon({
  name,
  size = 'md',
  className,
  strokeWidth = 1.75,
  fill = 'none',
  'aria-hidden': ariaHidden = true
}: {
  name: IconName;
  size?: IconSize | number;
  className?: string;
  strokeWidth?: number;
  fill?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}) {
  const Cmp = ICONS[name];
  const px = typeof size === 'number' ? size : SIZES[size];
  return <Cmp size={px} strokeWidth={strokeWidth} className={className} fill={fill} aria-hidden={ariaHidden} />;
}

export function Tooltip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-[110] rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md"
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
