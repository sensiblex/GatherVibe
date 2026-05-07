import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientLayout from './ClientLayout';

export const metadata: Metadata = {
  title: 'GatherVibe',
  description: 'Найди компанию для похода на мероприятия',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#610bef',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" data-theme="dark" data-scroll-behavior="smooth">
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
