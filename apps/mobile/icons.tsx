/**
 * iOS 端图标 —— 与 Web/Desktop 的 @elp/icons（packages/icons）同一套 lucide 图标。
 * lucide-react-native 与 @elp/icons 所用的 lucide-react 路径同源、同名导出；
 * ICONS 映射与规格逐项对齐：strokeWidth 1.75、尺寸 sm16/md18/nav20/player24/empty48。
 * RN 无 currentColor：颜色由调用方显式传入（一般 inactive=c.faint / active=c.primary）。
 */
import React from 'react';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, BookOpen, BookPlus, Bookmark,
  Captions, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, Copy,
  File, FileText, FileUp, Film, Gauge, Headphones, House, ImagePlus, Inbox, Library, LoaderCircle, Moon,
  Paperclip, Pause, Pencil, Play, Plus, RefreshCw, Repeat, Repeat1, RotateCcw, RotateCw, ScanSearch,
  Scissors, Search, Settings2, SkipBack, SkipForward, Star, Sun, Timer, Trash2, TrendingUp, Volume2, VolumeX, X
} from 'lucide-react-native';

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
  color,
  strokeWidth = 1.75
}: {
  name: IconName;
  size?: IconSize | number;
  color?: string;
  strokeWidth?: number;
}) {
  const Cmp = ICONS[name];
  const px = typeof size === 'number' ? size : SIZES[size];
  return <Cmp size={px} strokeWidth={strokeWidth} color={color} />;
}
