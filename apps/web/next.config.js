/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router is stable in Next.js 14, no experimental flag needed
  
  async headers() {
    return [
      {
        // Cache static assets (logos, demo files) aggressively
        source: '/logos/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/demo/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
