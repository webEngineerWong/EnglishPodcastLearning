/**
 * 渲染端桥接类型（window.elp 由 preload 注入）。
 */
import type { DesktopBridge } from '@elp/types';

declare global {
  interface Window {
    elp?: DesktopBridge;
  }
}

export function desktop(): DesktopBridge | null {
  return typeof window !== 'undefined' && window.elp ? window.elp : null;
}

export const isDesktop = () => !!desktop();
