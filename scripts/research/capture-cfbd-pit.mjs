#!/usr/bin/env node
/**
 * CFBD Point-in-Time (PIT) archive capture — RESEARCH ONLY.
 *
 * Stage A / Stage B utility for immutable CFBD evidence snapshots.
 * - No Prisma / production writers / ratings / odds / card / lifecycle imports
 * - Never prints CFBD response bodies or Authorization / API key material
 * - Requires explicit --capture-seed for live CFBD calls
 * - Use --self-test for offline validation (zero network)
 *
 * Invocation (Stage B — do not run in Stage A):
 *   node scripts/research/capture-cfbd-pit.mjs --capture-seed
 *
 * Offline:
 *   node scripts/research/capture-cfbd-pit.mjs --self-test
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  writeFile,
  readFile,
  mkdtemp,
  rm,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAPTURE_TOOL_VERSION = 'cfbd-pit-seed-v1';
export const SCHEMA_VERSION = '1.0.0';
export const DEFAULT_BASE_URL = 'https://api.collegefootballdata.com';
export const TIMEZONE = 'America/Chicago';

export const SEED_FIXED = Object.freeze({
  snapshot_kind: 'SEED',
  season: 2026,
  provider_week: 1,
  provider_week_state: 'PARTIAL',
  timezone: TIMEZONE,
  returning_portal_designation: 'ONE_TIME_OPENING_WEEK_BASELINE',
});

/** Exact six sources, fixed order. */
export const SOURCE_DEFINITIONS = Object.freeze([
  {
    source_id: 'core',
    endpoint: '/ratings/core',
    params: { year: '2026' },
    raw_file: 'ratings_core.json',
    capture_role: 'CORE_RATINGS_SNAPSHOT',
    cadence: 'SEED_PARTIAL_W1',
  },
  {
    source_id: 'wepa_team',
    endpoint: '/wepa/team/season',
    params: { year: '2026' },
    raw_file: 'wepa_team_season.json',
    capture_role: 'WEPA_TEAM_SEASON_SNAPSHOT',
    cadence: 'SEED_PARTIAL_W1',
  },
  {
    source_id: 'passing_plays',
    endpoint: '/passing/plays',
    params: {
      year: '2026',
      week: '1',
      seasonType: 'regular',
      classification: 'fbs',
    },
    raw_file: 'passing_plays_w01.json',
    capture_role: 'PASSING_PLAYS_W1',
    cadence: 'SEED_PARTIAL_W1',
  },
  {
    source_id: 'passing_team_games',
    endpoint: '/passing/teams/games',
    params: {
      year: '2026',
      week: '1',
      seasonType: 'regular',
      classification: 'fbs',
    },
    raw_file: 'passing_teams_games_w01.json',
    capture_role: 'PASSING_TEAM_GAMES_W1',
    cadence: 'SEED_PARTIAL_W1',
  },
  {
    source_id: 'returning',
    endpoint: '/player/returning',
    params: { year: '2026' },
    raw_file: 'player_returning.json',
    capture_role: 'ONE_TIME_OPENING_WEEK_BASELINE',
    cadence: 'ONE_TIME_OPENING_WEEK_BASELINE',
  },
  {
    source_id: 'portal',
    endpoint: '/player/portal',
    params: { year: '2026' },
    raw_file: 'player_portal.json',
    capture_role: 'ONE_TIME_OPENING_WEEK_BASELINE',
    cadence: 'ONE_TIME_OPENING_WEEK_BASELINE',
  },
]);

const MAX_ATTEMPTS = 3; // 1 initial + 2 retries
const CAPTURE_WINDOW_TARGET_SECONDS = 600;
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 429]);

// ---------------------------------------------------------------------------
// Time helpers (America/Chicago offset-aware via Intl)
// ---------------------------------------------------------------------------

export function formatUtcIso(date = new Date()) {
  return date.toISOString();
}

/** Offset-aware ISO 8601 in America/Chicago (e.g. 2026-09-01T12:34:56.789-05:00). */
export function formatChicagoIso(date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    fractionalSecondDigits: 3,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    Number(parts.fractionalSecond || 0)
  );
  const offsetMinutes = Math.round((asUTC - date.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const oh = String(Math.floor(abs / 60)).padStart(2, '0');
  const om = String(abs % 60).padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond || '000'}${sign}${oh}:${om}`;
}

/** YYYY-MM-DD calendar date in America/Chicago. */
export function chicagoCalendarDate(date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(date); // en-CA → YYYY-MM-DD
}

export function buildSnapshotId(startedAtUtc = new Date()) {
  const stamp = startedAtUtc
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `cfbd-2026-w01-seed-partial-${stamp}`;
}

export function buildSnapshotDir(rootDir, startedAt = new Date(), snapshotId) {
  const dateDir = chicagoCalendarDate(startedAt);
  const id = snapshotId || buildSnapshotId(startedAt);
  return {
    snapshotId: id,
    chicagoDate: dateDir,
    snapshotRoot: path.join(rootDir, 'cfbd-pit', '2026', dateDir, id),
    rawDir: path.join(rootDir, 'cfbd-pit', '2026', dateDir, id, 'raw'),
  };
}

// ---------------------------------------------------------------------------
// Crypto / raw bytes
// ---------------------------------------------------------------------------

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export async function persistRawBytes(filePath, buffer) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return sha256Hex(buffer);
}

export function parseJsonBytes(buffer) {
  const text = Buffer.from(buffer).toString('utf8');
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Retry policy (pure)
// ---------------------------------------------------------------------------

export function isRetryableFailure({ httpStatus, networkError }) {
  if (networkError) return true;
  if (httpStatus == null) return true;
  if (NON_RETRYABLE_STATUS.has(httpStatus)) return false;
  if (httpStatus >= 500 && httpStatus <= 599) return true;
  return false;
}

export function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function yearField(row) {
  if (row == null || typeof row !== 'object') return null;
  if (row.year != null) return Number(row.year);
  if (row.season != null) return Number(row.season);
  return null;
}

function weekField(row) {
  if (row == null || typeof row !== 'object') return null;
  if (row.week != null) return Number(row.week);
  return null;
}

export function validateTopLevelArray(decoded, expectedSeason, expectedWeek) {
  const warnings = [];
  if (!Array.isArray(decoded)) {
    return {
      validation_status: 'VALIDATION_FAILED',
      validation_warnings: ['top-level JSON is not an array'],
      record_count: null,
      coverage_metrics: {},
    };
  }
  const record_count = decoded.length;
  if (record_count === 0) {
    return {
      validation_status: 'VALID_EMPTY',
      validation_warnings: warnings,
      record_count: 0,
      coverage_metrics: { record_count: 0 },
    };
  }

  for (let i = 0; i < decoded.length; i++) {
    const y = yearField(decoded[i]);
    if (y != null && y !== expectedSeason) {
      return {
        validation_status: 'VALIDATION_FAILED',
        validation_warnings: [
          `row[${i}] year/season=${y} expected ${expectedSeason}`,
        ],
        record_count,
        coverage_metrics: {},
      };
    }
    if (expectedWeek != null) {
      const w = weekField(decoded[i]);
      if (w != null && w !== expectedWeek) {
        return {
          validation_status: 'VALIDATION_FAILED',
          validation_warnings: [
            `row[${i}] week=${w} expected ${expectedWeek}`,
          ],
          record_count,
          coverage_metrics: {},
        };
      }
    }
  }

  return {
    validation_status: 'VALID',
    validation_warnings: warnings,
    record_count,
    coverage_metrics: {},
  };
}

export function validateCore(decoded) {
  const base = validateTopLevelArray(decoded, 2026, null);
  if (
    base.validation_status !== 'VALID' &&
    base.validation_status !== 'VALID_EMPTY'
  ) {
    return base;
  }
  if (base.validation_status === 'VALID_EMPTY') {
    return {
      ...base,
      coverage_metrics: {
        team_count: 0,
        distinct_through_weeks: 0,
        distinct_through_season_types: 0,
        distinct_model_versions: 0,
      },
    };
  }
  const teams = new Set();
  const throughWeeks = new Set();
  const seasonTypes = new Set();
  const models = new Set();
  for (const row of decoded) {
    if (row.team != null) teams.add(String(row.team));
    else if (row.teamId != null) teams.add(String(row.teamId));
    if (row.throughWeek != null) throughWeeks.add(String(row.throughWeek));
    if (row.throughSeasonType != null)
      seasonTypes.add(String(row.throughSeasonType));
    if (row.modelVersion != null) models.add(String(row.modelVersion));
  }
  return {
    ...base,
    coverage_metrics: {
      team_count: teams.size,
      distinct_through_weeks: throughWeeks.size,
      distinct_through_season_types: seasonTypes.size,
      distinct_model_versions: models.size,
    },
  };
}

export function validateWepa(decoded) {
  const base = validateTopLevelArray(decoded, 2026, null);
  if (
    base.validation_status !== 'VALID' &&
    base.validation_status !== 'VALID_EMPTY'
  ) {
    return base;
  }
  if (base.validation_status === 'VALID_EMPTY') {
    return {
      ...base,
      coverage_metrics: { team_count: 0, distinct_team_ids_count: 0 },
    };
  }
  const teams = new Set();
  const teamIds = new Set();
  for (const row of decoded) {
    if (row.team != null) teams.add(String(row.team));
    if (row.teamId != null) teamIds.add(String(row.teamId));
  }
  return {
    ...base,
    coverage_metrics: {
      team_count: teams.size || teamIds.size,
      distinct_team_ids_count: teamIds.size,
    },
  };
}

export function validatePassingPlays(decoded) {
  const base = validateTopLevelArray(decoded, 2026, 1);
  if (
    base.validation_status !== 'VALID' &&
    base.validation_status !== 'VALID_EMPTY'
  ) {
    return base;
  }
  if (base.validation_status === 'VALID_EMPTY') {
    return {
      ...base,
      coverage_metrics: {
        record_count: 0,
        unique_game_count: 0,
        parse_status_complete: 0,
        parse_status_partial: 0,
        parse_status_invalid: 0,
        air_yards_available_count: 0,
        yac_available_count: 0,
      },
    };
  }

  const keys = new Set();
  let dup = false;
  const games = new Set();
  let parseComplete = 0;
  let parsePartial = 0;
  let parseInvalid = 0;
  let airAvail = 0;
  let yacAvail = 0;

  for (const row of decoded) {
    const gid = row.gameId ?? row.game_id;
    const pid = row.playId ?? row.play_id;
    if (gid != null) games.add(String(gid));
    const nk = `${gid}::${pid}`;
    if (keys.has(nk)) dup = true;
    keys.add(nk);

    const ps = String(row.parseStatus ?? row.parse_status ?? '').toLowerCase();
    if (ps === 'complete') parseComplete += 1;
    else if (ps === 'partial') parsePartial += 1;
    else if (ps === 'invalid') parseInvalid += 1;

    if (row.airYards != null || row.air_yards != null) airAvail += 1;
    if (row.yac != null || row.yardsAfterCatch != null) yacAvail += 1;
  }

  const warnings = [...base.validation_warnings];
  let status = base.validation_status;
  if (dup) {
    status = 'VALIDATION_FAILED';
    warnings.push('duplicate (gameId, playId) natural keys');
  }

  return {
    validation_status: status,
    validation_warnings: warnings,
    record_count: decoded.length,
    coverage_metrics: {
      record_count: decoded.length,
      unique_game_count: games.size,
      parse_status_complete: parseComplete,
      parse_status_partial: parsePartial,
      parse_status_invalid: parseInvalid,
      air_yards_available_count: airAvail,
      yac_available_count: yacAvail,
    },
  };
}

function countAvailable(row, keys) {
  for (const k of keys) {
    if (row[k] != null) return 1;
  }
  return 0;
}

export function validatePassingTeamGames(decoded) {
  const base = validateTopLevelArray(decoded, 2026, 1);
  if (
    base.validation_status !== 'VALID' &&
    base.validation_status !== 'VALID_EMPTY'
  ) {
    return base;
  }
  if (base.validation_status === 'VALID_EMPTY') {
    return {
      ...base,
      coverage_metrics: {
        row_count: 0,
        unique_game_count: 0,
        unique_team_count: 0,
        offense_air_yards_attempts_available: 0,
        offense_total_yards_attempts_available: 0,
        offense_yac_attempts_available: 0,
        defense_air_yards_attempts_available: 0,
        defense_total_yards_attempts_available: 0,
        defense_yac_attempts_available: 0,
      },
    };
  }

  const keys = new Set();
  let dup = false;
  const games = new Set();
  const teams = new Set();
  let oa = 0;
  let ot = 0;
  let oy = 0;
  let da = 0;
  let dt = 0;
  let dy = 0;

  for (const row of decoded) {
    const gid = row.gameId ?? row.game_id;
    const team = row.team ?? row.teamId;
    if (gid != null) games.add(String(gid));
    if (team != null) teams.add(String(team));
    const nk = `${gid}::${team}`;
    if (keys.has(nk)) dup = true;
    keys.add(nk);

    oa += countAvailable(row, [
      'offenseAirYardsAttempts',
      'offense_air_yards_attempts',
    ]);
    ot += countAvailable(row, [
      'offenseTotalYardsAttempts',
      'offense_total_yards_attempts',
    ]);
    oy += countAvailable(row, ['offenseYacAttempts', 'offense_yac_attempts']);
    da += countAvailable(row, [
      'defenseAirYardsAttempts',
      'defense_air_yards_attempts',
    ]);
    dt += countAvailable(row, [
      'defenseTotalYardsAttempts',
      'defense_total_yards_attempts',
    ]);
    dy += countAvailable(row, ['defenseYacAttempts', 'defense_yac_attempts']);
  }

  const warnings = [...base.validation_warnings];
  let status = base.validation_status;
  if (dup) {
    status = 'VALIDATION_FAILED';
    warnings.push('duplicate (gameId, team) natural keys');
  }

  return {
    validation_status: status,
    validation_warnings: warnings,
    record_count: decoded.length,
    coverage_metrics: {
      row_count: decoded.length,
      unique_game_count: games.size,
      unique_team_count: teams.size,
      offense_air_yards_attempts_available: oa,
      offense_total_yards_attempts_available: ot,
      offense_yac_attempts_available: oy,
      defense_air_yards_attempts_available: da,
      defense_total_yards_attempts_available: dt,
      defense_yac_attempts_available: dy,
    },
  };
}

export function validateReturning(decoded) {
  const base = validateTopLevelArray(decoded, 2026, null);
  if (
    base.validation_status !== 'VALID' &&
    base.validation_status !== 'VALID_EMPTY'
  ) {
    return base;
  }
  const teams = new Set();
  if (Array.isArray(decoded)) {
    for (const row of decoded) {
      if (row.team != null) teams.add(String(row.team));
      else if (row.teamId != null) teams.add(String(row.teamId));
    }
  }
  return {
    ...base,
    coverage_metrics: { team_count: teams.size },
  };
}

export function validatePortal(decoded) {
  const base = validateTopLevelArray(decoded, 2026, null);
  if (
    base.validation_status !== 'VALID' &&
    base.validation_status !== 'VALID_EMPTY'
  ) {
    return base;
  }
  let destNull = 0;
  let ratingNull = 0;
  let transferNull = 0;
  if (Array.isArray(decoded)) {
    for (const row of decoded) {
      if (row.destination == null && row.destinationTeam == null) destNull += 1;
      if (row.rating == null) ratingNull += 1;
      if (row.transferDate == null && row.transfer_date == null)
        transferNull += 1;
    }
  }
  return {
    ...base,
    coverage_metrics: {
      entry_count: Array.isArray(decoded) ? decoded.length : 0,
      destination_null_count: destNull,
      rating_null_count: ratingNull,
      transfer_date_null_count: transferNull,
    },
  };
}

export function validateSource(sourceId, decoded) {
  switch (sourceId) {
    case 'core':
      return validateCore(decoded);
    case 'wepa_team':
      return validateWepa(decoded);
    case 'passing_plays':
      return validatePassingPlays(decoded);
    case 'passing_team_games':
      return validatePassingTeamGames(decoded);
    case 'returning':
      return validateReturning(decoded);
    case 'portal':
      return validatePortal(decoded);
    default:
      return {
        validation_status: 'VALIDATION_FAILED',
        validation_warnings: [`unknown source_id ${sourceId}`],
        record_count: null,
        coverage_metrics: {},
      };
  }
}

export function comparePassingGameIds(playsDecoded, teamGamesDecoded) {
  const fromPlays = new Set();
  const fromTg = new Set();
  if (Array.isArray(playsDecoded)) {
    for (const row of playsDecoded) {
      const gid = row.gameId ?? row.game_id;
      if (gid != null) fromPlays.add(String(gid));
    }
  }
  if (Array.isArray(teamGamesDecoded)) {
    for (const row of teamGamesDecoded) {
      const gid = row.gameId ?? row.game_id;
      if (gid != null) fromTg.add(String(gid));
    }
  }
  const both = [];
  const onlyPlays = [];
  const onlyTg = [];
  for (const g of fromPlays) {
    if (fromTg.has(g)) both.push(g);
    else onlyPlays.push(g);
  }
  for (const g of fromTg) {
    if (!fromPlays.has(g)) onlyTg.push(g);
  }
  both.sort();
  onlyPlays.sort();
  onlyTg.sort();
  return {
    games_in_both: both,
    games_only_in_plays: onlyPlays,
    games_only_in_team_games: onlyTg,
    warning:
      onlyPlays.length > 0 || onlyTg.length > 0
        ? 'passing plays vs team-games gameId sets differ'
        : null,
  };
}

// ---------------------------------------------------------------------------
// Sanitize (never leak secrets)
// ---------------------------------------------------------------------------

const SECRET_KEY_RE =
  /api[_-]?key|authorization|bearer|password|secret|token/i;

export function assertNoSecretsInObject(obj, pathLabel = 'root') {
  if (obj == null) return;
  if (typeof obj === 'string') {
    if (SECRET_KEY_RE.test(pathLabel)) {
      throw new Error(`secret-like field must not be serialized: ${pathLabel}`);
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoSecretsInObject(v, `${pathLabel}[${i}]`));
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (SECRET_KEY_RE.test(k)) {
        throw new Error(`secret-like key must not be serialized: ${k}`);
      }
      assertNoSecretsInObject(v, `${pathLabel}.${k}`);
    }
  }
}

export function safeLog(...args) {
  const joined = args.map(String).join(' ');
  if (/bearer\s+[a-z0-9._-]+/i.test(joined) || /CFBD_API_KEY\s*=\s*\S+/.test(joined)) {
    console.error('[cfbd-pit] refused to log secret-like material');
    return;
  }
  console.log(...args);
}

// ---------------------------------------------------------------------------
// HTTP capture (live path only)
// ---------------------------------------------------------------------------

function buildUrl(baseUrl, endpoint, params) {
  const u = new URL(baseUrl);
  u.pathname = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  u.search = '';
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, String(v));
  }
  return u;
}

async function fetchOnce(url, apiKey) {
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': `gridiron-edge-research/${CAPTURE_TOOL_VERSION}`,
    },
  });
  const buf = Buffer.from(await response.arrayBuffer());
  return {
    httpStatus: response.status,
    contentType: response.headers.get('content-type'),
    buffer: buf,
  };
}

async function captureSource({
  def,
  baseUrl,
  apiKey,
  rawDir,
  counters,
}) {
  const url = buildUrl(baseUrl, def.endpoint, def.params);
  let attempt = 0;
  let lastNetworkError = null;
  let lastHttp = null;
  let lastBuf = null;
  let lastContentType = null;
  const requestStarted = new Date();
  let responseReceived = null;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    counters.http_request_count += 1;
    try {
      const started = attempt === 1 ? requestStarted : new Date();
      if (attempt === 1) {
        // keep original requestStarted
      }
      void started;
      const result = await fetchOnce(url, apiKey);
      responseReceived = new Date();
      lastHttp = result.httpStatus;
      lastBuf = result.buffer;
      lastContentType = result.contentType;

      if (result.httpStatus === 200) break;

      if (
        !isRetryableFailure({ httpStatus: result.httpStatus }) ||
        attempt >= MAX_ATTEMPTS
      ) {
        break;
      }
      await sleepMs(250 * attempt);
    } catch (err) {
      lastNetworkError = true;
      responseReceived = new Date();
      if (
        !isRetryableFailure({ networkError: true }) ||
        attempt >= MAX_ATTEMPTS
      ) {
        break;
      }
      await sleepMs(250 * attempt);
    }
  }

  const entry = {
    source_id: def.source_id,
    endpoint: def.endpoint,
    request_parameters: { ...def.params },
    capture_role: def.capture_role,
    cadence: def.cadence,
    request_started_at: formatUtcIso(requestStarted),
    response_received_at: responseReceived
      ? formatUtcIso(responseReceived)
      : null,
    http_status: lastHttp,
    content_type: lastContentType,
    record_count: null,
    byte_length: lastBuf ? lastBuf.byteLength : null,
    payload_sha256: null,
    raw_file: null,
    validation_status: 'NETWORK_FAILED',
    validation_warnings: [],
    coverage_metrics: {},
    attempt_count: attempt,
  };

  if (lastBuf) {
    const rawPath = path.join(rawDir, def.raw_file);
    const hash = await persistRawBytes(rawPath, lastBuf);
    entry.payload_sha256 = hash;
    entry.raw_file = path.join('raw', def.raw_file).replace(/\\/g, '/');
    entry.byte_length = lastBuf.byteLength;

    if (lastHttp !== 200) {
      entry.validation_status = 'HTTP_FAILED';
      entry.validation_warnings.push(`http_status=${lastHttp}`);
      return entry;
    }

    let decoded;
    try {
      decoded = parseJsonBytes(lastBuf);
    } catch {
      entry.validation_status = 'VALIDATION_FAILED';
      entry.validation_warnings.push('malformed JSON');
      return entry;
    }

    const validated = validateSource(def.source_id, decoded);
    entry.validation_status = validated.validation_status;
    entry.validation_warnings = validated.validation_warnings;
    entry.record_count = validated.record_count;
    entry.coverage_metrics = validated.coverage_metrics;
    entry._decoded = decoded; // internal only; stripped before serialize
    return entry;
  }

  if (lastNetworkError) {
    entry.validation_status = 'NETWORK_FAILED';
    entry.validation_warnings.push('no HTTP response bytes received');
  }
  return entry;
}

function stripInternal(entry) {
  const { _decoded, ...rest } = entry;
  return rest;
}

function isUsableSuccess(status) {
  return status === 'VALID' || status === 'VALID_EMPTY';
}

export async function writeChecksumsFile(snapshotRoot, endpointEntries) {
  const lines = [];
  for (const e of endpointEntries) {
    if (!e.raw_file || !e.payload_sha256) continue;
    lines.push(`${e.payload_sha256}  ${e.raw_file}`);
  }
  lines.sort();
  const content = lines.length ? `${lines.join('\n')}\n` : '';
  const checksumPath = path.join(snapshotRoot, 'checksums.sha256');
  await writeFile(checksumPath, content, 'utf8');

  // Verify against disk
  for (const line of lines) {
    const [hash, rel] = line.split(/\s{2}/);
    const bytes = await readFile(path.join(snapshotRoot, rel));
    const actual = sha256Hex(bytes);
    if (actual !== hash) {
      throw new Error(`checksum mismatch for ${rel}`);
    }
  }
  return checksumPath;
}

export async function runSeedCapture({
  researchRoot,
  apiKey,
  baseUrl = process.env.CFBD_BASE_URL || DEFAULT_BASE_URL,
  now = new Date(),
  fetchImpl = null, // injectable for tests; null → real captureSource
}) {
  if (!apiKey) {
    throw new Error('CFBD_API_KEY is required for --capture-seed');
  }

  const batchStarted = now;
  const paths = buildSnapshotDir(researchRoot, batchStarted);
  await mkdir(paths.rawDir, { recursive: true });

  const counters = { http_request_count: 0 };
  const endpointEntries = [];
  const notes = [];

  for (const def of SOURCE_DEFINITIONS) {
    safeLog(`[cfbd-pit] capturing ${def.source_id} ${def.endpoint}`);
    let entry;
    if (fetchImpl) {
      entry = await fetchImpl({ def, rawDir: paths.rawDir, counters });
    } else {
      entry = await captureSource({
        def,
        baseUrl,
        apiKey,
        rawDir: paths.rawDir,
        counters,
      });
    }
    endpointEntries.push(entry);
  }

  // Local passing cross-check (no extra HTTP)
  const plays = endpointEntries.find((e) => e.source_id === 'passing_plays');
  const tg = endpointEntries.find((e) => e.source_id === 'passing_team_games');
  let passing_cross_check = null;
  if (
    plays &&
    tg &&
    isUsableSuccess(plays.validation_status) &&
    isUsableSuccess(tg.validation_status) &&
    plays._decoded &&
    tg._decoded
  ) {
    passing_cross_check = comparePassingGameIds(plays._decoded, tg._decoded);
    if (passing_cross_check.warning) {
      notes.push(passing_cross_check.warning);
      plays.validation_warnings.push(passing_cross_check.warning);
      tg.validation_warnings.push(passing_cross_check.warning);
    }
  }

  const batchCompleted = new Date();
  const capture_window_seconds =
    (batchCompleted.getTime() - batchStarted.getTime()) / 1000;
  if (capture_window_seconds > CAPTURE_WINDOW_TARGET_SECONDS) {
    notes.push(
      `capture_window_seconds=${capture_window_seconds.toFixed(1)} exceeded ${CAPTURE_WINDOW_TARGET_SECONDS}s target`
    );
  }

  const successful = endpointEntries.filter((e) =>
    isUsableSuccess(e.validation_status)
  ).length;
  let batch_status = 'FAILED';
  if (successful === SOURCE_DEFINITIONS.length) batch_status = 'COMPLETE';
  else if (successful > 0) batch_status = 'PARTIAL';

  const publicEndpoints = endpointEntries.map(stripInternal);

  await writeChecksumsFile(paths.snapshotRoot, publicEndpoints);

  const manifest = {
    schema_version: SCHEMA_VERSION,
    snapshot_id: paths.snapshotId,
    snapshot_kind: SEED_FIXED.snapshot_kind,
    season: SEED_FIXED.season,
    provider_week: SEED_FIXED.provider_week,
    provider_week_state: SEED_FIXED.provider_week_state,
    timezone: SEED_FIXED.timezone,
    batch_started_at_utc: formatUtcIso(batchStarted),
    batch_started_at_ct: formatChicagoIso(batchStarted),
    batch_completed_at_utc: formatUtcIso(batchCompleted),
    batch_completed_at_ct: formatChicagoIso(batchCompleted),
    capture_window_seconds,
    source: 'CFBD',
    base_url: baseUrl,
    capture_tool_version: CAPTURE_TOOL_VERSION,
    batch_status,
    notes,
    intended_source_count: SOURCE_DEFINITIONS.length,
    successful_source_count: successful,
    http_request_count: counters.http_request_count,
    returning_portal_designation: SEED_FIXED.returning_portal_designation,
    passing_cross_check: passing_cross_check
      ? {
          games_in_both_count: passing_cross_check.games_in_both.length,
          games_only_in_plays_count:
            passing_cross_check.games_only_in_plays.length,
          games_only_in_team_games_count:
            passing_cross_check.games_only_in_team_games.length,
          games_in_both: passing_cross_check.games_in_both,
          games_only_in_plays: passing_cross_check.games_only_in_plays,
          games_only_in_team_games: passing_cross_check.games_only_in_team_games,
        }
      : null,
    endpoints: publicEndpoints,
  };

  assertNoSecretsInObject(manifest);
  const manifestPath = path.join(paths.snapshotRoot, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return { paths, manifest, http_request_count: counters.http_request_count };
}

// ---------------------------------------------------------------------------
// Offline self-test (zero network)
// ---------------------------------------------------------------------------

export async function runSelfTest() {
  const failures = [];
  const ok = (name) => safeLog(`  PASS ${name}`);
  const fail = (name, err) => {
    failures.push(`${name}: ${err}`);
    console.error(`  FAIL ${name}: ${err}`);
  };

  safeLog('[cfbd-pit] --self-test starting (providerCalls=0)');

  // 1. Source manifest exactness
  try {
    if (SOURCE_DEFINITIONS.length !== 6) throw new Error('expected 6 sources');
    const ids = SOURCE_DEFINITIONS.map((s) => s.source_id);
    if (
      ids.join(',') !==
      'core,wepa_team,passing_plays,passing_team_games,returning,portal'
    ) {
      throw new Error(`order mismatch: ${ids.join(',')}`);
    }
    const expected = [
      ['/ratings/core', { year: '2026' }],
      ['/wepa/team/season', { year: '2026' }],
      [
        '/passing/plays',
        {
          year: '2026',
          week: '1',
          seasonType: 'regular',
          classification: 'fbs',
        },
      ],
      [
        '/passing/teams/games',
        {
          year: '2026',
          week: '1',
          seasonType: 'regular',
          classification: 'fbs',
        },
      ],
      ['/player/returning', { year: '2026' }],
      ['/player/portal', { year: '2026' }],
    ];
    SOURCE_DEFINITIONS.forEach((s, i) => {
      if (s.endpoint !== expected[i][0]) throw new Error(`endpoint ${i}`);
      if (JSON.stringify(s.params) !== JSON.stringify(expected[i][1])) {
        throw new Error(`params ${i}`);
      }
    });
    ok('six sources exact order/params');
  } catch (e) {
    fail('six sources', e.message || e);
  }

  // 2. Snapshot ID + Chicago date
  try {
    const fixed = new Date('2026-09-01T18:30:00.000Z');
    const id = buildSnapshotId(fixed);
    if (!/^cfbd-2026-w01-seed-partial-20260901T183000Z$/.test(id)) {
      throw new Error(`bad id ${id}`);
    }
    const cal = chicagoCalendarDate(fixed);
    if (cal !== '2026-09-01') throw new Error(`chicago date ${cal}`);
    const paths = buildSnapshotDir('/tmp/research-root', fixed, id);
    if (!paths.snapshotRoot.replace(/\\/g, '/').includes('/2026/2026-09-01/')) {
      throw new Error(`path ${paths.snapshotRoot}`);
    }
    ok('snapshot id + Chicago date path');
  } catch (e) {
    fail('snapshot id/path', e.message || e);
  }

  // 3. Raw buffer SHA-256 stability
  try {
    const dir = await mkdtemp(path.join(tmpdir(), 'cfbd-pit-'));
    const buf = Buffer.from('{"hello":"world","n":0}', 'utf8');
    const file = path.join(dir, 'raw', 'sample.json');
    const hash1 = await persistRawBytes(file, buf);
    const hash2 = sha256Hex(await readFile(file));
    if (hash1 !== hash2) throw new Error('hash mismatch after persist');
    // Ensure we did not pretty-print / rewrite
    const onDisk = await readFile(file);
    if (!onDisk.equals(buf)) throw new Error('bytes altered on disk');
    await rm(dir, { recursive: true, force: true });
    ok('raw Buffer SHA-256 matches disk');
  } catch (e) {
    fail('raw sha256', e.message || e);
  }

  // 4. VALID_EMPTY
  try {
    const r = validatePassingPlays([]);
    if (r.validation_status !== 'VALID_EMPTY') {
      throw new Error(r.validation_status);
    }
    ok('VALID_EMPTY');
  } catch (e) {
    fail('VALID_EMPTY', e.message || e);
  }

  // 5. Duplicate play keys
  try {
    const r = validatePassingPlays([
      { season: 2026, week: 1, gameId: 1, playId: 10 },
      { season: 2026, week: 1, gameId: 1, playId: 10 },
    ]);
    if (r.validation_status !== 'VALIDATION_FAILED') {
      throw new Error(r.validation_status);
    }
    ok('duplicate play natural key');
  } catch (e) {
    fail('duplicate play', e.message || e);
  }

  // 6. Wrong season/week
  try {
    const r = validatePassingPlays([
      { season: 2025, week: 1, gameId: 1, playId: 1 },
    ]);
    if (r.validation_status !== 'VALIDATION_FAILED') {
      throw new Error(`season ${r.validation_status}`);
    }
    const r2 = validatePassingPlays([
      { season: 2026, week: 2, gameId: 1, playId: 1 },
    ]);
    if (r2.validation_status !== 'VALIDATION_FAILED') {
      throw new Error(`week ${r2.validation_status}`);
    }
    ok('wrong season/week fails');
  } catch (e) {
    fail('season/week', e.message || e);
  }

  // 7. Passing cross-check
  try {
    const cmp = comparePassingGameIds(
      [
        { gameId: 'a', playId: 1 },
        { gameId: 'b', playId: 2 },
      ],
      [
        { gameId: 'b', team: 'X' },
        { gameId: 'c', team: 'Y' },
      ]
    );
    if (cmp.games_in_both.join() !== 'b') throw new Error('both');
    if (cmp.games_only_in_plays.join() !== 'a') throw new Error('plays');
    if (cmp.games_only_in_team_games.join() !== 'c') throw new Error('tg');
    ok('passing cross-source gameId compare');
  } catch (e) {
    fail('cross-check', e.message || e);
  }

  // 8. Retry decisions
  try {
    if (!isRetryableFailure({ httpStatus: 500 })) throw new Error('5xx');
    if (!isRetryableFailure({ networkError: true })) throw new Error('net');
    if (isRetryableFailure({ httpStatus: 400 })) throw new Error('400');
    if (isRetryableFailure({ httpStatus: 401 })) throw new Error('401');
    if (isRetryableFailure({ httpStatus: 403 })) throw new Error('403');
    if (isRetryableFailure({ httpStatus: 429 })) throw new Error('429');
    ok('retry policy');
  } catch (e) {
    fail('retry', e.message || e);
  }

  // 9. Secrets never in manifest
  try {
    const dir = await mkdtemp(path.join(tmpdir(), 'cfbd-pit-m-'));
    const fakeKey = 'TEST_KEY_SHOULD_NOT_APPEAR_' + randomUUID();
    let httpCount = 0;
    const { manifest } = await runSeedCapture({
      researchRoot: dir,
      apiKey: fakeKey,
      baseUrl: 'https://example.invalid',
      now: new Date('2026-09-01T18:00:00.000Z'),
      fetchImpl: async ({ def, rawDir, counters }) => {
        counters.http_request_count += 1;
        httpCount += 1;
        const payload =
          def.source_id === 'passing_plays' ||
          def.source_id === 'passing_team_games'
            ? Buffer.from('[]', 'utf8')
            : Buffer.from('[]', 'utf8');
        const hash = await persistRawBytes(
          path.join(rawDir, def.raw_file),
          payload
        );
        const validated = validateSource(def.source_id, []);
        return {
          source_id: def.source_id,
          endpoint: def.endpoint,
          request_parameters: { ...def.params },
          capture_role: def.capture_role,
          cadence: def.cadence,
          request_started_at: formatUtcIso(),
          response_received_at: formatUtcIso(),
          http_status: 200,
          content_type: 'application/json',
          record_count: 0,
          byte_length: payload.byteLength,
          payload_sha256: hash,
          raw_file: path.join('raw', def.raw_file).replace(/\\/g, '/'),
          validation_status: validated.validation_status,
          validation_warnings: validated.validation_warnings,
          coverage_metrics: validated.coverage_metrics,
          attempt_count: 1,
          _decoded: [],
        };
      },
    });
    const serialized = JSON.stringify(manifest);
    if (serialized.includes(fakeKey)) throw new Error('api key in manifest');
    if (/Authorization/i.test(serialized)) {
      throw new Error('Authorization in manifest');
    }
    assertNoSecretsInObject(manifest);
    if (httpCount !== 6) throw new Error(`httpCount=${httpCount}`);
    if (manifest.http_request_count !== 6) {
      throw new Error(`manifest http ${manifest.http_request_count}`);
    }
    if (manifest.endpoints.length !== 6) throw new Error('endpoints len');
    await rm(dir, { recursive: true, force: true });
    ok('no secrets in manifest; offline 6 synthetic sources');
  } catch (e) {
    fail('secrets/manifest', e.message || e);
  }

  // 10. No Prisma / production imports in this file
  try {
    const here = fileURLToPath(import.meta.url);
    const src = await readFile(here, 'utf8');
    if (/\bprisma\b/i.test(src) && /from ['"]@?prisma/.test(src)) {
      throw new Error('prisma import');
    }
    if (/from ['"].*compute_ratings/.test(src)) throw new Error('ratings');
    if (/from ['"].*lifecycle/.test(src)) throw new Error('lifecycle');
    ok('no production imports in capture script');
  } catch (e) {
    fail('imports', e.message || e);
  }

  // 11. .research-data ignored (check .gitignore text; git check-ignore if available)
  try {
    const gi = await readFile(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.gitignore'),
      'utf8'
    );
    if (!gi.split(/\r?\n/).some((l) => l.trim() === '.research-data/')) {
      throw new Error('.research-data/ missing from .gitignore');
    }
    ok('.research-data/ in .gitignore');
  } catch (e) {
    fail('gitignore', e.message || e);
  }

  safeLog(
    `[cfbd-pit] --self-test done failures=${failures.length} providerCalls=0`
  );
  if (failures.length) {
    console.error(failures.join('\n'));
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`CFBD PIT archive (research-only)

Usage:
  node scripts/research/capture-cfbd-pit.mjs --self-test
  node scripts/research/capture-cfbd-pit.mjs --capture-seed

--self-test     Offline checks only (zero network).
--capture-seed  Live CFBD capture for 2026 Week1 SEED PARTIAL (requires CFBD_API_KEY).

Output (live): .research-data/cfbd-pit/2026/<America-Chicago-date>/<snapshot_id>/
`);
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--self-test')) {
    const code = await runSelfTest();
    process.exitCode = code;
    return;
  }
  if (args.includes('--capture-seed')) {
    const apiKey = process.env.CFBD_API_KEY;
    if (!apiKey) {
      console.error('CFBD_API_KEY is required for --capture-seed');
      process.exitCode = 1;
      return;
    }
    const researchRoot = path.resolve(process.cwd(), '.research-data');
    const result = await runSeedCapture({
      researchRoot,
      apiKey,
      baseUrl: process.env.CFBD_BASE_URL || DEFAULT_BASE_URL,
    });
    safeLog(
      `[cfbd-pit] batch_status=${result.manifest.batch_status} snapshot_id=${result.manifest.snapshot_id} http_request_count=${result.http_request_count}`
    );
    safeLog(`[cfbd-pit] wrote ${result.paths.snapshotRoot}`);
    process.exitCode = result.manifest.batch_status === 'FAILED' ? 2 : 0;
    return;
  }
  printUsage();
  process.exitCode = 1;
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  main(process.argv).catch((err) => {
    console.error('[cfbd-pit] fatal:', err?.message || 'error');
    process.exitCode = 1;
  });
}
