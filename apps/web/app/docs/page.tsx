/**
 * Documentation Page
 * 
 * Links to project documentation and resources
 */

'use client';

import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

export default function DocsPage() {
  // Controlled by NEXT_PUBLIC_SHOW_DOCS (string "true") at build time
  const showInternalDocs = process.env.NEXT_PUBLIC_SHOW_DOCS === 'true';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Documentation</h1>
            <p className="text-lg text-gray-600">
              Resources and guides for using Gridiron Edge
            </p>
          </div>

          {showInternalDocs ? (
            // Internal Documentation
            <div className="space-y-8">
              <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-8">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-green-700 font-medium">
                      Internal documentation is available!
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      Access our runbook and methodology documentation below.
                    </p>
                  </div>
                </div>
              </div>

              {/* Internal Documentation Links */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <Link
                  href="/docs/runbook"
                  className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-8 w-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Runbook</h3>
                      <p className="text-sm text-gray-600">
                        Post-run expectations, verification steps, and troubleshooting guide
                      </p>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/docs/methodology"
                  className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-8 w-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Methodology</h3>
                      <p className="text-sm text-gray-600">
                        Data sources, modeling approach, and system methodology
                      </p>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/docs/status"
                  className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-8 w-8 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Status</h3>
                      <p className="text-sm text-gray-600">
                        Live database status and sanity checks for ingestion
                      </p>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/docs/changelog"
                  className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-8 w-8 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Changelog</h3>
                      <p className="text-sm text-gray-600">
                        Notable changes and feature updates
                      </p>
                    </div>
                  </div>
                </Link>

                <Link
                  href="https://github.com/firemansghost/Gridiron-Edge-V1/blob/main/docs/selections-profitability.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-8 w-8 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Selections & Profitability</h3>
                      <p className="text-sm text-gray-600">
                        Bets ledger, grading, and performance tracking
                      </p>
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          ) : (
            // External Documentation (fallback)
            <>
              {/* Coming Soon Notice */}
              <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-8">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-700 font-medium">
                      Comprehensive documentation is coming soon!
                    </p>
                    <p className="text-sm text-blue-600 mt-1">
                      In the meantime, check out the resources below to get started.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {/* Project README */}
            <a
              href="https://github.com/firemansghost/Gridiron-Edge-V1/blob/main/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Project README</h3>
                  <p className="text-sm text-gray-600">
                    Overview, setup instructions, and getting started guide
                  </p>
                </div>
              </div>
            </a>

            {/* Architecture */}
            <Link
              href="https://github.com/firemansghost/Gridiron-Edge-V1/blob/main/docs/architecture.md"
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Architecture</h3>
                  <p className="text-sm text-gray-600">
                    System design, data flow, and technical decisions
                  </p>
                </div>
              </div>
            </Link>

            {/* Data Model */}
            <Link
              href="https://github.com/firemansghost/Gridiron-Edge-V1/blob/main/docs/data_model.md"
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
                    <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
                    <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Data Model</h3>
                  <p className="text-sm text-gray-600">
                    Database schema, tables, and relationships
                  </p>
                </div>
              </div>
            </Link>

            {/* UI Requirements */}
            <Link
              href="https://github.com/firemansghost/Gridiron-Edge-V1/blob/main/docs/ui.md"
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">UI Requirements</h3>
                  <p className="text-sm text-gray-600">
                    Page specifications and user interface design
                  </p>
                </div>
              </div>
            </Link>

            {/* Calibration */}
            <Link
              href="https://github.com/firemansghost/Gridiron-Edge-V1/blob/main/docs/calibration.md"
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Calibration</h3>
                  <p className="text-sm text-gray-600">
                    Model parameters, confidence thresholds, and tuning
                  </p>
                </div>
              </div>
            </Link>

            {/* Backtesting */}
            <Link
              href="https://github.com/firemansghost/Gridiron-Edge-V1/blob/main/docs/backtest.md"
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Backtesting</h3>
                  <p className="text-sm text-gray-600">
                    Strategy testing, CLI usage, and report analysis
                  </p>
                </div>
              </div>
            </Link>
          </div>

          {/* Getting Help */}
          <div className="bg-gray-100 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Need Help?</h2>
            <div className="space-y-3 text-sm">
              <p className="text-gray-700">
                <strong>GitHub Issues:</strong>{' '}
                <a 
                  href="https://github.com/firemansghost/Gridiron-Edge-V1/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  Report bugs or request features
                </a>
              </p>
              <p className="text-gray-700">
                <strong>Source Code:</strong>{' '}
                <a 
                  href="https://github.com/firemansghost/Gridiron-Edge-V1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  Browse the repository
                </a>
              </p>
              <p className="text-gray-700">
                <strong>Roadmap:</strong>{' '}
                <a 
                  href="https://github.com/firemansghost/Gridiron-Edge-V1/blob/main/docs/roadmap.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  View planned features and milestones
                </a>
              </p>
            </div>
              </div>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

