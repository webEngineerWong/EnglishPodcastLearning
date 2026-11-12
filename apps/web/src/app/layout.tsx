import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'English Podcast Learning',
  description: '英语播客学习平台：播客精听、双语阅读、词汇管理'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="dark">
      <head>
        {/* 首帧主题：默认 dark；已保存偏好优先（light/system 命中亮色时移除 dark），避免闪白 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('elp-theme');var l=window.matchMedia('(prefers-color-scheme: light)').matches;if(t==='light'||(t!=='dark'&&l))document.documentElement.classList.remove('dark');}catch(e){}"
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
