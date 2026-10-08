import type { Metadata, Viewport } from 'next';
// Fonts are bundled from npm (not fetched from Google at build time): next/font/google fails in Vercel's Turbopack build.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Market Intelligence',
  description: 'Personal, non-commercial markets dashboard: prices, news, AI reads and an economic calendar.',
};
export const viewport: Viewport = { themeColor: '#0b0c0e', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
