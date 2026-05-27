import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import AppLayout from '@/components/AppLayout';

export const metadata: Metadata = {
  title: '勤怠管理システム',
  description: 'モダンな勤怠管理システム',
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
