'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { I18nProvider, ThemeProvider, ToastProvider } from '@elp/ui';
import { PlayerProvider } from '@elp/player';
import { AppShell } from '@/components/shell';
import { api } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 }
        }
      })
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <PlayerProvider
              heartbeat={(info) =>
                // isPlaying=true：桌面播放也喂负一屏状态总线（多端一致）
                void api
                  .heartbeat({
                    courseId: info.courseId,
                    audioAssetId: info.audioAssetId,
                    positionMs: info.positionMs,
                    deltaMs: 5000,
                    isPlaying: info.isPlaying,
                    courseTitle: info.courseTitle
                  })
                  .catch(() => undefined)
              }
            >
              <AppShell>{children}</AppShell>
            </PlayerProvider>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
