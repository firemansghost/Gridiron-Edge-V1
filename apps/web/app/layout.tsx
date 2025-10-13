import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Gridiron Edge',
    template: '%s | Gridiron Edge',
  },
  description: 'College football analytics platform for power ratings, implied spreads, and betting edge identification. Discover data-driven insights for CFB games.',
  keywords: ['college football', 'CFB analytics', 'power ratings', 'betting edge', 'sports analytics', 'implied spreads'],
  authors: [{ name: 'Gridiron Edge' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://gridiron-edge.vercel.app',
    siteName: 'Gridiron Edge',
    title: 'Gridiron Edge - College Football Analytics',
    description: 'Data-driven college football analytics with power ratings, implied spreads, and betting edge identification.',
    images: [
      {
        url: '/og.svg',
        width: 1200,
        height: 630,
        alt: 'Gridiron Edge - College Football Analytics',
        type: 'image/svg+xml',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gridiron Edge - College Football Analytics',
    description: 'Data-driven college football analytics with power ratings, implied spreads, and betting edge identification.',
    images: ['/og.svg'],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml', sizes: '180x180' },
    ],
    apple: '/icon.svg',
    shortcut: '/favicon.svg',
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
