/**
 * Disclaimer Page
 * 
 * Legal disclaimer and responsible betting information
 */

'use client';

import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Disclaimer</h1>
            <p className="text-lg text-gray-600">
              Important information about using Gridiron Edge
            </p>
          </div>

          {/* Warning Banner */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 mb-8">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700 font-medium">
                  This platform is for educational and informational purposes only.
                </p>
              </div>
            </div>
          </div>

          {/* Content Sections */}
          <div className="bg-white rounded-lg shadow-lg p-8 space-y-8">
            {/* Educational Purpose */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Educational Purpose</h2>
              <div className="prose text-gray-700 space-y-3">
                <p>
                  Gridiron Edge is a data analysis and educational platform designed to help users understand college football analytics, 
                  power ratings, and betting market dynamics. All information, predictions, and analysis provided are for 
                  <strong> educational and informational purposes only</strong>.
                </p>
                <p>
                  The platform demonstrates statistical modeling concepts, backtesting methodologies, and sports analytics techniques. 
                  It is not intended to encourage or facilitate gambling activities.
                </p>
              </div>
            </section>

            {/* No Guarantee */}
            <section className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">No Guarantee of Accuracy</h2>
              <div className="prose text-gray-700 space-y-3">
                <p>
                  All data, ratings, predictions, and analysis are provided <strong>"as is"</strong> without any warranty or guarantee 
                  of accuracy, completeness, or fitness for any particular purpose. The models and algorithms used are experimental 
                  and subject to error.
                </p>
                <p>
                  <strong>Past performance does not indicate future results.</strong> Historical backtesting results do not guarantee 
                  similar outcomes in live betting scenarios. Market conditions, team performance, and other factors can change unpredictably.
                </p>
              </div>
            </section>

            {/* Not Financial Advice */}
            <section className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Not Financial or Betting Advice</h2>
              <div className="prose text-gray-700 space-y-3">
                <p>
                  Nothing on this platform constitutes financial, legal, or betting advice. Users should not rely on any information 
                  provided here when making betting decisions. Always conduct your own research and consult with qualified professionals 
                  before engaging in any betting activities.
                </p>
                <p>
                  The "strategy" and "betting edge" features are theoretical tools for understanding expected value calculations. 
                  They do not represent recommendations to place actual bets.
                </p>
              </div>
            </section>

            {/* Responsible Betting */}
            <section className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Responsible Betting</h2>
              <div className="prose text-gray-700 space-y-3">
                <p>
                  If you choose to engage in sports betting, please do so responsibly:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Only bet what you can afford to lose</li>
                  <li>Never chase losses or bet with money needed for essential expenses</li>
                  <li>Set strict budgets and time limits for betting activities</li>
                  <li>Understand that betting involves risk and most bettors lose money over time</li>
                  <li>Be aware of problem gambling warning signs</li>
                  <li>Seek help if betting becomes problematic</li>
                </ul>
                <p className="mt-4">
                  <strong>Problem Gambling Resources:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>National Council on Problem Gambling: <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 underline">ncpgambling.org</a></li>
                  <li>National Problem Gambling Helpline: <strong>1-800-522-4700</strong></li>
                  <li>Gamblers Anonymous: <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 underline">gamblersanonymous.org</a></li>
                </ul>
              </div>
            </section>

            {/* Legal Compliance */}
            <section className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Legal Compliance</h2>
              <div className="prose text-gray-700 space-y-3">
                <p>
                  Users are solely responsible for ensuring their use of this platform and any betting activities comply with 
                  applicable laws in their jurisdiction. Sports betting laws vary by location and may prohibit or restrict betting activities.
                </p>
                <p>
                  This platform does not facilitate betting transactions, accept wagers, or operate as a gambling service. 
                  It is an analytical and educational tool only.
                </p>
              </div>
            </section>

            {/* Limitation of Liability */}
            <section className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Limitation of Liability</h2>
              <div className="prose text-gray-700 space-y-3">
                <p>
                  The creators and operators of Gridiron Edge shall not be liable for any losses, damages, or negative consequences 
                  arising from the use of this platform or reliance on its information. This includes but is not limited to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Financial losses from betting activities</li>
                  <li>Errors, inaccuracies, or omissions in data or analysis</li>
                  <li>Technical issues or service interruptions</li>
                  <li>Any other direct, indirect, incidental, or consequential damages</li>
                </ul>
                <p>
                  <strong>By using this platform, you acknowledge and agree to these terms and limitations.</strong>
                </p>
              </div>
            </section>

            {/* Age Restriction */}
            <section className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Age Restriction</h2>
              <div className="prose text-gray-700">
                <p>
                  This platform is intended for users 18 years of age or older (21+ where required by law). 
                  If you are under the legal gambling age in your jurisdiction, you should not use this platform 
                  in connection with any betting activities.
                </p>
              </div>
            </section>

            {/* Updates */}
            <section className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Updates to This Disclaimer</h2>
              <div className="prose text-gray-700">
                <p>
                  This disclaimer may be updated periodically without notice. Continued use of the platform after changes 
                  constitutes acceptance of the updated terms.
                </p>
                <p className="text-sm text-gray-500 mt-4">
                  Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </section>
          </div>

          {/* Back Button */}
          <div className="mt-8 text-center">
            <Link
              href="/"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

