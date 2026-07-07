import type { Metadata, Viewport } from 'next';
import './globals.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Studio — AI Video',
  description:
    'Self-hosted AI video generation studio: cinematic templates, multi-provider (MuAPI / fal.ai), job history.',
};

export const viewport: Viewport = {
  themeColor: '#050505',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
