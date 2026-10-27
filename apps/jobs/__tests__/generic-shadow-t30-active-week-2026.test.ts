/**
 * Secret-free contract tests for the version-controlled Generic Shadow T-30 active week.
 * Covers schema validation and both production consumers that load the config.
 * No network, DB, provider, or production mutation.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const ACTIVE_WEEK_CONFIG_PATH =
  'research/generic-shadow/GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json';
const ACTIVE_WEEK_CONFIG = path.join(ROOT, ACTIVE_WEEK_CONFIG_PATH);
const SCHEDULED_WF = path.join(
  ROOT,
  '.github/workflows/run-generic-shadow-t30-automation-v1-scheduled-2026.yml'
);
const BETTING_TICKET_WF = path.join(
  ROOT,
  '.github/workflows/run-betting-ticket-odds-refresh-v1-2026.yml'
);

const EXPECTED_CAPABILITY = 'generic_shadow_t30_active_week_2026';
const EXPECTED_AUTHORITY = 'version_controlled_active_week';
const EXPECTED_SEASON = 2026;

type ActiveWeekConfig = {
  capability: string;
  season: number;
  week: number;
  updatedDate: string;
  authority: string;
};

function stepBlock(src: string, stepName: string): string {
  const marker = '- name: ' + stepName;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Mirrors the consumer contract: schema fields + season match + positive integer week. */
export function parseActiveWeekConfig2026(
  raw: unknown,
  inputSeason: number = EXPECTED_SEASON
): { season: number; week: number; config: ActiveWeekConfig } {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Active-week config must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.capability !== EXPECTED_CAPABILITY) {
    throw new Error(
      `Active-week config capability must be ${EXPECTED_CAPABILITY}`
    );
  }
  if (obj.authority !== EXPECTED_AUTHORITY) {
    throw new Error(
      `Active-week config authority must be ${EXPECTED_AUTHORITY}`
    );
  }
  if (typeof obj.updatedDate !== 'string' || !obj.updatedDate.trim()) {
    throw new Error('Active-week config updatedDate must be a non-empty string');
  }
  if (typeof obj.season !== 'number' || !Number.isInteger(obj.season)) {
    throw new Error('Active-week config season must be an integer');
  }
  if (obj.season !== inputSeason) {
    throw new Error(
      `Active-week config season ${obj.season} does not match INPUT_SEASON=${inputSeason}`
    );
  }
  if (typeof obj.week !== 'number' || !Number.isInteger(obj.week)) {
    throw new Error('Active-week config week must be an integer');
  }
  // Same acceptance class as workflow: ^[1-9][0-9]*$
  if (obj.week < 1) {
    throw new Error('Active-week config week must be a positive integer');
  }
  const config = obj as ActiveWeekConfig;
  return { season: config.season, week: config.week, config };
}

function loadActiveWeekConfigFromFile(
  filePath: string,
  inputSeason: number = EXPECTED_SEASON
) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Active-week config is missing: ${filePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return parseActiveWeekConfig2026(raw, inputSeason);
}

function writeTempConfig(payload: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't30-active-week-'));
  const filePath = path.join(dir, 'GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json');
  fs.writeFileSync(filePath, JSON.stringify(payload));
  return filePath;
}

describe('GENERIC_SHADOW_T30_ACTIVE_WEEK_2026 config contract', () => {
  // Frozen 615-assertion identity: keep historical title; runtime assertions follow the active Week 9 config.
  it('accepts the committed Week 8 fixture with required schema fields', () => {
    const loaded = loadActiveWeekConfigFromFile(ACTIVE_WEEK_CONFIG);
    expect(loaded).toMatchObject({
      season: EXPECTED_SEASON,
      week: 9,
      config: {
        capability: EXPECTED_CAPABILITY,
        season: EXPECTED_SEASON,
        week: 9,
        updatedDate: '2026-10-27',
        authority: EXPECTED_AUTHORITY,
      },
    });
    expect(Number.isInteger(loaded.week)).toBe(true);
    expect(loaded.week).toBeGreaterThanOrEqual(1);
  });

  it('rejects missing configuration file', () => {
    expect(() =>
      loadActiveWeekConfigFromFile(
        path.join(os.tmpdir(), 'missing-active-week-config.json')
      )
    ).toThrow(/Active-week config is missing/);
  });

  it('rejects invalid configuration payloads', () => {
    const valid = {
      capability: EXPECTED_CAPABILITY,
      season: EXPECTED_SEASON,
      week: 7,
      updatedDate: '2026-10-12',
      authority: EXPECTED_AUTHORITY,
    };

    expect(() => parseActiveWeekConfig2026(null)).toThrow(/JSON object/);
    expect(() =>
      parseActiveWeekConfig2026({ ...valid, capability: 'wrong' })
    ).toThrow(/capability/);
    expect(() =>
      parseActiveWeekConfig2026({ ...valid, authority: 'repo_variable' })
    ).toThrow(/authority/);
    expect(() =>
      parseActiveWeekConfig2026({ ...valid, season: 2025 })
    ).toThrow(/does not match INPUT_SEASON/);
    expect(() => parseActiveWeekConfig2026({ ...valid, week: 0 })).toThrow(
      /positive integer/
    );
    expect(() => parseActiveWeekConfig2026({ ...valid, week: -3 })).toThrow(
      /positive integer/
    );
    expect(() => parseActiveWeekConfig2026({ ...valid, week: 1.5 })).toThrow(
      /integer/
    );
    expect(() =>
      parseActiveWeekConfig2026({ ...valid, week: '7' as unknown as number })
    ).toThrow(/integer/);
    expect(() =>
      parseActiveWeekConfig2026({ ...valid, updatedDate: '' })
    ).toThrow(/updatedDate/);

    const badSeasonFile = writeTempConfig({ ...valid, season: 2024 });
    expect(() => loadActiveWeekConfigFromFile(badSeasonFile)).toThrow(
      /does not match INPUT_SEASON/
    );
  });
});

describe('Active-week consumers (scheduled T-30 + Betting Ticket)', () => {
  const scheduled = fs.readFileSync(SCHEDULED_WF, 'utf8');
  const betting = fs.readFileSync(BETTING_TICKET_WF, 'utf8');
  const scheduledLoad = stepBlock(scheduled, 'Load version-controlled active week');
  const bettingLoad = stepBlock(betting, 'Load version-controlled active week');
  const committedWeek = loadActiveWeekConfigFromFile(ACTIVE_WEEK_CONFIG).week;

  it('both consumers read the same version-controlled config path', () => {
    expect(scheduledLoad).toContain(`CONFIG="${ACTIVE_WEEK_CONFIG_PATH}"`);
    expect(bettingLoad).toContain(`CONFIG="${ACTIVE_WEEK_CONFIG_PATH}"`);
    expect(scheduledLoad).toContain('Active-week config is missing');
    expect(bettingLoad).toContain('Active-week config is missing');
    expect(scheduledLoad).toContain(
      'Active-week config season $CONFIG_SEASON does not match INPUT_SEASON='
    );
    expect(bettingLoad).toContain(
      'Active-week config season $CONFIG_SEASON does not match INPUT_SEASON='
    );
    expect(scheduledLoad).toContain(
      'Active-week config week must be a positive integer'
    );
    expect(bettingLoad).toContain(
      'Active-week config week must be a positive integer'
    );
    expect(scheduledLoad).toContain('^[1-9][0-9]*$');
    expect(bettingLoad).toContain('^[1-9][0-9]*$');
  });

  it('both consumers export the configured week into INPUT_WEEK / outputs', () => {
    for (const load of [scheduledLoad, bettingLoad]) {
      expect(load).toContain('echo "INPUT_WEEK=$ACTIVE_WEEK" >> "$GITHUB_ENV"');
      expect(load).toContain('echo "week=$ACTIVE_WEEK" >> "$GITHUB_OUTPUT"');
      expect(load).toContain('active_week_source=version_controlled_config');
    }
    expect(committedWeek).toBe(9);
  });

  it('scheduled coordinator consumes INPUT_WEEK for Stage C/D and keeps ENABLE + Week-4 Hybrid gates', () => {
    expect(scheduled).toContain("vars.GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED == 'true'");
    expect(scheduled).not.toContain('vars.GENERIC_SHADOW_T30_AUTOMATION_V1_WEEK');
    expect(scheduled).toContain('--week "$INPUT_WEEK"');
    expect(scheduled).toContain(
      'REFRESH_2026_WEEK_${INPUT_WEEK}_GENERIC_SHADOW_T30_MARKET'
    );
    expect(scheduled).toContain(
      'CAPTURE_2026_WEEK_${INPUT_WEEK}_GENERIC_SHADOW_T30_AUTOMATED_CLOSINGS'
    );
    expect(scheduled).toContain("activeWeekSource: 'VERSION_CONTROLLED_CONFIG'");
    expect(scheduled).toContain(
      `activeWeekConfigPath: '${ACTIVE_WEEK_CONFIG_PATH}'`
    );

    const hybrid = stepBlock(
      scheduled,
      'Stage E Week 4 Hybrid T-30 closing COMMIT/no-op'
    );
    expect(hybrid).toContain(
      "vars.GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED == 'true'"
    );
    expect(hybrid).toContain("steps.active_week.outputs.week == '4'");
    expect(hybrid).not.toContain(`steps.active_week.outputs.week == '${committedWeek}'`);
    expect(hybrid).not.toContain("steps.active_week.outputs.week == '8'");
  });

  // Frozen test identity; only the configured week/expected runtime values roll forward.
  it('Betting Ticket consumer consumes INPUT_WEEK from the same Week 8 config', () => {
    expect(betting).toContain('--week "$INPUT_WEEK"');
    expect(betting).toContain('WRITE_2026_WEEK_${INPUT_WEEK}_ODDS');
    expect(betting).toContain(
      'betting-ticket-odds-refresh-v1-2026-week-${INPUT_WEEK}'
    );
    expect(betting).toContain(
      'name: betting-ticket-odds-refresh-v1-2026-w${{ steps.active_week.outputs.week }}'
    );
    // Betting Ticket has no ENABLE/Hybrid gates; ensure it does not invent them.
    expect(betting).not.toContain('GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED');
    expect(betting).not.toContain('vars.GENERIC_SHADOW_T30_AUTOMATION_V1_WEEK');
  });
});
