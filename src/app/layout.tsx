import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import AppLayout from '@/components/AppLayout';

export const metadata: Metadata = {
  title: '請求管理',
  description: 'モダンな請求管理',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Providers>
          <AppLayout>
            {children}
          </AppLayout>
        </Providers>
      </body>
    </html>
  );
}
