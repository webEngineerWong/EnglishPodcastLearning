import React from 'react';
import clsx from 'clsx';
import { Icon } from './icons';
import { Tooltip } from './tooltip';

// 基础组件集（shadcn 风格、手写实现，供 Web 与 Electron 共用）
export const Button = ({
  variant = 'default',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive' | 'active';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
}) => (
  <button
    className={clsx(
      'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
      {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover active:scale-[0.98] motion-reduce:active:scale-none',
        secondary: 'border border-border bg-card hover:bg-muted active:scale-[0.98] motion-reduce:active:scale-none',
        ghost: 'hover:bg-muted',
        outline: 'border border-border bg-card hover:bg-muted active:scale-[0.98] motion-reduce:active:scale-none',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90 active:scale-[0.98] motion-reduce:active:scale-none',
        active: 'bg-primary/15 text-primary hover:bg-primary/25'
      }[variant],
      {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-9 w-9'
      }[size],
      className
    )}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...props}
  >
    {loading && <Icon name="loading" size="sm" className="animate-spin" />}
    {children}
  </button>
);

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('rounded-xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none', className)} {...props} />
);

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('flex flex-col space-y-1 p-4', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={clsx('text-sm font-semibold leading-none tracking-tight', className)} {...props} />
);

export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('p-4 pt-2', className)} {...props} />
);

export const Badge = ({
  className,
  tone = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted' }) => (
  <span
    className={clsx(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      {
        default: 'bg-primary/15 text-primary',
        success: 'bg-success/15 text-success',
        warning: 'bg-warning/15 text-warning',
        danger: 'bg-destructive/15 text-destructive',
        muted: 'bg-muted text-muted-foreground'
      }[tone],
      className
    )}
    {...props}
  />
);

export const Input = ({ className, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) => (
  <>
    <input
      aria-invalid={error ? true : undefined}
      className={clsx(
        'flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-colors duration-150 ease-out motion-reduce:transition-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        error && 'border-destructive focus-visible:ring-destructive',
        className
      )}
      {...props}
    />
    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
  </>
);

export const Textarea = ({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={clsx(
      'flex min-h-[70px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors duration-150 ease-out motion-reduce:transition-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className
    )}
    {...props}
  />
);

export const Select = ({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={clsx(
      'flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className
    )}
    {...props}
  />
);

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={clsx('text-sm font-medium leading-none', className)} {...props} />
);

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      role="status"
      aria-label="loading"
    />
  );
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
      {icon && <div className="flex justify-center text-muted-foreground/70">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs">{hint}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="close">
            <Icon name="close" size="sm" />
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/** 轻量标签栏：样式与工具栏「双语/仅英/仅中」按钮组一致，供 Web / Electron 复用 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className
}: {
  tabs: readonly { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx('inline-flex overflow-hidden rounded-md border border-border', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={clsx('px-3 py-1.5 text-xs', value === tab.value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
