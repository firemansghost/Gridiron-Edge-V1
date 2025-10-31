import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
          {/* Learn More */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Learn More</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/getting-started" className="text-gray-600 hover:text-blue-600 transition-colors">
                  Getting Started
                </Link>
              </li>
              <li>
                <Link href="/docs/glossary" className="text-gray-600 hover:text-blue-600 transition-colors">
                  Glossary
                </Link>
              </li>
              {process.env.NEXT_PUBLIC_SHOW_DOCS === 'true' && (
                <>
                  <li>
                    <Link href="/docs/methodology" className="text-gray-600 hover:text-blue-600 transition-colors">
                      Methodology
                    </Link>
                  </li>
                  <li>
                    <Link href="/docs" className="text-gray-600 hover:text-blue-600 transition-colors">
                      Documentation
                    </Link>
                  </li>
                  <li>
                    <Link href="/docs/status" className="text-gray-600 hover:text-blue-600 transition-colors">
                      System Status
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/ratings/config" className="text-gray-600 hover:text-blue-600 transition-colors">
                  Ratings Configuration
                </Link>
              </li>
              <li>
                <Link href="/disclaimer" className="text-gray-600 hover:text-blue-600 transition-colors">
                  Disclaimer
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/firemansghost/Gridiron-Edge-V1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-blue-600 transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Model Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Model Info</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>Ratings Model v1</li>
              <li>Home Field Advantage: +2.0 pts</li>
              <li>Confidence Tiers: A (≥4.0), B (≥3.0), C (≥2.0)</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
            <div className="text-gray-500">
              © {new Date().getFullYear()} Gridiron Edge. For educational purposes only.
            </div>
            <div className="text-gray-500">
              Not financial advice. Bet responsibly.
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
