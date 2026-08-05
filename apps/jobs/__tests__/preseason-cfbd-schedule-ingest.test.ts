/**
 * Mocked tests for isolated CFBD schedule-only path (Phase 2C-1A2 hardening).
 * No network. No production DB. No secrets printed.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PREVIEW_ONLY_WRITE_DISABLED_MESSAGE,
  buildGameId,
  compareToExistingDb,
  createPrismaReadOnlyScheduleStore,
  filterAndNormalizeProviderGames,
  loadCfbdTeamAliases,
  parseKickoffExplicit,
  parseScheduleOnlyArgs,
  redactSecretLike,
  resolveProviderTeam,
  sampleNormalizedGames,
  teamLookupFromStore,
  teamResolutionFailed,
  toScheduleInsertRow,
  validateNormalizedBatch,
  writeValidatedScheduleBatch,
  type CfbdProviderGame,
  type NormalizedScheduleGame,
  type ReadOnlyScheduleStore,
  type TeamRecord,
} from '../src/preseason/cfbd-schedule-ingest';
import { forcePreviewArgv } from '../../../scripts/preview-cfbd-schedules';
import {
  runScheduleOnly,
  runSchedulePreview as runPreviewFromCli,
} from '../ingest-schedules';

function mockLookup(teams: TeamRecord[]): ReadOnlyScheduleStore {
  return {
    async findTeamById(id: string) {
      return teams.find((t) => t.id === id) ?? null;
    },
    async findTeamsByNameInsensitive(name: string) {
      const lower = name.toLowerCase();
      return teams.filter((t) => t.name.toLowerCase() === lower);
    },
    async findGamesForSeasonWeek() {
      return [];
    },
  };
}

function sampleProviderGame(
  overrides: Partial<CfbdProviderGame> = {}
): CfbdProviderGame {
  return {
    season: 2026,
    week: 0,
    startDate: '2026-08-29T16:00:00.000Z',
    homeTeam: 'Georgia',
    awayTeam: 'Clemson',
    homeClassification: 'fbs',
    awayClassification: 'fbs',
    venue: 'Sanford Stadium',
    neutralSite: false,
    conferenceGame: false,
    ...overrides,
  };
}

function baseNormalized(
  overrides: Partial<NormalizedScheduleGame> = {}
): NormalizedScheduleGame {
  return {
    id: '2026-wk0-clemson-georgia',
    season: 2026,
    week: 0,
    homeTeamId: 'georgia',
    awayTeamId: 'clemson',
    date: new Date('2026-08-29T16:00:00.000Z'),
    rawKickoff: '2026-08-29T16:00:00.000Z',
    providerWeek: 0,
    venue: 'Sanford Stadium',
    city: 'Athens',
    neutralSite: false,
    conferenceGame: false,
    providerHomeName: 'Georgia',
    providerAwayName: 'Clemson',
    ...overrides,
  };
}

describe('preseason cfbd schedule-only', () => {
  describe('strict CLI parsing / preview-only', () => {
    it('accepts season 2026 + week 0 with --preview', () => {
      const r = parseScheduleOnlyArgs([
        '--season',
        '2026',
        '--week',
        '0',
        '--preview',
      ]);
      expect(r.ok).toBe(true);
      expect(r.args).toEqual({ season: 2026, week: 0, preview: true });
    });

    it('accepts season 2026 + week 1 with preview', () => {
      const r = parseScheduleOnlyArgs([
        '--season',
        '2026',
        '--week',
        '1',
        '--preview',
      ]);
      expect(r.ok).toBe(true);
      expect(r.args?.preview).toBe(true);
    });

    it('rejects omission of --preview', () => {
      const r = parseScheduleOnlyArgs(['--season', '2026', '--week', '0']);
      expect(r.ok).toBe(false);
      expect(r.errors.join(' ')).toMatch(/--preview is required/);
      expect(r.errors.join(' ')).toContain(PREVIEW_ONLY_WRITE_DISABLED_MESSAGE);
    });

    it('rejects --write and related write flags', () => {
      for (const flag of [
        '--write',
        '--force-write',
        '--allow-write',
        '--execute',
      ]) {
        const r = parseScheduleOnlyArgs([
          '--season',
          '2026',
          '--week',
          '0',
          '--preview',
          flag,
        ]);
        expect(r.ok).toBe(false);
        expect(r.errors.join(' ')).toMatch(/not allowed|Phase 2C-1B/);
      }
    });

    it('rejects comma list week', () => {
      const r = parseScheduleOnlyArgs([
        '--season',
        '2026',
        '--week',
        '0,1',
        '--preview',
      ]);
      expect(r.ok).toBe(false);
    });

    it('rejects range week', () => {
      const r = parseScheduleOnlyArgs([
        '--season',
        '2026',
        '--week',
        '0-2',
        '--preview',
      ]);
      expect(r.ok).toBe(false);
    });

    it('rejects --weeks', () => {
      const r = parseScheduleOnlyArgs([
        '--season',
        '2026',
        '--weeks',
        '1',
        '--preview',
      ]);
      expect(r.ok).toBe(false);
    });

    it('rejects missing week', () => {
      const r = parseScheduleOnlyArgs(['--season', '2026', '--preview']);
      expect(r.ok).toBe(false);
    });

    it('rejects unknown flags', () => {
      const r = parseScheduleOnlyArgs([
        '--season',
        '2026',
        '--week',
        '0',
        '--preview',
        '--dry-run',
      ]);
      expect(r.ok).toBe(false);
    });

    it('does not trim week based on GITHUB_ACTIONS', () => {
      const prev = process.env.GITHUB_ACTIONS;
      process.env.GITHUB_ACTIONS = 'true';
      try {
        const r = parseScheduleOnlyArgs([
          '--season',
          '2026',
          '--week',
          '0',
          '--preview',
        ]);
        expect(r.ok).toBe(true);
        expect(r.args?.week).toBe(0);
      } finally {
        if (prev === undefined) delete process.env.GITHUB_ACTIONS;
        else process.env.GITHUB_ACTIONS = prev;
      }
    });

    it('environment write vars cannot make parse succeed without --preview', () => {
      const prev = process.env.SCHEDULE_ALLOW_WRITE;
      process.env.SCHEDULE_ALLOW_WRITE = '1';
      try {
        const r = parseScheduleOnlyArgs(['--season', '2026', '--week', '0']);
        expect(r.ok).toBe(false);
      } finally {
        if (prev === undefined) delete process.env.SCHEDULE_ALLOW_WRITE;
        else process.env.SCHEDULE_ALLOW_WRITE = prev;
      }
    });
  });

  describe('kickoff explicit-zone parsing', () => {
    it('accepts timestamp ending in Z', () => {
      const r = parseKickoffExplicit('2026-08-29T16:00:00.000Z');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.utcIso).toBe('2026-08-29T16:00:00.000Z');
    });

    it('accepts negative UTC offset', () => {
      const r = parseKickoffExplicit('2026-08-29T12:00:00-05:00');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.utcIso).toBe('2026-08-29T17:00:00.000Z');
    });

    it('accepts positive UTC offset', () => {
      const r = parseKickoffExplicit('2026-08-29T18:00:00+02:00');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.utcIso).toBe('2026-08-29T16:00:00.000Z');
    });

    it('rejects timezone-less timestamp', () => {
      const r = parseKickoffExplicit('2026-08-29T16:00:00');
      expect(r).toEqual(
        expect.objectContaining({
          ok: false,
          reason: expect.stringMatching(/timezone-less/),
        })
      );
    });

    it('rejects invalid timestamp', () => {
      expect(parseKickoffExplicit('not-a-date').ok).toBe(false);
    });

    it('normalized UTC is deterministic', () => {
      const a = parseKickoffExplicit('2026-09-01T19:30:00-04:00');
      const b = parseKickoffExplicit('2026-09-01T19:30:00-04:00');
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(a).toEqual(b);
    });
  });

  describe('schedule isolation', () => {
    it('module source does not import ratings or seed-ratings', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '../src/preseason/cfbd-schedule-ingest.ts'),
        'utf8'
      );
      expect(src).not.toMatch(/seed-ratings/);
      expect(src).not.toMatch(/runRatings/);
      expect(src).not.toMatch(/OddsApi/);
      expect(src).not.toMatch(/AdapterFactory/);
      expect(src).not.toMatch(/from ['"].*mock/i);
    });

    it('CLI source does not import or call writeValidatedScheduleBatch', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '../ingest-schedules.ts'),
        'utf8'
      );
      expect(src).not.toMatch(/import\s*\{[^}]*writeValidatedScheduleBatch/);
      expect(src).not.toMatch(/writeValidatedScheduleBatch\s*\(/);
      expect(src).not.toMatch(/seed-ratings/);
      expect(src).toMatch(/runSchedulePreview/);
    });

    it('preview script does not import write helper', () => {
      const src = fs.readFileSync(
        path.join(process.cwd(), 'scripts/preview-cfbd-schedules.ts'),
        'utf8'
      );
      expect(src).not.toMatch(/writeValidatedScheduleBatch/);
      expect(src).toMatch(/runSchedulePreview/);
      expect(src).toMatch(/forcePreviewArgv/);
    });

    it('package.json exposes preview only', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
      );
      expect(pkg.scripts['preview:cfbd-schedules']).toMatch(
        /preview-cfbd-schedules/
      );
      const scriptValues = Object.values(
        pkg.scripts as Record<string, string>
      ).join('\n');
      expect(scriptValues).not.toMatch(/writeValidatedScheduleBatch/);
    });

    it('schedule write path does not write scores', async () => {
      const game = baseNormalized();
      expect(toScheduleInsertRow(game).homeScore).toBeNull();
      const updates: Array<Record<string, unknown>> = [];
      await writeValidatedScheduleBatch(
        [game],
        {
          async createMany() {
            return 0;
          },
          async updateScheduleFields(_id, data) {
            updates.push(data as unknown as Record<string, unknown>);
          },
          async loadExistingForWeek() {
            return [
              {
                id: game.id,
                season: 2026,
                week: 0,
                homeTeamId: 'georgia',
                awayTeamId: 'clemson',
                date: game.date,
                homeScore: null,
                awayScore: null,
                status: 'scheduled',
              },
            ];
          },
          async transaction(fn) {
            return fn();
          },
        },
        { season: 2026, week: 0 }
      );
      expect(updates[0]).not.toHaveProperty('homeScore');
    });

    it('write helper requires transaction', async () => {
      await expect(
        writeValidatedScheduleBatch(
          [baseNormalized()],
          {
            async createMany() {
              return 0;
            },
            async updateScheduleFields() {},
            async loadExistingForWeek() {
              return [];
            },
          } as never,
          { season: 2026, week: 0 }
        )
      ).rejects.toThrow(/requires deps\.transaction/);
    });

    it('never creates team stubs', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '../src/preseason/cfbd-schedule-ingest.ts'),
        'utf8'
      );
      expect(src).not.toMatch(/Independent/);
    });
  });

  describe('team resolution', () => {
    const aliases = new Map<string, string>([
      ['miami (fl)', 'miami'],
      ['texas a&m', 'texas-a-m'],
    ]);

    it('exact canonical match by name', async () => {
      const lookup = teamLookupFromStore(
        mockLookup([{ id: 'georgia', name: 'Georgia' }])
      );
      const r = await resolveProviderTeam('Georgia', lookup, new Map());
      expect(r.kind).toBe('exact_canonical');
      expect(r.resolvedId).toBe('georgia');
    });

    it('existing alias match', async () => {
      const lookup = teamLookupFromStore(
        mockLookup([{ id: 'miami', name: 'Miami' }])
      );
      const r = await resolveProviderTeam('Miami (FL)', lookup, aliases);
      expect(r.kind).toBe('alias');
      expect(r.resolvedId).toBe('miami');
    });

    it('missing team aborts classification', async () => {
      const lookup = teamLookupFromStore(mockLookup([]));
      const r = await resolveProviderTeam('Unknown U', lookup, new Map());
      expect(r.kind).toBe('missing');
      expect(teamResolutionFailed([r])).toBe(true);
    });

    it('ambiguous team aborts', async () => {
      const lookup = teamLookupFromStore(
        mockLookup([
          { id: 'a', name: 'Duplicate' },
          { id: 'b', name: 'Duplicate' },
        ])
      );
      expect(
        (await resolveProviderTeam('Duplicate', lookup, new Map())).kind
      ).toBe('ambiguous');
    });

    it('conflicting identity aborts', async () => {
      const lookup = teamLookupFromStore(
        mockLookup([
          { id: 'miami', name: 'Miami' },
          { id: 'other', name: 'Miami (FL)' },
        ])
      );
      expect(
        (await resolveProviderTeam('Miami (FL)', lookup, aliases)).kind
      ).toBe('conflicting');
    });
  });

  describe('game identity and idempotency', () => {
    it('builds deterministic season-scoped IDs', () => {
      expect(buildGameId(2026, 0, 'clemson', 'georgia')).toBe(
        '2026-wk0-clemson-georgia'
      );
    });

    it('2026 IDs cannot collide with 2025 IDs', () => {
      expect(buildGameId(2026, 1, 'a', 'b')).not.toBe(
        buildGameId(2025, 1, 'a', 'b')
      );
    });

    it('repeated batch updates via transaction', async () => {
      const game = baseNormalized();
      let createCalls = 0;
      let updateCalls = 0;
      let existing: typeof game[] = [];
      const deps = {
        async createMany(rows: unknown[]) {
          createCalls += 1;
          existing = [game];
          return rows.length;
        },
        async updateScheduleFields() {
          updateCalls += 1;
        },
        async loadExistingForWeek() {
          return existing.map((g) => ({
            id: g.id,
            season: g.season,
            week: g.week,
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            date: g.date,
            homeScore: null as number | null,
            awayScore: null as number | null,
            status: 'scheduled',
          }));
        },
        async transaction<T>(fn: () => Promise<T>) {
          return fn();
        },
      };
      const first = await writeValidatedScheduleBatch([game], deps, {
        season: 2026,
        week: 0,
      });
      const second = await writeValidatedScheduleBatch([game], deps, {
        season: 2026,
        week: 0,
      });
      expect(first.inserted).toBe(1);
      expect(first.updated).toBe(0);
      expect(second.inserted).toBe(0);
      expect(second.updated).toBe(1);
      expect(createCalls).toBe(1);
      expect(updateCalls).toBe(1);
    });

    it('sample output includes raw and normalized kickoffs', () => {
      const sample = sampleNormalizedGames([baseNormalized()]);
      expect(sample[0].rawKickoff).toBe('2026-08-29T16:00:00.000Z');
      expect(sample[0].normalizedUtcKickoff).toBe('2026-08-29T16:00:00.000Z');
      expect(sample[0].providerWeek).toBe(0);
    });
  });

  describe('batch validation', () => {
    it('empty batch fails', () => {
      expect(validateNormalizedBatch([], 2026, 0).ok).toBe(false);
    });

    it('duplicate IDs fail', () => {
      const g = baseNormalized();
      expect(validateNormalizedBatch([g, { ...g }], 2026, 0).ok).toBe(false);
    });

    it('timezone-less kickoffs surface as issues', () => {
      const resolutions = new Map([
        [
          'Georgia',
          {
            providerName: 'Georgia',
            slugCandidate: 'georgia',
            kind: 'exact_canonical' as const,
            resolvedId: 'georgia',
          },
        ],
        [
          'Clemson',
          {
            providerName: 'Clemson',
            slugCandidate: 'clemson',
            kind: 'exact_canonical' as const,
            resolvedId: 'clemson',
          },
        ],
      ]);
      const { games, kickoffIssues } = filterAndNormalizeProviderGames(
        [sampleProviderGame({ startDate: '2026-08-29T16:00:00' })],
        2026,
        0,
        resolutions
      );
      expect(games).toHaveLength(0);
      expect(kickoffIssues.some((i) => i.code === 'invalid_kickoff')).toBe(true);
    });

    it('DB comparison is read-only reporting', () => {
      const g = baseNormalized();
      const cmp = compareToExistingDb(
        [g],
        [
          {
            id: g.id,
            season: 2026,
            week: 0,
            homeTeamId: 'georgia',
            awayTeamId: 'clemson',
            date: g.date,
            homeScore: 21,
            awayScore: 14,
            status: 'final',
          },
        ]
      );
      expect(cmp.wouldUpdateIds).toEqual([g.id]);
    });

    it('redacts secret-like strings', () => {
      const redacted = redactSecretLike(
        'Bearer super-secret postgresql://user:pass@host/db'
      );
      expect(redacted).not.toMatch(/super-secret|user:pass/);
    });

    it('loads existing CFBD alias file', () => {
      expect(loadCfbdTeamAliases().get('texas a&m')).toBe('texas-a-m');
    });

    it('skips non-FBS', () => {
      const resolutions = new Map([
        [
          'Georgia',
          {
            providerName: 'Georgia',
            slugCandidate: 'georgia',
            kind: 'exact_canonical' as const,
            resolvedId: 'georgia',
          },
        ],
        [
          'FCS U',
          {
            providerName: 'FCS U',
            slugCandidate: 'fcs-u',
            kind: 'exact_canonical' as const,
            resolvedId: 'fcs-u',
          },
        ],
      ]);
      const { games, skippedNonFbs } = filterAndNormalizeProviderGames(
        [
          sampleProviderGame({
            awayTeam: 'FCS U',
            awayClassification: 'fcs',
          }),
        ],
        2026,
        0,
        resolutions
      );
      expect(games).toHaveLength(0);
      expect(skippedNonFbs).toBe(1);
    });
  });

  describe('runtime read-only database boundary', () => {
    function createHostilePrisma() {
      const mutationCalls: string[] = [];
      const mark = (name: string) =>
        jest.fn(() => {
          mutationCalls.push(name);
          throw new Error(`mutation ${name} must not be called`);
        });
      return {
        team: {
          findUnique: jest.fn(
            async ({ where }: { where: { id: string } }) => {
              if (where.id === 'georgia')
                return { id: 'georgia', name: 'Georgia' };
              if (where.id === 'clemson')
                return { id: 'clemson', name: 'Clemson' };
              return null;
            }
          ),
          findMany: jest.fn(
            async ({
              where,
            }: {
              where: { name: { equals: string } };
            }) => {
              const n = where.name.equals.toLowerCase();
              if (n === 'georgia') return [{ id: 'georgia', name: 'Georgia' }];
              if (n === 'clemson') return [{ id: 'clemson', name: 'Clemson' }];
              return [];
            }
          ),
          create: mark('team.create'),
          createMany: mark('team.createMany'),
          update: mark('team.update'),
          updateMany: mark('team.updateMany'),
          upsert: mark('team.upsert'),
          delete: mark('team.delete'),
          deleteMany: mark('team.deleteMany'),
        },
        game: {
          findMany: jest.fn(async () => []),
          create: mark('game.create'),
          createMany: mark('game.createMany'),
          update: mark('game.update'),
          updateMany: mark('game.updateMany'),
          upsert: mark('game.upsert'),
          delete: mark('game.delete'),
          deleteMany: mark('game.deleteMany'),
        },
        $executeRaw: mark('$executeRaw'),
        $executeRawUnsafe: mark('$executeRawUnsafe'),
        $queryRawUnsafe: mark('$queryRawUnsafe'),
        $transaction: mark('$transaction'),
        mutationCalls,
      };
    }

    it('preview completes with hostile Prisma and zero mutations', async () => {
      const prisma = createHostilePrisma();
      const store = createPrismaReadOnlyScheduleStore(prisma as never);

      const gamesPayload = [sampleProviderGame()];
      const fetchImpl = jest.fn(async (url: string) => {
        if (String(url).includes('/venues')) {
          return { ok: true, json: async () => [] } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => gamesPayload,
        } as Response;
      });

      const result = await runPreviewFromCli({
        season: 2026,
        week: 0,
        apiKey: 'test-key',
        store,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(result.exitCode).toBe(0);
      expect(prisma.mutationCalls).toEqual([]);
      expect(prisma.game.findMany).toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.game.createMany).not.toHaveBeenCalled();
      expect(prisma.team.createMany).not.toHaveBeenCalled();
    });

    it('runScheduleOnly refuses preview:false', async () => {
      const { exitCode } = await runScheduleOnly({
        season: 2026,
        week: 0,
        preview: false,
        apiKey: 'x',
        store: mockLookup([]),
      });
      expect(exitCode).toBe(1);
    });

    it('forcePreviewArgv always injects --preview', () => {
      expect(forcePreviewArgv(['--season', '2026', '--week', '0'])).toContain(
        '--preview'
      );
      expect(
        forcePreviewArgv(['--season', '2026', '--week', '0', '--write'])
      ).not.toContain('--write');
    });
  });
});

describe('preview-2026-schedules workflow static safety', () => {
  const yamlPath = path.join(
    process.cwd(),
    '.github/workflows/preview-2026-schedules.yml'
  );
  const text = fs.readFileSync(yamlPath, 'utf8');

  it('is workflow_dispatch only', () => {
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).not.toMatch(/^\s*push:/m);
    expect(text).not.toMatch(/^\s*pull_request:/m);
  });

  it('uses checkout/setup-node v6 and Node 20', () => {
    expect(text).toMatch(/actions\/checkout@v6/);
    expect(text).toMatch(/actions\/setup-node@v6/);
    expect(text).toMatch(/node-version:\s*'20'/);
  });

  it('has no write path and explicit --preview', () => {
    expect(text).not.toMatch(/^\s*confirm_write:/m);
    expect(text).not.toMatch(/apps\/jobs\/dist\/ingest\.js/);
    expect(text).not.toMatch(/ingest\.js\s+cfbd/);
    expect(text).toMatch(/preview-cfbd-schedules\.ts/);
    expect(text).toMatch(/--preview/);
    expect(text).not.toMatch(/seed-ratings|runRatings|ratings:v/);
    expect(text).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(text).not.toMatch(/ingest-simple\.js\s+mock/);
    expect(text).not.toMatch(/\b(createMany|updateMany|upsert|deleteMany)\b/);
    expect(text).not.toMatch(/prisma migrate/);
    expect(text).toMatch(/CFBD_API_KEY: \$\{\{ secrets\.CFBD_API_KEY \}\}/);
    expect(text).toMatch(/DIRECT_URL: \$\{\{ secrets\.DIRECT_URL \}\}/);
  });

  it('defaults season 2026 and week 0', () => {
    expect(text).toMatch(/default:\s*'2026'/);
    expect(text).toMatch(/default:\s*'0'/);
  });

  it('no workflow contains a schedule-write command', () => {
    const workflowsDir = path.join(process.cwd(), '.github/workflows');
    for (const file of fs.readdirSync(workflowsDir)) {
      if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
      const body = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      expect(body).not.toMatch(/writeValidatedScheduleBatch/);
    }
  });
});
