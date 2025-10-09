import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gridiron Edge',
  description: 'College football analytics platform for power ratings, implied spreads, and betting edge identification',
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
