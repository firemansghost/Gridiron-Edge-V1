/**
 * CFBD /stats/game/advanced concurrency containment.
 * Static/regression only — no provider calls, no DB writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CFBD_PROCESS_MAX_CONCURRENCY } from '../src/cfbd/cfbd-client';
import { fetchCfbdAdvancedGameStatsWeek } from '../src/stats/cfbd-team-game-stats-2026';

const ROOT = path.resolve(__dirname, '../../..');
const ADVANCED_WORKFLOWS = [
  'cfbd-team-game-stats-2026-manual.yml',
  'cfbd-feature-ingest.yml',
  'stats-cfbd.yml',
  'stats-advanced-cfbd.yml',
] as const;

const CONCURRENCY_GROUP = 'cfbd-stats-game-advanced';

function workflowSrc(file: string): string {
  return fs.readFileSync(path.join(ROOT, '.github/workflows', file), 'utf8');
}

function concurrencyBlock(src: string): string {
  const idx = src.search(/^\s*concurrency:\s*$/m);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\njobs:/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('CFBD /stats/game/advanced concurrency containment', () => {
  it('all four advanced-game-stat workflows share group cfbd-stats-game-advanced', () => {
    for (const file of ADVANCED_WORKFLOWS) {
      const src = workflowSrc(file);
      const block = concurrencyBlock(src);
      expect(block).toContain(`group: ${CONCURRENCY_GROUP}`);
      expect(src.match(/group:\s*cfbd-stats-game-advanced/g)?.length).toBe(1);
    }
  });

  it('cancel-in-progress is false on all four workflows', () => {
    for (const file of ADVANCED_WORKFLOWS) {
      const block = concurrencyBlock(workflowSrc(file));
      expect(block).toMatch(/cancel-in-progress:\s*false/);
      expect(block).not.toMatch(/cancel-in-progress:\s*true/);
    }
  });

  it('stats-advanced-cfbd.yml is legacy manual-only and has no schedule trigger', () => {
    const src = workflowSrc('stats-advanced-cfbd.yml');
    expect(src).toMatch(/LEGACY \/ MANUAL-USE ONLY/i);
    expect(src).toMatch(/^\s*workflow_dispatch:\s*$/m);
    expect(src).not.toMatch(/^\s*schedule:\s*$/m);
    expect(src).not.toMatch(/^\s*-\s*cron:/m);
    expect(src).not.toMatch(/cron:\s*'0 3 \* \* \*'/);
  });

  it('cfbd-feature-ingest max concurrency cannot exceed 2 and fails closed on invalid values', () => {
    const src = workflowSrc('cfbd-feature-ingest.yml');
    expect(src).toMatch(/type:\s*choice/);
    expect(src).toMatch(/-\s*'1'/);
    expect(src).toMatch(/-\s*'2'/);
    expect(src).not.toMatch(/-\s*'3'/);
    expect(src).not.toMatch(/-\s*'4'/);
    expect(src).toMatch(/default:\s*'2'/);
    expect(src).toContain("max_concurrency must be 1 or 2");
    expect(src).toContain('exit 1');
    expect(src).toContain('do not clamp');
    expect(src).not.toMatch(/1-4/);
    expect(src).not.toMatch(/MAX_NUM=\$\{MAX:-2\}/);
    const maxParallel = src.match(
      /max-parallel:\s*\$\{\{\s*fromJson\(needs\.prepare-matrix\.outputs\.max_parallel\)\s*\}\}/
    );
    expect(maxParallel).toBeTruthy();
  });

  it('CFBDClient process maxConcurrency is 2', () => {
    expect(CFBD_PROCESS_MAX_CONCURRENCY).toBe(2);
    const clientSrc = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/src/cfbd/cfbd-client.ts'),
      'utf8'
    );
    expect(clientSrc).toContain('export const CFBD_PROCESS_MAX_CONCURRENCY = 2');
    expect(clientSrc).toContain(
      'maxConcurrency: CFBD_PROCESS_MAX_CONCURRENCY'
    );
    expect(clientSrc).not.toMatch(/maxConcurrency:\s*5/);
  });

  it('guarded TeamGameStat writer still makes one provider request and 429 fail-closes without retry', async () => {
    const writerSrc = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/src/stats/cfbd-team-game-stats-2026.ts'),
      'utf8'
    );
    expect(writerSrc).toContain('providerCalls: 1');
    expect(writerSrc).toContain('/stats/game/advanced');
    expect(writerSrc).not.toMatch(/retries\s*=\s*[1-9]/);
    expect(writerSrc).not.toMatch(/while\s*\(\s*retries/);

    let successCalls = 0;
    const success = await fetchCfbdAdvancedGameStatsWeek({
      season: 2026,
      week: 1,
      apiKey: 'test-key',
      fetchImpl: (async (url: RequestInfo | URL) => {
        successCalls += 1;
        expect(String(url)).toContain('/stats/game/advanced');
        return {
          ok: true,
          status: 200,
          json: async () => [],
        } as unknown as Response;
      }) as typeof fetch,
    });
    expect(successCalls).toBe(1);
    expect(success.providerCalls).toBe(1);

    let failCalls = 0;
    await expect(
      fetchCfbdAdvancedGameStatsWeek({
        season: 2026,
        week: 1,
        apiKey: 'test-key',
        fetchImpl: (async () => {
          failCalls += 1;
          return {
            ok: false,
            status: 429,
            json: async () => ({}),
          } as unknown as Response;
        }) as typeof fetch,
      })
    ).rejects.toThrow(/HTTP 429/);
    expect(failCalls).toBe(1);
  });
});
