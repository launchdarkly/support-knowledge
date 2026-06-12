import type { Metadata } from 'next';
import LDProviderClient from './components/LDProviderClient';
import './globals.css';

export const metadata: Metadata = {
  title: 'LaunchDarkly + Next.js',
  description: 'LaunchDarkly with Next.js (App Router)',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = {
    kind: 'user' as const,
    key: 'user-123',
  };

  return (
    <html lang="en">
      <body>
        <LDProviderClient context={context}>
          {children}
        </LDProviderClient>
      </body>
    </html>
  );
}
