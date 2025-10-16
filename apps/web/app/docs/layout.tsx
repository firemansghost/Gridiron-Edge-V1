import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Internal Documentation',
  description: 'Internal documentation for Gridiron Edge',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Link 
              href="/" 
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Home
            </Link>
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
              Internal
            </span>
          </div>
        </div>
        
        {/* Content */}
        <div className="prose prose-lg max-w-none">
          {children}
        </div>
      </div>
    </div>
  );
}
