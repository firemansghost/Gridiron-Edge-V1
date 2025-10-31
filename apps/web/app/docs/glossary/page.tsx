/**
 * Glossary Page
 * 
 * Comprehensive glossary of terms and concepts used in Gridiron Edge
 */

'use client';

import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { InfoTooltip } from '@/components/InfoTooltip';

const glossaryTerms = [
  {
    term: 'Edge',
    category: 'Betting Concepts',
    definition: 'The difference between our model\'s prediction and the betting market line, measured in points.',
    example: 'If the market has Team A favored by 7 points but our model thinks they should only be favored by 3 points, we have a 4-point edge on Team B.',
    related: ['Confidence Tier', 'Model Spread', 'Market Spread']
  },
  {
    term: 'Model Spread',
    category: 'Predictions',
    definition: 'Our model\'s predicted point spread for a game, calculated using team power ratings and home field advantage.',
    example: 'Model Spread: -5.2 means our model predicts the home team will win by about 5.2 points.',
    related: ['Power Rating', 'Home Field Advantage', 'Market Spread']
  },
  {
    term: 'Market Spread',
    category: 'Betting Concepts',
    definition: 'The actual betting line from sportsbooks. This is what you would bet against.',
    example: 'Market Spread: -7 means the sportsbook has the home team favored by 7 points.',
    related: ['Edge', 'Model Spread']
  },
  {
    term: 'Model Total',
    category: 'Predictions',
    definition: 'Our model\'s predicted total points for a game (over/under), based on team offensive/defensive ratings and pace.',
    example: 'Model Total: 54.5 means our model predicts the game will have about 54-55 total points scored.',
    related: ['Market Total', 'Pace', 'Power Rating']
  },
  {
    term: 'Market Total',
    category: 'Betting Concepts',
    definition: 'The betting market\'s total points line (over/under). This is what you would bet against.',
    example: 'Market Total: 52.5 means you can bet over or under 52.5 total points.',
    related: ['Edge', 'Model Total']
  },
  {
    term: 'Power Rating',
    category: 'Ratings',
    definition: 'A team\'s overall strength score combining offensive and defensive capabilities. Higher numbers indicate stronger teams.',
    example: 'A team with Power Rating 8.5 is stronger than a team with Power Rating 5.2.',
    related: ['Offense Rating', 'Defense Rating', 'Confidence']
  },
  {
    term: 'Offense Rating',
    category: 'Ratings',
    definition: 'A measure of a team\'s offensive strength, calculated from yards per play, success rate, EPA, and other offensive statistics.',
    example: 'Teams with high Offense Rating typically score more points and move the ball more effectively.',
    related: ['Power Rating', 'Defense Rating']
  },
  {
    term: 'Defense Rating',
    category: 'Ratings',
    definition: 'A measure of a team\'s defensive strength, calculated from yards allowed per play, success rate allowed, and other defensive statistics.',
    example: 'Teams with high Defense Rating typically allow fewer points and stop opponents more effectively.',
    related: ['Power Rating', 'Offense Rating']
  },
  {
    term: 'Confidence',
    category: 'Ratings',
    definition: 'A measure (0-1 scale) of how reliable a rating is, based on data quality and coverage. Higher confidence means more reliable predictions.',
    example: 'Confidence 0.85 means the rating is very reliable. Confidence 0.45 means limited data, use with caution.',
    related: ['Power Rating', 'Data Source']
  },
  {
    term: 'Confidence Tier',
    category: 'Betting Concepts',
    definition: 'A categorization system (A/B/C) based on edge size. Higher tiers represent stronger betting opportunities.',
    breakdown: {
      'A': 'Edge ≥ 4.0 points - Highest confidence, strongest opportunities',
      'B': 'Edge 3.0-3.9 points - Good opportunities with solid model advantage',
      'C': 'Edge 2.0-2.9 points - Lower confidence, use with caution'
    },
    related: ['Edge']
  },
  {
    term: 'Home Field Advantage (HFA)',
    category: 'Predictions',
    definition: 'The automatic point advantage given to the home team in spread calculations. Research shows home teams typically win by about 2 points more than expected.',
    example: 'If two teams have equal power ratings, the home team gets +2.0 points added to their spread prediction.',
    related: ['Model Spread', 'Power Rating']
  },
  {
    term: 'Data Source',
    category: 'Technical',
    definition: 'Indicates where the data used for ratings came from. Can be game-level stats, season-level stats, or baseline ratings.',
    options: {
      'game+season': 'High quality - Both game-level and season-level data available',
      'season_only': 'Medium quality - Only season-level aggregates available',
      'baseline': 'Low quality - Using default baseline ratings due to missing data'
    },
    related: ['Confidence', 'Power Rating']
  },
  {
    term: 'Pick (ATS)',
    category: 'Betting Concepts',
    definition: 'Our model\'s recommendation against the spread. Shows which team to bet based on comparing our spread prediction to the market.',
    example: 'Pick: Away Team +7 means we recommend betting the away team with 7 points.',
    related: ['Edge', 'Model Spread', 'Market Spread']
  },
  {
    term: 'Pick (Total)',
    category: 'Betting Concepts',
    definition: 'Our model\'s recommendation for the total (over/under). Based on comparing our total prediction to the market total.',
    example: 'Pick: Over 54.5 means our model predicts more points than the market line.',
    related: ['Edge', 'Model Total', 'Market Total']
  },
  {
    term: 'Max Edge',
    category: 'Betting Concepts',
    definition: 'The larger of spread edge or total edge (in points). This represents the strongest betting opportunity for a game.',
    example: 'If spread edge is 3.5 pts and total edge is 4.2 pts, Max Edge = 4.2 pts.',
    related: ['Edge', 'Spread Edge', 'Total Edge']
  },
];

export default function GlossaryPage() {
  const categories = Array.from(new Set(glossaryTerms.map(t => t.category))).sort();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Glossary</h1>
            <p className="text-lg text-gray-600">
              Definitions and explanations of terms used throughout Gridiron Edge
            </p>
          </div>

          {/* Quick Links */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg mb-8">
            <p className="text-sm text-blue-800 mb-2">
              <strong>New to Gridiron Edge?</strong> Start with our <Link href="/getting-started" className="underline font-medium">Getting Started guide</Link> for a comprehensive overview.
            </p>
          </div>

          {/* Search/Filter (could be enhanced later) */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search terms..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              id="glossary-search"
            />
          </div>

          {/* Terms by Category */}
          {categories.map(category => {
            const termsInCategory = glossaryTerms.filter(t => t.category === category);
            return (
              <section key={category} className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                  {category}
                </h2>
                <div className="space-y-6">
                  {termsInCategory.map((term, index) => (
                    <div key={index} className="bg-white p-6 rounded-lg shadow">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">{term.term}</h3>
                        {term.related && term.related.length > 0 && (
                          <div className="text-xs text-gray-500">
                            See also: {term.related.join(', ')}
                          </div>
                        )}
                      </div>
                      <p className="text-gray-700 mb-3">{term.definition}</p>
                      {term.example && (
                        <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-400 mb-3">
                          <p className="text-sm text-gray-700">
                            <strong>Example:</strong> {term.example}
                          </p>
                        </div>
                      )}
                      {term.breakdown && (
                        <div className="bg-gray-50 p-3 rounded mb-3">
                          <p className="text-sm font-medium text-gray-700 mb-2">Breakdown:</p>
                          <ul className="space-y-1 text-sm text-gray-600">
                            {Object.entries(term.breakdown).map(([key, value]) => (
                              <li key={key}><strong>{key}:</strong> {value}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {term.options && (
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-sm font-medium text-gray-700 mb-2">Options:</p>
                          <ul className="space-y-1 text-sm text-gray-600">
                            {Object.entries(term.options).map(([key, value]) => (
                              <li key={key}><strong>{key}:</strong> {value}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {/* Related Resources */}
          <section className="mt-12 pt-8 border-t border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Related Resources</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/getting-started" className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-gray-900 mb-1">Getting Started</h3>
                <p className="text-sm text-gray-600">Beginner-friendly guide with examples</p>
              </Link>
              <Link href="/docs/methodology" className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-gray-900 mb-1">Methodology</h3>
                <p className="text-sm text-gray-600">How our ratings model works</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}

