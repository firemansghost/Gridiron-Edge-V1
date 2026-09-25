/**
 * V4 Prospective V1 — play-level scoring provenance.
 *
 * Pure module. No providers, database access, or persistence.
 * Converts CFBD play-level cumulative score state into a fixed-team scoring
 * ledger keyed by drive ID and provider team name.
 */

export interface ProspectivePlayScoreRow {
  gameId: string;
  driveId: string | null;
  driveNumber: number | null;
  playNumber: number | null;
  period: number | null;
  offense: string | null;
  defense: string | null;
  home: string | null;
  away: string | null;
  offenseScore: number | null;
  defenseScore: number | null;
  scoring: boolean;
}

export interface PlayScoreInvalidEvent {
  gameId: string;
  driveId: string | null;
  driveNumber: number | null;
  playNumber: number | null;
  reason: string;
  homeDelta: number | null;
  awayDelta: number | null;
}

export interface PlayScoringLedger {
  valid: boolean;
  playDriveIds: string[];
  scoringRows: number;
  validScoringEvents: number;
  invalidScoringEvents: number;
  maxSingleTeamIncrement: number;
  pointsByDriveTeam: Record<string, number>;
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

function ordinal(value: number | null): number {
  return value !== null && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
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
  const offenseScore = finiteNumber(row.offenseScore);
  const defenseScore = finiteNumber(row.defenseScore);

  if (
    !homeKey ||
    !awayKey ||
    !offenseKey ||
    !defenseKey ||
    offenseScore === null ||
    defenseScore === null ||
    offenseScore < 0 ||
    defenseScore < 0 ||
    !Number.isInteger(offenseScore) ||
    !Number.isInteger(defenseScore)
  ) {
    return null;
  }

  if (offenseKey === homeKey && defenseKey === awayKey) {
    return { homeKey, awayKey, homeScore: offenseScore, awayScore: defenseScore };
  }
  if (offenseKey === awayKey && defenseKey === homeKey) {
    return { homeKey, awayKey, homeScore: defenseScore, awayScore: offenseScore };
  }
  return null;
}

export function buildPlayScoringLedger(
  rows: readonly ProspectivePlayScoreRow[]
): PlayScoringLedger {
  const playDriveIds = Array.from(
    new Set(
      rows
        .map((r) => (typeof r.driveId === 'string' ? r.driveId.trim() : ''))
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
  const pointsByDriveTeam: Record<string, number> = Object.create(null);
  let validScoringEvents = 0;
  let maxSingleTeamIncrement = 0;

  for (const [gameId, gameRows] of byGame.entries()) {
    const sorted = [...gameRows].sort((a, b) => {
      const periodDelta = ordinal(a.period) - ordinal(b.period);
      if (periodDelta !== 0) return periodDelta;
      const driveDelta = ordinal(a.driveNumber) - ordinal(b.driveNumber);
      if (driveDelta !== 0) return driveDelta;
      return ordinal(a.playNumber) - ordinal(b.playNumber);
    });

    let knownHome: string | null = null;
    let knownAway: string | null = null;
    let previousHomeScore = 0;
    let previousAwayScore = 0;

    for (const row of sorted) {
      const fixed = fixedScoreboard(row);
      const driveId =
        typeof row.driveId === 'string' && row.driveId.trim()
          ? row.driveId.trim()
          : null;

      if (!fixed || !driveId) {
        invalidEvents.push({
          gameId,
          driveId,
          driveNumber: row.driveNumber,
          playNumber: row.playNumber,
          reason: !driveId
            ? 'missing_drive_id'
            : 'invalid_fixed_scoreboard_fields',
          homeDelta: null,
          awayDelta: null,
        });
        continue;
      }

      if (knownHome === null) {
        knownHome = fixed.homeKey;
        knownAway = fixed.awayKey;
      } else if (knownHome !== fixed.homeKey || knownAway !== fixed.awayKey) {
        invalidEvents.push({
          gameId,
          driveId,
          driveNumber: row.driveNumber,
          playNumber: row.playNumber,
          reason: 'home_away_identity_changed_within_game',
          homeDelta: null,
          awayDelta: null,
        });
        continue;
      }

      const homeDelta = fixed.homeScore - previousHomeScore;
      const awayDelta = fixed.awayScore - previousAwayScore;
      const bothScore = homeDelta > 0 && awayDelta > 0;
      const noScore = homeDelta === 0 && awayDelta === 0;
      const impossible =
        homeDelta < 0 ||
        awayDelta < 0 ||
        homeDelta > 8 ||
        awayDelta > 8 ||
        bothScore ||
        noScore;

      if (impossible) {
        invalidEvents.push({
          gameId,
          driveId,
          driveNumber: row.driveNumber,
          playNumber: row.playNumber,
          reason:
            homeDelta < 0 || awayDelta < 0
              ? 'score_regression'
              : homeDelta > 8 || awayDelta > 8
                ? 'single_scoring_event_increment_gt_8'
                : bothScore
                  ? 'both_teams_incremented_on_one_scoring_event'
                  : 'scoring_row_without_score_increment',
          homeDelta,
          awayDelta,
        });
        continue;
      }

      if (homeDelta > 0) {
        const key = driveTeamScoreKey(driveId, fixed.homeKey);
        pointsByDriveTeam[key] = (pointsByDriveTeam[key] ?? 0) + homeDelta;
        maxSingleTeamIncrement = Math.max(maxSingleTeamIncrement, homeDelta);
      }
      if (awayDelta > 0) {
        const key = driveTeamScoreKey(driveId, fixed.awayKey);
        pointsByDriveTeam[key] = (pointsByDriveTeam[key] ?? 0) + awayDelta;
        maxSingleTeamIncrement = Math.max(maxSingleTeamIncrement, awayDelta);
      }

      previousHomeScore = fixed.homeScore;
      previousAwayScore = fixed.awayScore;
      validScoringEvents += 1;
    }
  }

  return {
    valid: invalidEvents.length === 0,
    playDriveIds,
    scoringRows: scoringRows.length,
    validScoringEvents,
    invalidScoringEvents: invalidEvents.length,
    maxSingleTeamIncrement,
    pointsByDriveTeam,
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
