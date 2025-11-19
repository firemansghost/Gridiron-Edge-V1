/**
 * Getting Started Guide
 * 
 * Beginner-friendly guide explaining key concepts
 */

'use client';

import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { InfoTooltip } from '@/components/InfoTooltip';

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Getting Started</h1>
          <p className="text-lg text-gray-600 mb-8">
            Learn how to use Gridiron Edge to find betting opportunities and understand our model's predictions.
          </p>

          {/* Key Concepts */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Key Concepts</h2>
            
            <div className="space-y-6">
              {/* What is Edge */}
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-start gap-3 mb-3">
                  <h3 className="text-xl font-semibold text-gray-900">What is Edge?</h3>
                  <InfoTooltip content="Edge is the difference between our model's prediction and the betting market (in points). Higher edge = stronger betting opportunity." />
                </div>
                <p className="text-gray-700 mb-4">
                  <strong>Edge</strong> is the difference between our model's prediction and the betting market line, measured in points. 
                  When our model thinks a game will have a different outcome than what sportsbooks are offering, that creates an "edge" or opportunity.
                </p>
                <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                  <p className="text-sm text-blue-900">
                    <strong>Example:</strong> If the market has Team A favored by 7 points, but our model thinks Team A should only be favored by 3 points, 
                    we have a <strong>4-point edge</strong> on Team B (the underdog). This suggests Team B +7 points might be a good bet.
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-sm font-semibold text-green-800 mb-1">High Edge (A)</div>
                    <div className="text-xs text-green-700">4.0+ points</div>
                    <div className="text-xs text-green-600 mt-1">Strongest opportunities</div>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded">
                    <div className="text-sm font-semibold text-yellow-800 mb-1">Medium Edge (B)</div>
                    <div className="text-xs text-yellow-700">3.0-3.9 points</div>
                    <div className="text-xs text-yellow-600 mt-1">Good opportunities</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded">
                    <div className="text-sm font-semibold text-red-800 mb-1">Low Edge (C)</div>
                    <div className="text-xs text-red-700">2.0-2.9 points</div>
                    <div className="text-xs text-red-600 mt-1">Use with caution</div>
                  </div>
                </div>
              </div>

              {/* Model vs Market */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Model Spread vs Market Spread</h3>
                <p className="text-gray-700 mb-4">
                  Our model calculates its own predicted point spread based on team power ratings. This <strong>Model Spread</strong> is compared 
                  against the <strong>Market Spread</strong> (what sportsbooks are offering) to find discrepancies.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-purple-900 mb-2">Model Spread</h4>
                    <p className="text-sm text-purple-800">
                      Our prediction based on team strength ratings, calculated from offensive and defensive statistics. 
                      This is what we think the spread should be.
                    </p>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-orange-900 mb-2">Market Spread</h4>
                    <p className="text-sm text-orange-800">
                      The actual betting line from sportsbooks. This is what you'd bet against. When our model disagrees significantly, 
                      there's an opportunity.
                    </p>
                  </div>
                </div>
              </div>

              {/* Confidence Tiers */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Confidence Tiers</h3>
                <p className="text-gray-700 mb-4">
                  We categorize betting opportunities into three confidence tiers based on edge size:
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-800 font-bold text-sm">
                      A
                    </span>
                    <div>
                      <strong className="text-green-800">High Confidence (A):</strong> Edge ≥ 4.0 points
                      <p className="text-sm text-gray-600 mt-1">
                        These are our strongest recommendations. The model strongly disagrees with the market, suggesting significant value.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-800 font-bold text-sm">
                      B
                    </span>
                    <div>
                      <strong className="text-yellow-800">Medium Confidence (B):</strong> Edge 3.0-3.9 points
                      <p className="text-sm text-gray-600 mt-1">
                        Good opportunities with solid model advantage. Still worth considering, but less confident than Tier A.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-800 font-bold text-sm">
                      C
                    </span>
                    <div>
                      <strong className="text-red-800">Low Confidence (C):</strong> Edge 2.0-2.9 points
                      <p className="text-sm text-gray-600 mt-1">
                        Lower confidence opportunities. Use with caution and consider other factors before betting.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Power Ratings */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Power Ratings</h3>
                <p className="text-gray-700 mb-4">
                  <strong>Power Rating</strong> is a team's overall strength score combining offensive and defensive capabilities. 
                  Higher numbers indicate stronger teams.
                </p>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>How it's calculated:</strong> We analyze multiple statistics (yards per play, success rate, EPA, etc.) 
                    and combine them into offensive and defensive indices, which are then combined into an overall power rating.
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Confidence score (0-1):</strong> Shows how reliable the rating is based on data quality. Higher confidence = more reliable predictions.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* How to Use */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">How to Use This Site</h2>
            
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">1. View Current Slate</h3>
                <p className="text-gray-700 mb-3">
                  Start at the <Link href="/" className="text-blue-600 hover:text-blue-800 underline">Current Slate</Link> page to see this week's games 
                  with model predictions and edge calculations.
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li>Look for games with <span className="text-green-600 font-semibold">High Confidence (A)</span> edges</li>
                  <li>Compare Model Spread to Market Spread</li>
                  <li>Click on any game for detailed analysis</li>
                </ul>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">2. Review Game Details</h3>
                <p className="text-gray-700 mb-3">
                  Click any game to see detailed breakdowns including:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li>Team power ratings and confidence scores</li>
                  <li>Model vs Market comparison for spread and total</li>
                  <li>Edge analysis showing spread edge, total edge, and max edge</li>
                  <li>Recommended picks with edge calculations</li>
                </ul>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">3. Browse Past Weeks</h3>
                <p className="text-gray-700 mb-3">
                  Use <Link href="/weeks" className="text-blue-600 hover:text-blue-800 underline">Browse Weeks</Link> to review historical data 
                  and see how model predictions performed.
                </p>
              </div>
            </div>
          </section>

          {/* Important Notes */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Important Notes</h2>
            
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-lg">
              <h3 className="text-lg font-semibold text-yellow-900 mb-3">⚠️ Betting Disclaimers</h3>
              <ul className="space-y-2 text-sm text-yellow-800">
                <li>• <strong>Not financial advice:</strong> All predictions are for educational purposes only</li>
                <li>• <strong>Do your own research:</strong> Always verify information and consider other factors before betting</li>
                <li>• <strong>Bet responsibly:</strong> Only bet what you can afford to lose</li>
                <li>• <strong>No guarantees:</strong> Past performance doesn't guarantee future results</li>
                <li>• <strong>Market changes:</strong> Betting lines change frequently - edge opportunities may not last</li>
              </ul>
            </div>
          </section>

          {/* Additional Resources */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Additional Resources</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/docs/methodology" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Methodology</h3>
                <p className="text-sm text-gray-600">Learn how our ratings model works and how we calculate predictions.</p>
              </Link>
              <Link href="/ratings" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Power Ratings</h3>
                <p className="text-sm text-gray-600">View team power ratings and see how the model ranks all FBS teams.</p>
              </Link>
              <Link href="/docs/status" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">System Status</h3>
                <p className="text-sm text-gray-600">Check database status and data coverage.</p>
              </Link>
              <Link href="/disclaimer" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Disclaimer</h3>
                <p className="text-sm text-gray-600">Legal disclaimers and terms of use.</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}

