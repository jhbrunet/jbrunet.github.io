import type { Metadata, Viewport } from 'next';
import { SiteLoader } from '@/components/SiteLoader';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/layout.css';
import '@/styles/components.css';
import '@/styles/utilities.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
};

export const metadata: Metadata = {
  title: 'Julian Brunet / FIS 6100596 / Head Coach U18 FIS Men',
  description:
    'Julian Brunet: Alpine GS specialist (Best GS 34.95, #459 World FIS peak) turned Head Coach, U18 FIS Men at Club de Ski Mont Garceau.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    url: 'https://jbrunet.com',
    title: 'Julian Brunet / The Run (FIS 6100596)',
    description:
      'Alpine GS specialist (Best GS 34.95) and Head Coach U18 FIS Men at Club de Ski Mont Garceau.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/Libron-Bold.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Libron-Italic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a href="#start-gate" className="skip-link">
          Skip to Start Gate
        </a>
        <SiteLoader />
        {children}
      </body>
    </html>
  );
}
