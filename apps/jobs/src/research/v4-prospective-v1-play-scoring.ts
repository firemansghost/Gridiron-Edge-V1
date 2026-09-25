/**
 * V4 Prospective V1 — semantic play-level scoring provenance.
 *
 * Pure module. No providers, database access, or persistence.
 * Scoring values come from play semantics. Cumulative provider score state is
 * only a consistency/tie-breaker signal because the first live preview proved
 * those fields can be chronologically malformed.
 */

export interface ProspectivePlayScoreRow {
  gameId: string;
  driveId: string | null;
  driveNumber: number | null;
  playNumber: number | null;
  period: number | null;
  clockSeconds: number | null;
  wallclock: string | null;
  offense: string | null;
  defense: string | null;
  home: string | null;
  away: string | null;
  offenseScore: number | null;
  defenseScore: number | null;
  scoring: boolean;
  playType: string | null;
  playText: string | null;
}

export interface PlayScoreInvalidEvent {
  gameId: string;
  driveId: string | null;
  driveNumber: number | null;
  playNumber: number | null;
  playType: string | null;
  reason: string;
  pointCandidates: number[];
  sideCandidates: string[];
  homeDelta: number | null;
  awayDelta: number | null;
}

export interface PlayScoreEventDiagnostic {
  gameId: string;
  driveId: string;
  playType: string | null;
  scorerSide: 'offense' | 'defense';
  points: number;
  resolution:
    | 'score_exact'
    | 'semantic_fixed'
    | 'score_direction'
    | 'score_resolves_points';
  reportedHomeDelta: number | null;
  reportedAwayDelta: number | null;
  reportedScoreMatchesSyntheticAfterEvent: boolean | null;
}

export interface PlayGameFinalScore {
  gameId: string;
  homeProviderTeam: string;
  awayProviderTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface PlayScoringLedger {
  valid: boolean;
  playDriveIds: string[];
  scoringRows: number;
  validScoringEvents: number;
  invalidScoringEvents: number;
  scoreStateMismatchEvents: number;
  semanticFallbackEvents: number;
  maxSingleEventPoints: number;
  pointsByDriveTeam: Record<string, number>;
  gameFinalScores: PlayGameFinalScore[];
  eventDiagnostics: PlayScoreEventDiagnostic[];
  invalidEvents: PlayScoreInvalidEvent[];
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeProviderTeam(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).trim().toLowerCase().replace(/\s+/g, ' ');
  return s.length > 0 ? s : null;
}

export function driveTeamScoreKey(
  driveId: string,
  providerTeam: string
): string {
  return `${driveId}|${providerTeam}`;
}

function finiteInteger(value: unknown): number | null {
  const n = finiteNumber(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

function wallclockMs(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function orderingValue(value: number | null): number {
  return value !== null && Number.isFinite(value)
    ? value
    : Number.MAX_SAFE_INTEGER;
}

function scoringSort(a: ProspectivePlayScoreRow, b: ProspectivePlayScoreRow) {
  const ap = orderingValue(a.period);
  const bp = orderingValue(b.period);
  if (ap !== bp) return ap - bp;

  if (ap <= 4) {
    const ac = a.clockSeconds;
    const bc = b.clockSeconds;
    if (ac !== null && bc !== null && ac !== bc) return bc - ac;
    const wc = wallclockMs(a.wallclock) - wallclockMs(b.wallclock);
    if (wc !== 0) return wc;
  } else {
    const wc = wallclockMs(a.wallclock) - wallclockMs(b.wallclock);
    if (wc !== 0) return wc;
  }

  const driveDelta =
    orderingValue(a.driveNumber) - orderingValue(b.driveNumber);
  if (driveDelta !== 0) return driveDelta;
  return orderingValue(a.playNumber) - orderingValue(b.playNumber);
}

function fixedScoreboard(row: ProspectivePlayScoreRow): {
  homeKey: string;
  awayKey: string;
  homeScore: number;
  awayScore: number;
} | null {
  const homeKey = normalizeProviderTeam(row.home);
  const awayKey = normalizeProviderTeam(row.away);
  const offenseKey = normalizeProviderTeam(row.offense);
  const defenseKey = normalizeProviderTeam(row.defense);
  const offenseScore = finiteInteger(row.offenseScore);
  const defenseScore = finiteInteger(row.defenseScore);

  if (
    !homeKey ||
    !awayKey ||
    !offenseKey ||
    !defenseKey ||
    offenseScore === null ||
    defenseScore === null ||
    offenseScore < 0 ||
    defenseScore < 0
  ) {
    return null;
  }

  if (offenseKey === homeKey && defenseKey === awayKey) {
    return {
      homeKey,
      awayKey,
      homeScore: offenseScore,
      awayScore: defenseScore,
    };
  }
  if (offenseKey === awayKey && defenseKey === homeKey) {
    return {
      homeKey,
      awayKey,
      homeScore: defenseScore,
      awayScore: offenseScore,
    };
  }
  return null;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function semanticPointCandidates(
  row: ProspectivePlayScoreRow
): number[] {
  const playType = (row.playType ?? '').trim();
  const text = (row.playText ?? '').toUpperCase();
  const typeUpper = playType.toUpperCase();

  if (playType === 'Field Goal Good') return [3];
  if (
    playType === 'Safety' ||
    (text.includes('SAFETY') &&
      !text.includes('TOUCHDOWN') &&
      !/\bTD\b/.test(text))
  ) {
    return [2];
  }
  if (playType === 'Defensive 2pt Conversion') return [2];
  if (playType === 'Two Point Rush' || playType === 'Two Point Pass') {
    return [2];
  }

  let touchdown =
    typeUpper.includes('TOUCHDOWN') ||
    text.includes('TOUCHDOWN') ||
    /\bTD\b/.test(text);

  if (
    (playType === 'Fumble Recovery (Opponent)' ||
      playType === 'Fumble Recovery (Own)') &&
    /\([^)]+(?:KICK|TWO[- ]POINT|2 PT|2-PT|2PT)/.test(text)
  ) {
    touchdown = true;
  }

  if (!touchdown) return [];

  const patFailed =
    text.includes('PAT MISSED') ||
    text.includes('PAT FAILED') ||
    text.includes('KICK ATTEMPT FAILED') ||
    text.includes('KICK ATTEMPT NO GOOD') ||
    text.includes('KICK ATTEMPT MISSED') ||
    /\bKICK\b[^)]*(?:FAILED|NO GOOD|MISSED)/.test(text);

  const twoPointPresent =
    text.includes('TWO-POINT') ||
    text.includes('TWO POINT') ||
    text.includes('2 PT') ||
    text.includes('2-PT') ||
    text.includes('2PT');

  const twoPointFailed =
    twoPointPresent &&
    (text.includes('FAILED') ||
      text.includes('FAIL') ||
      text.includes('NO GOOD'));

  const twoPointExplicitSuccess =
    (twoPointPresent &&
      !twoPointFailed &&
      (text.includes('GOOD') ||
        text.includes('SUCCESSFUL') ||
        text.includes('SUCCESS'))) ||
    ((!twoPointFailed &&
      (text.includes('PASS ATTEMPT SUCCESSFUL') ||
        text.includes('RUSH ATTEMPT SUCCESSFUL'))));

  const kickGood =
    !patFailed &&
    (text.includes('KICK ATTEMPT GOOD') ||
      /\([^)]+\sKICK\)/.test(text));

  if (patFailed || twoPointFailed) return [6];
  if (twoPointExplicitSuccess) return [8];
  if (kickGood) return [7];
  if (twoPointPresent) return [6, 8];

  // Some provider summary rows omit the conversion result entirely.
  // Keep all football-valid possibilities and require score-state resolution.
  return [6, 7, 8];
}

function semanticSideCandidates(
  row: ProspectivePlayScoreRow
): Array<'offense' | 'defense'> {
  const playType = (row.playType ?? '').trim();
  const text = (row.playText ?? '').toUpperCase();

  // Provider offense/defense orientation for safeties is inconsistent.
  if (playType === 'Safety') return ['offense', 'defense'];

  if (playType === 'Fumble Recovery (Own)') {
    return ['offense', 'defense'];
  }

  const defensiveTypes = new Set([
    'Interception Return Touchdown',
    'Pass Interception Return',
    'Fumble Return Touchdown',
    'Fumble Recovery (Opponent)',
    'Blocked Punt Touchdown',
    'Blocked Field Goal Touchdown',
    'Punt Return Touchdown',
    'Punt Return',
    'Kickoff Return Touchdown',
    'Defensive 2pt Conversion',
  ]);
  if (defensiveTypes.has(playType)) return ['defense'];

  const offensiveTypes = new Set([
    'Field Goal Good',
    'Rushing Touchdown',
    'Passing Touchdown',
    'Pass Reception',
    'Rush',
    'Two Point Rush',
    'Two Point Pass',
  ]);
  if (offensiveTypes.has(playType)) return ['offense'];

  if (
    (playType === 'Kickoff' || playType === 'Punt') &&
    (text.includes('TOUCHDOWN') || /\bTD\b/.test(text))
  ) {
    return ['defense'];
  }

  if (playType === 'Fumble' && text.includes('SAFETY')) {
    return ['defense'];
  }

  if (
    (text.includes('INTERCEPTED BY') || text.includes('BLOCKED')) &&
    (text.includes('TOUCHDOWN') || /\bTD\b/.test(text))
  ) {
    return ['defense'];
  }

  return ['offense', 'defense'];
}

function scoringTeamForSide(
  row: ProspectivePlayScoreRow,
  side: 'offense' | 'defense'
): string | null {
  return normalizeProviderTeam(
    side === 'offense' ? row.offense : row.defense
  );
}

function resolveScoringEvent(input: {
  row: ProspectivePlayScoreRow;
  homeKey: string;
  awayKey: string;
  syntheticHomeScore: number;
  syntheticAwayScore: number;
}):
  | {
      ok: true;
      side: 'offense' | 'defense';
      points: number;
      resolution: PlayScoreEventDiagnostic['resolution'];
      homeDelta: number | null;
      awayDelta: number | null;
      fixed: ReturnType<typeof fixedScoreboard>;
    }
  | {
      ok: false;
      reason: string;
      pointCandidates: number[];
      sideCandidates: Array<'offense' | 'defense'>;
      homeDelta: number | null;
      awayDelta: number | null;
    } {
  const pointCandidates = semanticPointCandidates(input.row);
  const sideCandidates = semanticSideCandidates(input.row);
  const fixed = fixedScoreboard(input.row);
  const homeDelta = fixed
    ? fixed.homeScore - input.syntheticHomeScore
    : null;
  const awayDelta = fixed
    ? fixed.awayScore - input.syntheticAwayScore
    : null;

  if (pointCandidates.length === 0) {
    return {
      ok: false,
      reason: 'unclassified_scoring_value',
      pointCandidates,
      sideCandidates,
      homeDelta,
      awayDelta,
    };
  }

  const exact: Array<{
    side: 'offense' | 'defense';
    points: number;
  }> = [];

  if (homeDelta !== null && awayDelta !== null) {
    for (const side of sideCandidates) {
      const scorer = scoringTeamForSide(input.row, side);
      if (!scorer) continue;
      const scorerIsHome = scorer === input.homeKey;
      const scorerIsAway = scorer === input.awayKey;
      if (!scorerIsHome && !scorerIsAway) continue;

      for (const points of pointCandidates) {
        if (
          scorerIsHome &&
          homeDelta === points &&
          awayDelta === 0
        ) {
          exact.push({ side, points });
        }
        if (
          scorerIsAway &&
          awayDelta === points &&
          homeDelta === 0
        ) {
          exact.push({ side, points });
        }
      }
    }
  }

  const exactUnique = unique(
    exact.map((x) => `${x.side}|${x.points}`)
  ).map((key) => {
    const [side, points] = key.split('|');
    return {
      side: side as 'offense' | 'defense',
      points: Number(points),
    };
  });

  if (exactUnique.length === 1) {
    return {
      ok: true,
      ...exactUnique[0],
      resolution: 'score_exact',
      homeDelta,
      awayDelta,
      fixed,
    };
  }

  if (sideCandidates.length === 1 && pointCandidates.length === 1) {
    return {
      ok: true,
      side: sideCandidates[0],
      points: pointCandidates[0],
      resolution: 'semantic_fixed',
      homeDelta,
      awayDelta,
      fixed,
    };
  }

  if (
    pointCandidates.length === 1 &&
    homeDelta !== null &&
    awayDelta !== null
  ) {
    let scorerFixed: 'home' | 'away' | null = null;
    if (homeDelta > 0 && awayDelta === 0) scorerFixed = 'home';
    if (awayDelta > 0 && homeDelta === 0) scorerFixed = 'away';

    if (scorerFixed) {
      const matchingSides = sideCandidates.filter((side) => {
        const scorer = scoringTeamForSide(input.row, side);
        return (
          (scorerFixed === 'home' && scorer === input.homeKey) ||
          (scorerFixed === 'away' && scorer === input.awayKey)
        );
      });
      if (matchingSides.length === 1) {
        return {
          ok: true,
          side: matchingSides[0],
          points: pointCandidates[0],
          resolution: 'score_direction',
          homeDelta,
          awayDelta,
          fixed,
        };
      }
    }
  }

  if (
    sideCandidates.length === 1 &&
    homeDelta !== null &&
    awayDelta !== null
  ) {
    const scorer = scoringTeamForSide(input.row, sideCandidates[0]);
    const scorerDelta =
      scorer === input.homeKey
        ? homeDelta
        : scorer === input.awayKey
          ? awayDelta
          : null;
    const otherDelta =
      scorer === input.homeKey
        ? awayDelta
        : scorer === input.awayKey
          ? homeDelta
          : null;

    if (
      scorerDelta !== null &&
      otherDelta === 0 &&
      pointCandidates.includes(scorerDelta)
    ) {
      return {
        ok: true,
        side: sideCandidates[0],
        points: scorerDelta,
        resolution: 'score_resolves_points',
        homeDelta,
        awayDelta,
        fixed,
      };
    }
  }

  return {
    ok: false,
    reason: 'ambiguous_scoring_event',
    pointCandidates,
    sideCandidates,
    homeDelta,
    awayDelta,
  };
}

export function buildPlayScoringLedger(
  rows: readonly ProspectivePlayScoreRow[]
): PlayScoringLedger {
  const playDriveIds = Array.from(
    new Set(
      rows
        .map((r) =>
          typeof r.driveId === 'string' ? r.driveId.trim() : ''
        )
        .filter(Boolean)
    )
  ).sort();

  const scoringRows = rows.filter((r) => r.scoring === true);
  const byGame = new Map<string, ProspectivePlayScoreRow[]>();
  for (const row of scoringRows) {
    const gameId = String(row.gameId ?? '').trim();
    const list = byGame.get(gameId) ?? [];
    list.push(row);
    byGame.set(gameId, list);
  }

  const invalidEvents: PlayScoreInvalidEvent[] = [];
  const eventDiagnostics: PlayScoreEventDiagnostic[] = [];
  const pointsByDriveTeam: Record<string, number> = Object.create(null);
  const gameFinalScores: PlayGameFinalScore[] = [];
  let validScoringEvents = 0;
  let maxSingleEventPoints = 0;
  let scoreStateMismatchEvents = 0;
  let semanticFallbackEvents = 0;

  for (const [gameId, gameRows] of byGame.entries()) {
    const sorted = [...gameRows].sort(scoringSort);
    const firstFixed = sorted
      .map(fixedScoreboard)
      .find((value) => value !== null);

    if (!firstFixed) {
      invalidEvents.push({
        gameId,
        driveId: null,
        driveNumber: null,
        playNumber: null,
        playType: null,
        reason: 'missing_game_home_away_score_identity',
        pointCandidates: [],
        sideCandidates: [],
        homeDelta: null,
        awayDelta: null,
      });
      continue;
    }

    const homeKey = firstFixed.homeKey;
    const awayKey = firstFixed.awayKey;
    let syntheticHomeScore = 0;
    let syntheticAwayScore = 0;

    for (const row of sorted) {
      const driveId =
        typeof row.driveId === 'string' && row.driveId.trim()
          ? row.driveId.trim()
          : null;
      const period = finiteInteger(row.period);
      const playNumber = finiteInteger(row.playNumber);

      if (!driveId || period === null || playNumber === null) {
        invalidEvents.push({
          gameId,
          driveId,
          driveNumber: row.driveNumber,
          playNumber: row.playNumber,
          playType: row.playType,
          reason: !driveId
            ? 'missing_drive_id'
            : period === null
              ? 'missing_or_invalid_period'
              : 'missing_or_invalid_play_number',
          pointCandidates: semanticPointCandidates(row),
          sideCandidates: semanticSideCandidates(row),
          homeDelta: null,
          awayDelta: null,
        });
        continue;
      }

      const rowHome = normalizeProviderTeam(row.home);
      const rowAway = normalizeProviderTeam(row.away);
      if (rowHome !== homeKey || rowAway !== awayKey) {
        invalidEvents.push({
          gameId,
          driveId,
          driveNumber: row.driveNumber,
          playNumber: row.playNumber,
          playType: row.playType,
          reason: 'home_away_identity_changed_within_game',
          pointCandidates: semanticPointCandidates(row),
          sideCandidates: semanticSideCandidates(row),
          homeDelta: null,
          awayDelta: null,
        });
        continue;
      }

      const resolved = resolveScoringEvent({
        row,
        homeKey,
        awayKey,
        syntheticHomeScore,
        syntheticAwayScore,
      });

      if ('reason' in resolved) {
        invalidEvents.push({
          gameId,
          driveId,
          driveNumber: row.driveNumber,
          playNumber: row.playNumber,
          playType: row.playType,
          reason: resolved.reason,
          pointCandidates: resolved.pointCandidates,
          sideCandidates: resolved.sideCandidates,
          homeDelta: resolved.homeDelta,
          awayDelta: resolved.awayDelta,
        });
        continue;
      }

      const scorer = scoringTeamForSide(row, resolved.side);
      if (!scorer || (scorer !== homeKey && scorer !== awayKey)) {
        invalidEvents.push({
          gameId,
          driveId,
          driveNumber: row.driveNumber,
          playNumber: row.playNumber,
          playType: row.playType,
          reason: 'resolved_scorer_not_home_or_away',
          pointCandidates: [resolved.points],
          sideCandidates: [resolved.side],
          homeDelta: resolved.homeDelta,
          awayDelta: resolved.awayDelta,
        });
        continue;
      }

      if (scorer === homeKey) syntheticHomeScore += resolved.points;
      else syntheticAwayScore += resolved.points;

      const key = driveTeamScoreKey(driveId, scorer);
      pointsByDriveTeam[key] =
        (pointsByDriveTeam[key] ?? 0) + resolved.points;

      const fixed = resolved.fixed;
      const reportedMatchesSynthetic =
        fixed === null
          ? null
          : fixed.homeScore === syntheticHomeScore &&
            fixed.awayScore === syntheticAwayScore;

      if (reportedMatchesSynthetic === false) {
        scoreStateMismatchEvents += 1;
      }
      if (resolved.resolution !== 'score_exact') {
        semanticFallbackEvents += 1;
      }

      eventDiagnostics.push({
        gameId,
        driveId,
        playType: row.playType,
        scorerSide: resolved.side,
        points: resolved.points,
        resolution: resolved.resolution,
        reportedHomeDelta: resolved.homeDelta,
        reportedAwayDelta: resolved.awayDelta,
        reportedScoreMatchesSyntheticAfterEvent: reportedMatchesSynthetic,
      });

      validScoringEvents += 1;
      maxSingleEventPoints = Math.max(
        maxSingleEventPoints,
        resolved.points
      );
    }

    gameFinalScores.push({
      gameId,
      homeProviderTeam: homeKey,
      awayProviderTeam: awayKey,
      homeScore: syntheticHomeScore,
      awayScore: syntheticAwayScore,
    });
  }

  return {
    valid: invalidEvents.length === 0,
    playDriveIds,
    scoringRows: scoringRows.length,
    validScoringEvents,
    invalidScoringEvents: invalidEvents.length,
    scoreStateMismatchEvents,
    semanticFallbackEvents,
    maxSingleEventPoints,
    pointsByDriveTeam,
    gameFinalScores: gameFinalScores.sort((a, b) =>
      a.gameId.localeCompare(b.gameId)
    ),
    eventDiagnostics,
    invalidEvents,
  };
}

export function playDerivedDriveOffensePoints(input: {
  ledger: PlayScoringLedger;
  driveId: string | null;
  offenseProviderTeam: string | null;
}): number | null {
  if (!input.ledger.valid || !input.driveId) return null;
  const offenseKey = normalizeProviderTeam(input.offenseProviderTeam);
  if (!offenseKey) return null;
  if (!input.ledger.playDriveIds.includes(input.driveId)) return null;
  return (
    input.ledger.pointsByDriveTeam[
      driveTeamScoreKey(input.driveId, offenseKey)
    ] ?? 0
  );
}
