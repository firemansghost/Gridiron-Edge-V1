import Link from 'next/link';

export default function BettingPlaybookPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        2026 Betting Playbook – Hybrid V2, Conflict Tags, and Fade V4
      </h1>
      <p className="text-gray-600 mb-8 italic">
        Last updated: prepping for the 2026 season.
      </p>
      
      <div className="space-y-8">
        <section>
          <p className="text-gray-700 mb-4">
            This document defines how we actually <strong>use</strong> the Gridiron Edge models in 2026, not just how they're computed.
          </p>
          <p className="text-gray-700 mb-4">
            The core ideas:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li><strong>Hybrid V2</strong> is the <strong>only production spread model</strong>.</li>
            <li><strong>Conflict tags</strong> (<code className="bg-gray-100 px-1 rounded">hybrid_strong</code>, <code className="bg-gray-100 px-1 rounded">hybrid_weak</code>, <code className="bg-gray-100 px-1 rounded">hybrid_only</code>) tell us <strong>when to trust Hybrid more or less</strong>.</li>
            <li><strong>V4 / Fade V4</strong> remain <strong>Labs-only</strong>, but fading V4 has shown consistent positive ROI and helps define our "strong" vs "weak" buckets.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Models: Production vs Labs</h2>
          
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Production:</h3>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li><strong>Hybrid V2</strong> (<code className="bg-gray-100 px-1 rounded">strategyTag = 'hybrid_v2'</code>)
                <ul className="list-disc pl-6 mt-1">
                  <li>This is the model used for <strong>My Picks</strong> and live recommendation logic.</li>
                </ul>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Labs / Experimental:</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li><strong>V4 (Labs)</strong> (<code className="bg-gray-100 px-1 rounded">strategyTag = 'v4_labs'</code>)
                <ul className="list-disc pl-6 mt-1">
                  <li>SP+/FEI-inspired drive-based spread model.</li>
                  <li>Standalone performance has been <strong>unprofitable</strong> in backtests.</li>
                </ul>
              </li>
              <li><strong>Fade V4 (Labs)</strong> (<code className="bg-gray-100 px-1 rounded">strategyTag = 'fade_v4_labs'</code>)
                <ul className="list-disc pl-6 mt-1">
                  <li>Takes the opposite side of every V4 bet.</li>
                  <li>Has shown <strong>positive ROI</strong> in both 2024 and 2025.</li>
                  <li>Still treated as <strong>experimental</strong>, not production.</li>
                </ul>
              </li>
            </ul>
          </div>
          <p className="text-gray-700 mt-4">
            All non-Hybrid strategies are informational overlays and <strong>do not</strong> drive My Picks directly.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Key Concepts</h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Edge</h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><code className="bg-gray-100 px-1 rounded">edge</code> = model spread vs closing line (HMA format).</li>
                <li>We use <code className="bg-gray-100 px-1 rounded">|edge|</code> (absolute value) to group bets into tiers.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">CLV (Closing Line Value)</h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>How much the market moved in our favor between open and close.</li>
                <li>Positive CLV = market agrees with us.</li>
                <li>Strong Super Tier A performance comes with <strong>strongly positive CLV</strong>.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Conflict Types (<code className="bg-gray-100 px-1 rounded">hybridConflictType</code>)</h3>
              <p className="text-gray-700 mb-2">
                Stored on every Bet row as <code className="bg-gray-100 px-1 rounded">hybrid_conflict_type</code>:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><code className="bg-gray-100 px-1 rounded">hybrid_strong</code></li>
                <li><code className="bg-gray-100 px-1 rounded">hybrid_weak</code></li>
                <li><code className="bg-gray-100 px-1 rounded">hybrid_only</code></li>
              </ul>
              <p className="text-gray-700 mt-2">
                These are <strong>diagnostic labels</strong> computed using 2025 behavior of:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>Hybrid results</li>
                <li>Fade V4 results</li>
                <li>CLV behavior</li>
              </ul>
              <p className="text-gray-700 mt-2">
                Rough intuition:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong><code className="bg-gray-100 px-1 rounded">hybrid_strong</code></strong>
                  <br />Games where Hybrid's signal has historically converted to <strong>high ROI with supportive CLV</strong>, and Fade V4 behavior is consistent with that strength.</li>
                <li><strong><code className="bg-gray-100 px-1 rounded">hybrid_weak</code></strong>
                  <br />Games where Hybrid's edges look big on paper, but ROI and/or CLV have been <strong>much weaker or flat</strong>.</li>
                <li><strong><code className="bg-gray-100 px-1 rounded">hybrid_only</code></strong>
                  <br />Games where only Hybrid has a bet (rare in 2025).</li>
              </ul>
              <p className="text-gray-700 mt-2 text-sm italic">
                Exact formulas live in <code className="bg-gray-100 px-1 rounded">sync-hybrid-conflict-tags.ts</code>. This doc is about <strong>how to use</strong> the labels.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. 2025 Snapshot – Why Super Tier A Exists</h2>
          <p className="text-gray-700 mb-4">
            Using 2025 Hybrid V2 spread bets:
          </p>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">3.1 Super Tier Candidate</h3>
              <p className="text-gray-700 mb-2">Filter:</p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
                <li><code className="bg-gray-100 px-1 rounded">strategyTag = 'hybrid_v2'</code></li>
                <li><code className="bg-gray-100 px-1 rounded">hybridConflictType = 'hybrid_strong'</code></li>
                <li><code className="bg-gray-100 px-1 rounded">|edge| &gt;= 4.0</code></li>
              </ul>
              <p className="text-gray-700 mb-2">Results (2025):</p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>274 bets</strong></li>
                <li><strong>Record:</strong> 215–58–1 (78.8% win rate)</li>
                <li><strong>ROI:</strong> <strong>+50.16%</strong></li>
                <li><strong>Avg edge:</strong> 18.49</li>
                <li><strong>Avg CLV:</strong> +15.96</li>
              </ul>
              <p className="text-gray-700 mt-2">
                This is the basis for the <strong>Super Tier A</strong> concept.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">3.2 Hybrid Strong vs Hybrid Weak (All Edges)</h3>
              <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
                <p className="font-semibold text-gray-900 mb-2">Hybrid Strong (all edge sizes):</p>
                <ul className="list-disc pl-6 space-y-1 text-gray-700">
                  <li>357 bets</li>
                  <li>73.2% win rate</li>
                  <li>+39.34% ROI</li>
                  <li>Positive CLV</li>
                </ul>
              </div>
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
                <p className="font-semibold text-gray-900 mb-2">Hybrid Weak (all edge sizes):</p>
                <ul className="list-disc pl-6 space-y-1 text-gray-700">
                  <li>351 bets</li>
                  <li>52.8% win rate</li>
                  <li>+0.69% ROI</li>
                  <li>Slightly negative CLV</li>
                </ul>
              </div>
              <p className="text-gray-700">
                Conclusion:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Hybrid Strong</strong> is where the model is genuinely sharp.</li>
                <li><strong>Hybrid Weak</strong> is essentially a breakeven bucket.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">3.3 V4 and Fade V4</h3>
              <p className="text-gray-700 mb-2">Across 2024–2025:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>V4 (Labs) standalone:</strong>
                  <ul className="list-disc pl-6 mt-1">
                    <li>Unprofitable in both seasons (negative ROI, sub-40% win rate).</li>
                  </ul>
                </li>
                <li><strong>Fade V4 (Labs):</strong>
                  <ul className="list-disc pl-6 mt-1">
                    <li>2024: ~10% ROI</li>
                    <li>2025: ~18% ROI</li>
                  </ul>
                </li>
              </ul>
              <p className="text-gray-700 mt-2">
                Fade V4's profitability helps separate <strong>strong vs weak Hybrid games</strong>, but V4 itself remains experimental and is <strong>not</strong> used as a standalone strategy.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. 2026 Tiering Rules</h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">4.1 Tier Definitions (Hybrid V2)</h3>
              <p className="text-gray-700 mb-2">We tier Hybrid V2 bets by <strong>absolute edge</strong>:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Tier C:</strong> <code className="bg-gray-100 px-1 rounded">|edge| &lt; 2.0</code>
                  <ul className="list-disc pl-6 mt-1">
                    <li>Default: <strong>ignore</strong>. Info only.</li>
                  </ul>
                </li>
                <li><strong>Tier B:</strong> <code className="bg-gray-100 px-1 rounded">2.0 ≤ |edge| &lt; 3.0</code>
                  <ul className="list-disc pl-6 mt-1">
                    <li>"Leans / action plays".</li>
                    <li>Requires other confirmation (e.g., Barnes, Crick, matchup notes).</li>
                  </ul>
                </li>
                <li><strong>Tier A:</strong> <code className="bg-gray-100 px-1 rounded">3.0 ≤ |edge| &lt; 4.0</code>
                  <ul className="list-disc pl-6 mt-1">
                    <li>Serious plays.</li>
                  </ul>
                </li>
                <li><strong>Super Tier A:</strong> <code className="bg-gray-100 px-1 rounded">|edge| ≥ 4.0</code> <strong>AND</strong> <code className="bg-gray-100 px-1 rounded">hybridConflictType = 'hybrid_strong'</code>
                  <ul className="list-disc pl-6 mt-1">
                    <li>Top-shelf, hammer-worthy bucket.</li>
                    <li>Origin: 2025 backtest (78.8% win rate, +50.16% ROI).</li>
                  </ul>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">4.2 Conflict Type Usage</h3>
              <p className="text-gray-700 mb-2">For <strong>Hybrid V2</strong> bets:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong><code className="bg-gray-100 px-1 rounded">hybrid_strong</code></strong>
                  <ul className="list-disc pl-6 mt-1">
                    <li>Forms the backbone of 2026 ATS strategy.</li>
                    <li>Used for:
                      <ul className="list-disc pl-6 mt-1">
                        <li><strong>Super Tier A</strong>: <code className="bg-gray-100 px-1 rounded">|edge| ≥ 4.0</code></li>
                        <li><strong>Tier A (Strong)</strong>: <code className="bg-gray-100 px-1 rounded">3.0 ≤ |edge| &lt; 4.0</code></li>
                        <li><strong>Tier B (Strong)</strong>: <code className="bg-gray-100 px-1 rounded">2.0 ≤ |edge| &lt; 3.0</code> (optional, needs external confirmation)</li>
                      </ul>
                    </li>
                  </ul>
                </li>
                <li><strong><code className="bg-gray-100 px-1 rounded">hybrid_weak</code></strong>
                  <ul className="list-disc pl-6 mt-1">
                    <li>Not auto-bet in 2026, regardless of edge size.</li>
                    <li>May be used as "consider only with strong external confirmation".</li>
                  </ul>
                </li>
                <li><strong><code className="bg-gray-100 px-1 rounded">hybrid_only</code></strong>
                  <ul className="list-disc pl-6 mt-1">
                    <li>Rare; treat case-by-case.</li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Fade V4 in 2026</h2>
          <p className="text-gray-700 mb-2">
            Fade V4 remains <strong>Labs-only</strong>, but:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
            <li>Has shown consistent positive ROI as a standalone backtest.</li>
            <li>Performs best in <strong>Hybrid Strong</strong> games.</li>
            <li>Underperforms in <strong>Hybrid Weak</strong> games.</li>
          </ul>
          <p className="text-gray-700 mb-2"><strong>Usage guideline:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>Only use Fade V4 as <strong>confirmation</strong> or <strong>secondary Labs overlay</strong> in games tagged <code className="bg-gray-100 px-1 rounded">hybrid_strong</code>.</li>
            <li>Ignore V4/Fade V4 in <code className="bg-gray-100 px-1 rounded">hybrid_weak</code> games.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. My Picks UI Semantics</h2>
          <p className="text-gray-700 mb-2">
            To make the 2026 playbook usable from the couch:
          </p>
          <p className="text-gray-700 mb-2">
            For each Hybrid V2 pick shown on <strong>My Picks</strong>:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
            <li>Show a <strong>Conflict badge</strong>:
              <ul className="list-disc pl-6 mt-1">
                <li><code className="bg-gray-100 px-1 rounded">Strong</code>, <code className="bg-gray-100 px-1 rounded">Weak</code>, or <code className="bg-gray-100 px-1 rounded">Only</code></li>
                <li>Color-coded (e.g., green / yellow / neutral)</li>
              </ul>
            </li>
            <li>Show a <strong>Tier label</strong> based on <code className="bg-gray-100 px-1 rounded">|edge|</code>:
              <ul className="list-disc pl-6 mt-1">
                <li><code className="bg-gray-100 px-1 rounded">Super Tier A</code> (Strong + <code className="bg-gray-100 px-1 rounded">|edge| ≥ 4.0</code>)</li>
                <li><code className="bg-gray-100 px-1 rounded">Tier A (Strong)</code> (<code className="bg-gray-100 px-1 rounded">3.0–3.99</code>, Strong)</li>
                <li><code className="bg-gray-100 px-1 rounded">Tier B (Strong)</code> (<code className="bg-gray-100 px-1 rounded">2.0–2.99</code>, Strong)</li>
                <li>No label for weaker edges</li>
              </ul>
            </li>
            <li>Provide UI filters:
              <ul className="list-disc pl-6 mt-1">
                <li>"Show only <strong>Super Tier A</strong>"</li>
                <li>"Show only <strong>Hybrid Strong</strong>"</li>
              </ul>
            </li>
          </ul>
          <p className="text-gray-700">
            This keeps the <strong>highest-value plays</strong> front and center without hiding the rest of the model output.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Operational Notes</h2>
          <p className="text-gray-700 mb-2">
            To keep this playbook valid during the season:
          </p>
          <ol className="list-decimal pl-6 space-y-2 text-gray-700">
            <li><strong>Normal workflows</strong> (nightly ingest, grading, etc.) must stay green.</li>
            <li><strong>Conflict tags</strong> must be kept up to date:
              <ul className="list-disc pl-6 mt-1">
                <li>Run <code className="bg-gray-100 px-1 rounded">sync-hybrid-conflict-tags.ts</code> after grading for each week/season as needed.</li>
              </ul>
            </li>
            <li>Fade V4 remains <strong>Labs-only</strong>:
              <ul className="list-disc pl-6 mt-1">
                <li>May be exposed in Labs screens and export tools.</li>
                <li>Not used to drive My Picks directly.</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Continuity Guardrails (Labs Only – Based on 2025 Backtest)</h2>
          <p className="text-gray-700 mb-4">
            Continuity Score is a 0–100 roster stability metric built from CFBD returning production + portal churn. High = stable/veteran, Low = chaos/new pieces. It is not in the production Hybrid V2 model yet, but we use it as a tactical overlay.
          </p>
          <p className="text-gray-700 mb-2 font-medium">What 2025 showed:</p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
            <li>Hybrid V2 was profitable across all continuity bands (Low/Mid/High).</li>
            <li>The big pattern was <strong>favorites vs dogs</strong>, not "high good, low bad."</li>
            <li><strong>Low-continuity dogs were consistently terrible.</strong></li>
            <li><strong>Low-, mid-, and high-continuity favorites all crushed.</strong></li>
          </ul>
          <p className="text-gray-700 mb-2 font-medium">Soft rules for 2026 (subject to further testing):</p>
          <ol className="list-decimal pl-6 space-y-2 text-gray-700 mb-4">
            <li><strong>Low-continuity dogs (&lt;0.60): yellow flag.</strong>
              <ul className="list-disc pl-6 mt-1">
                <li>Avoid unless the game is Super Tier A and other context supports it.</li>
                <li>These profiles were -14% to -21% ROI in 2025 backtests.</li>
              </ul>
            </li>
            <li><strong>Favor favorites.</strong>
              <ul className="list-disc pl-6 mt-1">
                <li>Favorites performed extremely well across all bands, especially low-continuity favorites (~+50–60% ROI).</li>
                <li>Continuity should not scare us off a strong favorite if Hybrid likes the number.</li>
              </ul>
            </li>
            <li><strong>Be picky on 14+ point spreads with mid/high continuity.</strong>
              <ul className="list-disc pl-6 mt-1">
                <li>These were roughly breakeven in 2025.</li>
                <li>Treat them as lower priority or require stronger edge / conflict alignment.</li>
              </ul>
            </li>
          </ol>
          <p className="text-gray-700 mb-4">
            These are <strong>guardrails, not hard filters</strong>. They inform human review of the card and Labs experiments (e.g., re-running 2025 portfolios with low-continuity dogs removed). Any hard-coded model changes belong in a future Hybrid V5 cycle.
          </p>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">8.1 2025 Portfolio Experiment: Dropping Low-Continuity Dogs</h3>
            <p className="text-gray-700 mb-2">
              We simulated the 2025 official card (<code className="bg-gray-100 px-1 rounded">official_flat_100</code>) with and without low-continuity dogs:
            </p>
            <div className="space-y-2 text-sm text-gray-700 mb-3">
              <p><strong>Baseline (all bets):</strong> 937 bets, 59.5% win rate, +13.53% ROI, +$12,676.80 PnL</p>
              <p><strong>Removed subset (low-continuity dogs only):</strong> 316 bets, 40.8% win rate, <strong className="text-red-600">-22.04% ROI</strong>, -$6,964.80 PnL</p>
              <p><strong>Filtered card (dropping low-continuity dogs):</strong> 621 bets, 69.2% win rate, <strong className="text-green-600">+31.63% ROI</strong>, +$19,641.60 PnL</p>
            </div>
            <p className="text-gray-700 mb-2">
              <strong>Impact:</strong> Removing 316 low-continuity dog bets would have improved PnL by <strong>+$6,964.80</strong> and ROI by <strong>+18.10 percentage points</strong> (from +13.53% to +31.63%).
            </p>
            <p className="text-gray-700 text-sm">
              This is <strong>Labs-only evidence</strong> and not yet a hard rule, but it strongly supports the guardrail: low-continuity dogs were a significant drag on the 2025 official card. The experiment suggests that avoiding these bets in 2026 card construction could meaningfully improve performance.
            </p>
          </div>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">8.2 Hybrid V2 Portfolio Experiment: Dropping Low-Continuity Dogs (Labs)</h3>
            <p className="text-gray-700 mb-2">
              We simulated the 2025 Hybrid V2 portfolio (<code className="bg-gray-100 px-1 rounded">hybrid_v2</code>) with and without low-continuity dogs:
            </p>
            <div className="space-y-2 text-sm text-gray-700 mb-3">
              <p><strong>Baseline (all bets):</strong> 710 bets, 63.2% win rate, +20.38% ROI, +$14,468.70 PnL</p>
              <p><strong>Removed subset (low-continuity dogs only):</strong> 239 bets, 44.7% win rate, <strong className="text-red-600">-14.50% ROI</strong>, -$3,464.60 PnL</p>
              <p><strong>Filtered portfolio (dropping low-continuity dogs):</strong> 471 bets, 72.6% win rate, <strong className="text-green-600">+38.07% ROI</strong>, +$17,933.30 PnL</p>
            </div>
            <p className="text-gray-700 mb-2">
              <strong>Impact:</strong> Removing 239 low-continuity dog bets would have improved PnL by <strong>+$3,464.60</strong> and ROI by <strong>+17.70 percentage points</strong> (from +20.38% to +38.07%).
            </p>
            <p className="text-gray-700 mb-2 text-sm">
              <strong>Observations:</strong> The pattern matches the official card: low-continuity dogs were a significant drag on Hybrid V2 performance. Hybrid V2's baseline ROI (+20.38%) was already strong, but filtering low-continuity dogs would have pushed it to <strong>+38.07% ROI</strong>. The filtered portfolio would have achieved a <strong>72.6% win rate</strong> (vs 63.2% baseline).
            </p>
            <p className="text-gray-700 text-sm">
              This is <strong>Labs-only evidence</strong> and not yet a hard production rule, but it strongly supports the guardrail for both the official card and Hybrid V2 strategies. Avoiding low-continuity dogs in 2026 could meaningfully improve performance across both portfolios.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. 2026 Guardrail Policy – Low-Continuity Dogs</h2>
          <p className="text-gray-700 mb-4">
            The official card treats "Low-Continuity Dog" as a <strong>hard guardrail by default</strong>.
          </p>
          
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Definition</h3>
            <p className="text-gray-700 mb-2">
              A <strong>Low-Continuity Dog</strong> is a spread bet where:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-2">
              <li>The bet team's <code className="bg-gray-100 px-1 rounded">continuityScore &lt; 0.60</code> (Low continuity band)</li>
              <li>AND the bet team is a dog (getting points, based on closing spread)</li>
            </ul>
          </div>

          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Historical Evidence</h3>
            <p className="text-gray-700 mb-2">
              These plays have been a large negative ROI segment in both 2024 and 2025 simulations:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-2">
              <li><strong>2025 Official Card</strong>: 316 low-continuity dogs had <strong className="text-red-600">-22.04% ROI</strong> (vs +13.53% baseline)</li>
              <li><strong>2025 Hybrid V2</strong>: 239 low-continuity dogs had <strong className="text-red-600">-14.50% ROI</strong> (vs +20.38% baseline)</li>
            </ul>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Policy for 2026</h3>
            <p className="text-gray-700 mb-2">
              <strong>Default behavior:</strong>
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
              <li>The official card <strong>auto-excludes</strong> low-continuity dogs by default.</li>
              <li>This is a <strong>risk management rule</strong>, not a model feature.</li>
              <li>The model (Hybrid V2) can still like these games; the guardrail is on portfolio construction, not on the rating engine.</li>
            </ul>
            <p className="text-gray-700 mb-2">
              <strong>Manual override process:</strong>
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
              <li>If a low-continuity dog is included in the official card:
                <ul className="list-disc pl-6 mt-1 space-y-1">
                  <li>It must be <strong>manually whitelisted</strong> with a written handicap (injuries, matchup context, etc.).</li>
                  <li>It should be treated as a <strong>Labs-only</strong> or <strong>reduced-size</strong> play.</li>
                  <li>The rationale should be documented for review.</li>
                </ul>
              </li>
            </ul>
            <p className="text-gray-700 mb-2 text-sm">
              <strong>Implementation:</strong> Low-continuity dogs are flagged with a red "Low-Continuity Dog" pill on the <Link href="/picks" className="text-blue-600 hover:text-blue-700 underline">/picks</Link> page. The Portfolio What-Ifs panel (<Link href="/labs/portfolio" className="text-blue-600 hover:text-blue-700 underline">/labs/portfolio</Link>) shows the impact of dropping these bets. This guardrail applies to the <strong>official card</strong> (<code className="bg-gray-100 px-1 rounded">official_flat_100</code>); Labs strategies may experiment with different filters.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Future Model Enhancements (V5+)</h2>
          <p className="text-gray-700 mb-4">
            We're planning to add Portal & NIL Meta Indices as Labs overlays, with potential integration into a future V5 Hybrid model:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
            <li><strong>Continuity Score</strong>: Measures roster stability (returning production + transfer portal activity)</li>
            <li><strong>Positional Shock Index</strong>: Flags teams with extreme turnover at key positions (QB, OL, DL)</li>
            <li><strong>Mercenary Index</strong>: Identifies teams heavily reliant on short-term transfers</li>
            <li><strong>Portal Aggressor Flag</strong>: Flags teams that aggressively use the transfer portal (net talent gain)</li>
          </ul>
          <p className="text-gray-700 mb-2">
            These will initially live as <strong>Labs overlays</strong> to test their predictive value. If they prove stable and additive in backtests, they may be folded into the core Hybrid model in a future V5 release.
          </p>
          <p className="text-gray-700 text-sm">
            See <Link href="/docs/data-inventory" className="text-blue-600 hover:text-blue-700 underline">Data Inventory</Link> for current data structures, and <Link href="/docs/bowl-postseason-ops" className="text-blue-600 hover:text-blue-700 underline">Bowl & Postseason Ops</Link> for the operations side.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Disclaimer</h2>
          <p className="text-gray-700 mb-2">
            All numbers above are based on historical backtests (2024–2025).
          </p>
          <p className="text-gray-700 mb-2">
            Performance can and will regress. The rules here are designed to:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>Lean into the <strong>strongest, most stable buckets</strong> we've observed so far.</li>
            <li>Avoid overreacting to noisy or weak buckets.</li>
            <li>Keep the UI honest about what is "hammer-worthy" vs "just interesting."</li>
          </ul>
        </section>
      </div>
    </>
  );
}


