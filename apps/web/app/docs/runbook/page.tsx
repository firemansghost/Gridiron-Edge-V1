import { CodeWithCopy } from '@/components/CodeWithCopy';

export default function RunbookPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Post-Run Expectations (CFBD → Odds API, Week N)
      </h1>
      
      <div className="text-sm text-gray-600 mb-6">
        Source: docs/runbook.md
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            ✅ What should exist in the DB (example: 2025, week 8)
          </h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Sources present:</strong> <code className="bg-gray-100 px-1 rounded">oddsapi</code> for <code className="bg-gray-100 px-1 rounded">spread</code>, <code className="bg-gray-100 px-1 rounded">total</code>, <code className="bg-gray-100 px-1 rounded">moneyline</code>.</li>
            <li><strong>Counts (order of magnitude):</strong><br />
              Expect <strong>~2.6k rows per type</strong> (spread/total/moneyline) for a full FBS slate with ~10–12 books. Exact numbers vary by book coverage and timing.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Quick checks (paste into Supabase SQL):
          </h3>
          <CodeWithCopy 
            code={`-- 1) Per-type counts by source
select season, week, line_type, source, count(*) as rows
from market_lines
where season = 2025 and week = 8
group by 1,2,3,4
order by 1,2,3,4;

-- 2) Totals by line type
select
  count(*) filter (where line_type = 'moneyline') as ml_rows,
  count(*) filter (where line_type = 'spread')    as spread_rows,
  count(*) filter (where line_type = 'total')     as total_rows
from market_lines
where season = 2025 and week = 8;

-- 3) Recent sample rows (closing_line fallback to line_value)
select
  game_id, season, week, line_type,
  coalesce(closing_line, line_value) as line_val,
  book_name, source, "timestamp"
from market_lines
where season = 2025 and week = 8
order by "timestamp" desc
limit 30;

-- 4) Moneylines look like American odds (-175 / +150)
select
  game_id, coalesce(closing_line, line_value) as moneyline_price,
  book_name, source, "timestamp"
from market_lines
where season = 2025 and week = 8
  and line_type = 'moneyline'
order by "timestamp" desc
limit 30;

-- 5) Book coverage by type
select line_type, source, book_name, count(*) as rows
from market_lines
where season = 2025 and week = 8
group by 1,2,3
order by 1,2,3;`}
            language="sql"
          />
        </section>

        <section>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Healthy example signatures:
          </h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>Per-type rows: spread≈2679, total≈2696, moneyline≈2640 (source=oddsapi)</li>
            <li>Books represented: DK, FD, Caesars, BetMGM, Bovada, BetOnline.ag, BetRivers, Fanatics, LowVig.ag, MyBookie.ag, BetUS, etc.</li>
            <li>Sample row values show sensible numbers (e.g., spreads -17.5, totals 53, moneylines -1000) with recent timestamps.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            What the UI should show
          </h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                <strong>Home & Weeks tables</strong>
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Market Close columns for Spread and Total populated.</li>
                <li>ML column populated for many games.</li>
                <li>Source badges like (ODDSAPI) next to numbers; hovering ML shows implied probability and a tooltip with timestamp.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                <strong>Game Detail page</strong>
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Moneyline card appears when ML exists (Price, Implied Prob %, Source badge).</li>
                <li>If no ML exists, the ML column shows an em dash and the Moneyline card is hidden.</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            What workflows/logs should show
          </h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                <strong>Odds Poll (3× daily) and Nightly Ingest:</strong>
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>CFBD step: "Parsed ~295 games for week N (FBS filtered)"</li>
                <li>Odds step: "Found ~50–60 events" per fetch and parsed counts for spreads/totals/moneylines.</li>
                <li>Chunked upserts logs like: ✅ Upserted XXX market lines in chunks of 500 and [DEDUP] Removed 0 duplicate lines…</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                <strong>One-Week Odds Test:</strong> same as above but only the requested week.
              </h3>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            If results look off
          </h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Zero rows:</strong> confirm filters (season, week) and that odds were polled for that week.</li>
            <li><strong>No ML:</strong> rerun odds poll; some books delay ML. Verify with query #4.</li>
            <li><strong>Badges missing:</strong> ensure API responses include marketMeta.*.source; rebuild web if you just pulled changes.</li>
            <li><strong>Timeouts:</strong> workflows should target a single week; chunked upserts are already enabled.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Sanity math (why ~2.6k rows/type?)
          </h2>
          <p>~295 FBS games × ~9–11 books × 1 row per game/book/type → ~2,600–3,200 rows per type.</p>
        </section>
      </div>
    </>
  );
}
