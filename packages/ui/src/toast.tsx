/**
 * 轻量 Toast —— 替代 alert()。
 * 颜色使用 success/destructive token，图标 CheckCircle2 / CircleAlert。
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Icon } from './icons';
import clsx from 'clsx';

type ToastKind = 'success' | 'error';

interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}

const ToastCtx = createContext<{ show: (msg: string, kind?: ToastKind) => void }>({ show: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((msg: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-2), { id, msg, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[120] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              'pointer-events-auto flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm shadow-lg',
              t.kind === 'success'
                ? 'border-success/40 bg-success text-success-foreground'
                : 'border-destructive/40 bg-destructive text-destructive-foreground'
            )}
          >
            {t.kind === 'success' ? <Icon name="checkCircle" size="sm" /> : <Icon name="error" size="sm" />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
