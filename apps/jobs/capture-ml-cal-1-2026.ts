/**
 * CLI — ML-CAL-1 Capture V1 (artifact-only, read-only).
 *
 * Writes local JSON capture artifacts only. No COMMIT mode, no provider calls,
 * no Bet/ratings/market writes, no score/outcome reads, no study evaluation.
 *
 * Fixture route (offline / CI):
 *   npx tsx apps/jobs/capture-ml-cal-1-2026.ts --season 2026 --week 7 --fixture path/to/fixture.json
 *
 * Live DB route (manual, later reviewed — NOT authorized by this PR alone):
 *   requires an explicit reviewed study-window registration before use.
 *   Uses server clock; injectable time only via fixture.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ML_CAL_1_CAPTURE_PRODUCER_VERSION,
  ML_CAL_1_LIVE_ODDS_SOURCE,
  ML_CAL_1_MODEL_VERSION,
  ML_CAL_1_SUPPORTED_SEASON,
  createInstrumentedReadClient,
  hashFileUtf8,
  parseMlCal1CliArgs,
  planMlCal1Capture,
  writeBlockedReasonReceipt,
  writeCaptureArtifactsAtomic,
  type MlCal1FixtureInput,
  type MlCal1LifecycleReceipt,
  type MlCal1MarketLineCandidate,
  type MlCal1RawRatingRow,
} from './lib/ml-cal-1-capture';

function readRepoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

function resolveDependencyHashes(repoRoot: string): Record<string, string> {
  const rels = [
    'apps/web/lib/core-v1-moneyline.ts',
    'apps/web/lib/core-v1-spread.ts',
    'apps/web/lib/core-v1-weekly-card.ts',
    'apps/web/lib/market-line-snapshot.ts',
    'apps/web/lib/market-line-helpers.ts',
    'apps/web/lib/data/core_v1_hfa_config.json',
    'apps/jobs/lib/ml-cal-1-capture.ts',
  ];
  const out: Record<string, string> = {};
  for (const rel of rels) {
    out[rel] = hashFileUtf8(path.join(repoRoot, rel));
  }
  return out;
}

function defaultOutRoot(): string {
  return path.join(process.cwd(), 'reports', 'ml-cal-1-captures');
}

async function loadLiveSnapshot(options: {
  season: number;
  week: number;
  lifecycleReceipt: MlCal1LifecycleReceipt | null;
  repositorySha: string;
  captureId: string;
  now: () => Date;
}): Promise<MlCal1FixtureInput> {
  const captureStartTime = options.now();
  const prisma = new PrismaClient();

  try {
    const snapshot = await prisma.$transaction(
      async (tx) => {
        // Enforce read-only for the snapshot window.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;

        const instrumented = createInstrumentedReadClient({
          allowedSeason: options.season,
          delegate: {
            game: tx.game,
            teamMembership: tx.teamMembership,
            teamSeasonRating: tx.teamSeasonRating,
            marketLine: tx.marketLine,
          },
        });

        const games = (await instrumented.game.findMany({
          where: { season: options.season, week: options.week },
          select: {
            id: true,
            season: true,
            week: true,
            homeTeamId: true,
            awayTeamId: true,
            date: true,
            neutralSite: true,
            status: true,
            homeTeam: { select: { id: true, name: true } },
            awayTeam: { select: { id: true, name: true } },
          },
          orderBy: { date: 'asc' },
        })) as Array<{
          id: string;
          season: number;
          week: number;
          homeTeamId: string;
          awayTeamId: string;
          date: Date;
          neutralSite: boolean;
          status: string;
          homeTeam: { id: string; name: string };
          awayTeam: { id: string; name: string };
        }>;

        const memberships = (await instrumented.teamMembership.findMany({
          where: { season: options.season, level: 'fbs' },
          select: { teamId: true, level: true, season: true },
        })) as Array<{ teamId: string }>;

        const ratings = (await instrumented.teamSeasonRating.findMany({
          where: {
            season: options.season,
            modelVersion: ML_CAL_1_MODEL_VERSION,
          },
          select: {
            season: true,
            teamId: true,
            modelVersion: true,
            powerRating: true,
            rating: true,
            games: true,
            dataSource: true,
            createdAt: true,
            updatedAt: true,
          },
        })) as MlCal1RawRatingRow[];

        const gameIds = games.map((g) => g.id);
        const marketLines =
          gameIds.length === 0
            ? []
            : ((await instrumented.marketLine.findMany({
                where: {
                  gameId: { in: gameIds },
                  source: ML_CAL_1_LIVE_ODDS_SOURCE,
                  lineType: { in: ['moneyline', 'spread'] },
                },
                select: {
                  id: true,
                  gameId: true,
                  lineType: true,
                  lineValue: true,
                  bookName: true,
                  timestamp: true,
                  createdAt: true,
                  updatedAt: true,
                  teamId: true,
                  source: true,
                  season: true,
                  week: true,
                },
              })) as MlCal1MarketLineCandidate[]);

        if (instrumented.mutations.length > 0) {
          throw new Error(
            `unexpected_mutations:${instrumented.mutations.join(',')}`
          );
        }

        return {
          games,
          fbsTeamIds: memberships.map((m) => m.teamId),
          ratings,
          marketLines,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 60_000,
      }
    );

    const captureEndTime = options.now();

    return {
      captureId: options.captureId,
      season: options.season,
      week: options.week,
      repositorySha: options.repositorySha,
      captureStartTime: captureStartTime.toISOString(),
      captureEndTime: captureEndTime.toISOString(),
      games: snapshot.games.map((g) => ({
        gameId: g.id,
        season: g.season,
        week: g.week,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        homeTeamName: g.homeTeam.name,
        awayTeamName: g.awayTeam.name,
        kickoffAsKnown: g.date,
        neutralSite: g.neutralSite,
        status: g.status,
      })),
      fbsTeamIds: snapshot.fbsTeamIds,
      ratings: snapshot.ratings,
      marketLines: snapshot.marketLines,
      lifecycleReceipt: options.lifecycleReceipt,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  // Parse/validate CLI BEFORE any DB connection.
  let args: ReturnType<typeof parseMlCal1CliArgs>;
  try {
    args = parseMlCal1CliArgs(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 2;
    return;
  }

  const outRoot = args.outDir ?? defaultOutRoot();
  fs.mkdirSync(outRoot, { recursive: true });

  const captureId =
    args.captureId ??
    `ml-cal-1-${args.season}-w${String(args.week).padStart(2, '0')}-${randomUUID()}`;

  const repoRoot = process.cwd();
  const dependencyHashes = resolveDependencyHashes(repoRoot);

  let fixtureInput: MlCal1FixtureInput;
  let repositorySha: string;

  try {
    if (args.fixturePath) {
      const raw = JSON.parse(
        fs.readFileSync(args.fixturePath, 'utf8')
      ) as MlCal1FixtureInput;
      repositorySha = args.repositorySha ?? raw.repositorySha;
      fixtureInput = {
        ...raw,
        captureId: args.captureId ?? raw.captureId ?? captureId,
        season: args.season,
        week: args.week,
        repositorySha,
      };
      if (fixtureInput.season !== ML_CAL_1_SUPPORTED_SEASON) {
        throw new Error(`unsupported_season:${fixtureInput.season}`);
      }
    } else if (!args.enableLiveDbRead) {
      // Live DB reads are implemented but gated: study-window registration,
      // receipt qualification, and workflow wiring remain subsequent review steps.
      console.error(
        JSON.stringify({
          ok: false,
          error:
            'live_db_read_gated:provide_--fixture_or_pass_--enable-live-db-read_after_reviewed_registration',
          hint: 'This PR ships fixture capture only for CI. Do not dispatch a live capture without reviewed registration + workflow PR.',
        })
      );
      process.exitCode = 3;
      return;
    } else {
      repositorySha = args.repositorySha ?? readRepoCommitSha();
      let lifecycleReceipt: MlCal1LifecycleReceipt | null = null;
      if (args.lifecycleReceiptPath) {
        lifecycleReceipt = JSON.parse(
          fs.readFileSync(args.lifecycleReceiptPath, 'utf8')
        ) as MlCal1LifecycleReceipt;
      }
      fixtureInput = await loadLiveSnapshot({
        season: args.season,
        week: args.week,
        lifecycleReceipt,
        repositorySha,
        captureId,
        now: () => new Date(),
      });
    }

    const planned = planMlCal1Capture(fixtureInput);
    planned.bundle.envelope.dependencyHashes = dependencyHashes;

    const written = writeCaptureArtifactsAtomic({
      rootDir: outRoot,
      captureId: fixtureInput.captureId,
      bundle: planned.bundle,
      dependencyHashes,
    });

    if (planned.primaryReadinessBlocked) {
      writeBlockedReasonReceipt({
        path: path.join(written.captureDir, 'primary-readiness-blocked.json'),
        captureId: fixtureInput.captureId,
        status: planned.status,
        reasons: planned.primaryBlockReasons,
        redacted: {
          season: args.season,
          week: args.week,
          counts: planned.bundle.envelope.counts,
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          status: planned.status,
          primaryReadinessBlocked: planned.primaryReadinessBlocked,
          captureDir: written.captureDir,
          manifestPath: written.manifestPath,
          manifestSha256: written.manifestSha256,
          counts: planned.bundle.envelope.counts,
          producerVersion: ML_CAL_1_CAPTURE_PRODUCER_VERSION,
          providerCalls: 0,
          businessDataWrites: 0,
        },
        null,
        2
      )
    );

    process.exitCode = planned.primaryReadinessBlocked ? 1 : 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const receiptPath = path.join(
      outRoot,
      `${captureId}-infrastructure-error.json`
    );
    try {
      writeBlockedReasonReceipt({
        path: receiptPath,
        captureId,
        status: 'INFRASTRUCTURE_ERROR',
        reasons: [message],
      });
    } catch {
      // best-effort
    }
    console.error(
      JSON.stringify({
        ok: false,
        status: 'INFRASTRUCTURE_ERROR',
        error: message,
        receiptPath,
      })
    );
    process.exitCode = 2;
  }
}

// Export live loader for unit tests that inject a client (not invoked by default CLI).
export { loadLiveSnapshot, readRepoCommitSha, resolveDependencyHashes };

if (require.main === module) {
  main();
}
