import { DocsMeta } from '@/components/DocsMeta';

export default function ChangelogPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Changelog
      </h1>
      
      <div className="space-y-8">
        {/* Latest commit info if available */}
        {(process.env.NEXT_PUBLIC_GIT_SHA && process.env.NEXT_PUBLIC_REPO_URL) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-blue-900">Latest commit:</span>
              <a
                href={`${process.env.NEXT_PUBLIC_REPO_URL}/commit/${process.env.NEXT_PUBLIC_GIT_SHA}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-blue-600 hover:text-blue-800 underline"
              >
                {process.env.NEXT_PUBLIC_GIT_SHA.substring(0, 7)}
              </a>
            </div>
          </div>
        )}

        {/* Changelog entries */}
        <div className="space-y-6">
          {/* 2025-01-08 */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-mono text-gray-500">2025-01-08</span>
              <span className="text-sm font-medium text-gray-900">Performance & Moneyline Support</span>
            </div>
            <ul className="text-sm text-gray-700 space-y-1 ml-4">
              <li>• Single-week polling to prevent workflow timeouts</li>
              <li>• Chunked upserts and deduplication for better performance</li>
              <li>• Moneyline support across API and UI</li>
              <li>• FBS-only filtering to reduce data volume</li>
              <li>• CI safety guards and performance optimizations</li>
            </ul>
          </div>

          {/* 2025-01-06 */}
          <div className="border-l-4 border-blue-500 pl-4 py-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-mono text-gray-500">2025-01-06</span>
              <span className="text-sm font-medium text-gray-900">Data Source Improvements</span>
            </div>
            <ul className="text-sm text-gray-700 space-y-1 ml-4">
              <li>• Odds API fallback added for reliable data ingestion</li>
              <li>• SGO league auto-discovery implemented</li>
              <li>• Enhanced error logging and debugging</li>
              <li>• Improved team name matching algorithms</li>
            </ul>
          </div>

          {/* 2024-12-20 */}
          <div className="border-l-4 border-purple-500 pl-4 py-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-mono text-gray-500">2024-12-20</span>
              <span className="text-sm font-medium text-gray-900">Documentation System</span>
            </div>
            <ul className="text-sm text-gray-700 space-y-1 ml-4">
              <li>• Internal documentation system implemented</li>
              <li>• Runbook with post-run expectations and SQL queries</li>
              <li>• Methodology documentation with transparent approach</li>
              <li>• Environment-controlled docs visibility</li>
            </ul>
          </div>

          {/* 2024-12-15 */}
          <div className="border-l-4 border-orange-500 pl-4 py-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-mono text-gray-500">2024-12-15</span>
              <span className="text-sm font-medium text-gray-900">Core Features</span>
            </div>
            <ul className="text-sm text-gray-700 space-y-1 ml-4">
              <li>• Power ratings and implied line calculations</li>
              <li>• Strategy rulesets and automated betting logic</li>
              <li>• Backtesting CLI with historical data support</li>
              <li>• CSV export functionality for data analysis</li>
            </ul>
          </div>

          {/* 2024-12-01 */}
          <div className="border-l-4 border-gray-400 pl-4 py-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-mono text-gray-500">2024-12-01</span>
              <span className="text-sm font-medium text-gray-900">Initial Release</span>
            </div>
            <ul className="text-sm text-gray-700 space-y-1 ml-4">
              <li>• Gridiron Edge v1.0 launch</li>
              <li>• CFBD data integration for schedules and scores</li>
              <li>• Basic UI with Home, Weeks, and Game Detail pages</li>
              <li>• PostgreSQL database with Prisma ORM</li>
            </ul>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            <strong>Note:</strong> This changelog tracks major features and improvements. 
            For detailed technical changes, see the <a 
              href="https://github.com/firemansghost/Gridiron-Edge-V1/commits/main" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              GitHub commit history
            </a>.
          </p>
        </div>
      </div>
    </>
  );
}
