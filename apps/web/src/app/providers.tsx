'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { I18nProvider, ThemeProvider } from '@elp/ui';
import { AppShell } from '@/components/shell';

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
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
