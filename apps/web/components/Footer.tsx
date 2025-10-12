import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left: Links */}
          <div className="flex items-center gap-6 text-sm">
            <a
              href="https://github.com/firemansghost/Gridiron-Edge-V1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              GitHub
            </a>
            <Link href="/docs" className="text-gray-600 hover:text-blue-600 transition-colors">
              Docs
            </Link>
            <Link href="/disclaimer" className="text-gray-600 hover:text-blue-600 transition-colors">
              Disclaimer
            </Link>
          </div>

          {/* Right: Copyright */}
          <div className="text-sm text-gray-500">
            © {new Date().getFullYear()} Gridiron Edge. For educational purposes only.
          </div>
        </div>
      </div>
    </footer>
  );
}
