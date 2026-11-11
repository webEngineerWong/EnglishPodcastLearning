'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React from 'react';
import clsx from 'clsx';
import { Badge, Button, useI18n, useTheme } from '@elp/ui';

const NAV = [
  { href: '/', key: 'dashboard', icon: '📊' },
  { href: '/courses', key: 'courses', icon: '📚' },
  { href: '/import', key: 'importCenter', icon: '📥' },
  { href: '/vocabulary', key: 'vocabulary', icon: '🔤' },
  { href: '/favorites', key: 'favorites', icon: '⭐' }
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const { resolved, setMode } = useTheme();
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* 侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">EP</div>
          <div>
            <div className="text-sm font-semibold">{t('appName')}</div>
            <div className="text-[10px] text-muted-foreground">Listen · Read · Learn</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  active ? 'bg-primary/12 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span>{item.icon}</span>
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-border px-3 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('language')}</span>
            <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>
              {locale === 'zh' ? 'EN' : '中文'}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('darkMode')}</span>
            <Button variant="ghost" size="sm" onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}>
              {resolved === 'dark' ? '☀️' : '🌙'}
            </Button>
          </div>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border bg-card px-3 py-2 md:hidden">
        <div className="text-sm font-semibold">{t('appName')}</div>
        <div className="flex gap-1">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded px-2 py-1 text-lg">
              {item.icon}
            </Link>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}>
            {resolved === 'dark' ? '☀️' : '🌙'}
          </Button>
        </div>
      </div>

      <main className="flex-1 px-4 pb-16 pt-14 md:ml-56 md:px-8 md:pt-8">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DifficultyBadge({ level }: { level: number }) {
  const colors = ['bg-emerald-500', 'bg-sky-500', 'bg-indigo-500', 'bg-amber-500', 'bg-rose-500'];
  return (
    <Badge tone="muted">
      <span className={clsx('mr-1 inline-block h-1.5 w-1.5 rounded-full', colors[Math.min(level, 5) - 1])} />
      L{level}
    </Badge>
  );
}
