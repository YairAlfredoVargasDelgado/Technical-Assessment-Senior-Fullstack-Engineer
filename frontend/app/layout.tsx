import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'JobTracker',
  description: 'Multi-tenant job management for roofing companies.',
};

/**
 * The root layout — a Server Component, with no `'use client'` anywhere above the
 * leaves that need it.
 *
 * `lang="en"` is not decoration: without it a screen reader uses the system voice,
 * so English content is read with the wrong pronunciation rules.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
          A skip link, first in the tab order. Keyboard users otherwise tab
          through the whole filter bar on every page load to reach the table.
        */}
        <a href="#main-content" className="visually-hidden">
          Skip to main content
        </a>

        {children}
      </body>
    </html>
  );
}
