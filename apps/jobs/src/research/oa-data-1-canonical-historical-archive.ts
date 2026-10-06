export const OA_DATA_1_VERSION =
  'oa_data_1_canonical_historical_team_game_archive_v1' as const;

export type OaData1Status = 'AVAILABLE' | 'SOURCE_UNAVAILABLE';
export type OaData1SourceMethod =
  | 'DIRECT_PROVIDER_ROW'
  | 'SOURCE_UNAVAILABLE';

export interface OaData1GameRow {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate?: string | null;
  completed: boolean;
  neutralSite?: boolean | null;
  homeTeam: string;
  awayTeam: string;
  homeClassification?: string | null;
  awayClassification?: string | null;
}

export interface OaData1AdvancedRow {
  gameId: number;
  season: number;
  seasonType: string;
  week: number;
  team: string;
  opponent: string;
  offense?: {
    ppa?: number | null;
    successRate?: number | null;
  } | null;
  defense?: {
    ppa?: number | null;
    successRate?: number | null;
  } | null;
}

export interface OaData1SourceMeta {
  season: 2022 | 2023 | 2024 | 2025;
  artifactId: number;
  artifactZipSha256: string;
  sourceEndpoint: '/stats/game/advanced';
  sourceRawMember: 'raw/003-advanced-game-stats.json';
}

export interface OaData1ArchiveRow {
  contractVersion: typeof OA_DATA_1_VERSION;
  season: number;
  providerGameId: number;
  providerWeek: number;
  startDate: string | null;
  neutralSite: boolean | null;
  homeTeam: string;
  awayTeam: string;
  team: string;
  opponent: string;
  isHome: boolean;
  status: OaData1Status;
  ppaOff: number | null;
  ppaDef: number | null;
  successOff: number | null;
  successDef: number | null;
  sourceSeason: number;
  sourceArtifactId: number;
  sourceArtifactZipSha256: string;
  sourceEndpoint: '/stats/game/advanced';
  sourceRawMember: 'raw/003-advanced-game-stats.json';
  sourceMethod: OaData1SourceMethod;
}

export interface OaData1GapRow {
  season: number;
  providerGameId: number;
  providerWeek: number;
  team: string;
  opponent: string;
  isHome: boolean;
  reason: 'SOURCE_ROW_UNAVAILABLE';
}

export interface OaData1SeasonBuild {
  season: number;
  canonicalGames: number;
  rows: OaData1ArchiveRow[];
  gaps: OaData1GapRow[];
  duplicateAdvancedKeys: number;
}

export interface OaData1ArchiveBuild {
  rows: OaData1ArchiveRow[];
  gaps: OaData1GapRow[];
  coverage: Array<{
    season: number;
    canonicalGames: number;
    expectedTeamSideRows: number;
    availableRows: number;
    unavailableRows: number;
  }>;
}

const FROZEN_EXPECTATIONS = {
  2022: { games: 734, rows: 1468, available: 1468, unavailable: 0 },
  2023: { games: 750, rows: 1500, available: 1500, unavailable: 0 },
  2024: { games: 752, rows: 1504, available: 1496, unavailable: 8 },
  2025: { games: 762, rows: 1524, available: 1524, unavailable: 0 },
} as const;

export const OA_DATA_1_2024_UNAVAILABLE_GAME_IDS = [
  401641034,
  401645328,
  401644689,
  401644780,
] as const;

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function advancedKey(gameId: number, team: string): string {
  return `${gameId}|${team}`;
}

function isCanonicalGame(game: OaData1GameRow, season: number): boolean {
  return (
    game.season === season &&
    normalized(game.seasonType).toLowerCase() === 'regular' &&
    game.completed === true &&
    normalized(game.homeClassification).toLowerCase() === 'fbs' &&
    normalized(game.awayClassification).toLowerCase() === 'fbs'
  );
}

export function buildCanonicalSeasonRows(input: {
  season: 2022 | 2023 | 2024 | 2025;
  games: OaData1GameRow[];
  advancedRows: OaData1AdvancedRow[];
  source: OaData1SourceMeta;
}): OaData1SeasonBuild {
  if (input.source.season !== input.season) {
    throw new Error('oa_data_1_source_season_mismatch');
  }

  const canonicalGames = input.games
    .filter((game) => isCanonicalGame(game, input.season))
    .sort((a, b) => a.id - b.id);

  const advancedByKey = new Map<string, OaData1AdvancedRow>();
  let duplicateAdvancedKeys = 0;

  for (const row of input.advancedRows) {
    if (
      row.season !== input.season ||
      normalized(row.seasonType).toLowerCase() !== 'regular'
    ) {
      continue;
    }
    const team = normalized(row.team);
    if (!Number.isInteger(row.gameId) || !team) {
      throw new Error('oa_data_1_invalid_advanced_identity');
    }
    const key = advancedKey(row.gameId, team);
    if (advancedByKey.has(key)) {
      duplicateAdvancedKeys += 1;
      continue;
    }
    advancedByKey.set(key, row);
  }

  if (duplicateAdvancedKeys > 0) {
    throw new Error(
      `oa_data_1_duplicate_advanced_keys:${input.season}:${duplicateAdvancedKeys}`
    );
  }

  const rows: OaData1ArchiveRow[] = [];
  const gaps: OaData1GapRow[] = [];

  for (const game of canonicalGames) {
    const homeTeam = normalized(game.homeTeam);
    const awayTeam = normalized(game.awayTeam);
    if (!homeTeam || !awayTeam || homeTeam === awayTeam) {
      throw new Error(`oa_data_1_invalid_game_identity:${game.id}`);
    }

    const sides = [
      { team: homeTeam, opponent: awayTeam, isHome: true },
      { team: awayTeam, opponent: homeTeam, isHome: false },
    ] as const;

    for (const side of sides) {
      const sourceRow = advancedByKey.get(
        advancedKey(game.id, side.team)
      );

      if (!sourceRow) {
        rows.push({
          contractVersion: OA_DATA_1_VERSION,
          season: input.season,
          providerGameId: game.id,
          providerWeek: game.week,
          startDate: game.startDate ?? null,
          neutralSite:
            typeof game.neutralSite === 'boolean' ? game.neutralSite : null,
          homeTeam,
          awayTeam,
          team: side.team,
          opponent: side.opponent,
          isHome: side.isHome,
          status: 'SOURCE_UNAVAILABLE',
          ppaOff: null,
          ppaDef: null,
          successOff: null,
          successDef: null,
          sourceSeason: input.source.season,
          sourceArtifactId: input.source.artifactId,
          sourceArtifactZipSha256: input.source.artifactZipSha256,
          sourceEndpoint: input.source.sourceEndpoint,
          sourceRawMember: input.source.sourceRawMember,
          sourceMethod: 'SOURCE_UNAVAILABLE',
        });
        gaps.push({
          season: input.season,
          providerGameId: game.id,
          providerWeek: game.week,
          team: side.team,
          opponent: side.opponent,
          isHome: side.isHome,
          reason: 'SOURCE_ROW_UNAVAILABLE',
        });
        continue;
      }

      if (
        sourceRow.gameId !== game.id ||
        sourceRow.week !== game.week ||
        normalized(sourceRow.team) !== side.team ||
        normalized(sourceRow.opponent) !== side.opponent
      ) {
        throw new Error(
          `oa_data_1_advanced_orientation_mismatch:${input.season}:${game.id}:${side.team}`
        );
      }

      const ppaOff = sourceRow.offense?.ppa;
      const ppaDef = sourceRow.defense?.ppa;
      const successOff = sourceRow.offense?.successRate;
      const successDef = sourceRow.defense?.successRate;

      if (
        !finite(ppaOff) ||
        !finite(ppaDef) ||
        !finite(successOff) ||
        !finite(successDef)
      ) {
        throw new Error(
          `oa_data_1_nonfinite_selected_metric:${input.season}:${game.id}:${side.team}`
        );
      }

      rows.push({
        contractVersion: OA_DATA_1_VERSION,
        season: input.season,
        providerGameId: game.id,
        providerWeek: game.week,
        startDate: game.startDate ?? null,
        neutralSite:
          typeof game.neutralSite === 'boolean' ? game.neutralSite : null,
        homeTeam,
        awayTeam,
        team: side.team,
        opponent: side.opponent,
        isHome: side.isHome,
        status: 'AVAILABLE',
        ppaOff,
        ppaDef,
        successOff,
        successDef,
        sourceSeason: input.source.season,
        sourceArtifactId: input.source.artifactId,
        sourceArtifactZipSha256: input.source.artifactZipSha256,
        sourceEndpoint: input.source.sourceEndpoint,
        sourceRawMember: input.source.sourceRawMember,
        sourceMethod: 'DIRECT_PROVIDER_ROW',
      });
    }
  }

  return {
    season: input.season,
    canonicalGames: canonicalGames.length,
    rows,
    gaps,
    duplicateAdvancedKeys,
  };
}

export function buildOaData1Archive(
  seasons: OaData1SeasonBuild[]
): OaData1ArchiveBuild {
  const bySeason = new Map<number, OaData1SeasonBuild>();
  for (const season of seasons) {
    if (bySeason.has(season.season)) {
      throw new Error(`oa_data_1_duplicate_season:${season.season}`);
    }
    bySeason.set(season.season, season);
  }

  for (const year of [2022, 2023, 2024, 2025] as const) {
    if (!bySeason.has(year)) {
      throw new Error(`oa_data_1_missing_season:${year}`);
    }
  }

  const rows = seasons
    .flatMap((season) => season.rows)
    .sort(
      (a, b) =>
        a.season - b.season ||
        a.providerGameId - b.providerGameId ||
        Number(b.isHome) - Number(a.isHome) ||
        a.team.localeCompare(b.team)
    );

  const gaps = seasons
    .flatMap((season) => season.gaps)
    .sort(
      (a, b) =>
        a.season - b.season ||
        a.providerGameId - b.providerGameId ||
        Number(b.isHome) - Number(a.isHome) ||
        a.team.localeCompare(b.team)
    );

  const coverage = seasons
    .map((season) => ({
      season: season.season,
      canonicalGames: season.canonicalGames,
      expectedTeamSideRows: season.rows.length,
      availableRows: season.rows.filter((row) => row.status === 'AVAILABLE')
        .length,
      unavailableRows: season.rows.filter(
        (row) => row.status === 'SOURCE_UNAVAILABLE'
      ).length,
    }))
    .sort((a, b) => a.season - b.season);

  return { rows, gaps, coverage };
}

export function assertFrozenOaData1Archive(
  archive: OaData1ArchiveBuild
): void {
  if (archive.rows.length !== 5996) {
    throw new Error(
      `oa_data_1_total_row_count_mismatch:${archive.rows.length}`
    );
  }

  const available = archive.rows.filter(
    (row) => row.status === 'AVAILABLE'
  ).length;
  const unavailable = archive.rows.filter(
    (row) => row.status === 'SOURCE_UNAVAILABLE'
  ).length;

  if (available !== 5988 || unavailable !== 8) {
    throw new Error(
      `oa_data_1_availability_count_mismatch:${available}:${unavailable}`
    );
  }

  const naturalKeys = new Set<string>();
  const perGame = new Map<string, OaData1ArchiveRow[]>();

  for (const row of archive.rows) {
    const key = `${row.season}|${row.providerGameId}|${row.team}`;
    if (naturalKeys.has(key)) {
      throw new Error(`oa_data_1_duplicate_archive_key:${key}`);
    }
    naturalKeys.add(key);

    const gameKey = `${row.season}|${row.providerGameId}`;
    const gameRows = perGame.get(gameKey) ?? [];
    gameRows.push(row);
    perGame.set(gameKey, gameRows);

    if (row.status === 'AVAILABLE') {
      if (
        !finite(row.ppaOff) ||
        !finite(row.ppaDef) ||
        !finite(row.successOff) ||
        !finite(row.successDef)
      ) {
        throw new Error(`oa_data_1_available_row_nonfinite:${key}`);
      }
    } else if (
      row.ppaOff !== null ||
      row.ppaDef !== null ||
      row.successOff !== null ||
      row.successDef !== null
    ) {
      throw new Error(`oa_data_1_unavailable_row_has_values:${key}`);
    }
  }

  if (perGame.size !== 2998) {
    throw new Error(`oa_data_1_game_count_mismatch:${perGame.size}`);
  }

  for (const [gameKey, gameRows] of perGame) {
    if (
      gameRows.length !== 2 ||
      gameRows.filter((row) => row.isHome).length !== 1 ||
      gameRows.filter((row) => !row.isHome).length !== 1
    ) {
      throw new Error(`oa_data_1_game_orientation_mismatch:${gameKey}`);
    }
  }

  for (const year of [2022, 2023, 2024, 2025] as const) {
    const expected = FROZEN_EXPECTATIONS[year];
    const coverage = archive.coverage.find((row) => row.season === year);
    if (!coverage) throw new Error(`oa_data_1_coverage_missing:${year}`);

    if (
      coverage.canonicalGames !== expected.games ||
      coverage.expectedTeamSideRows !== expected.rows ||
      coverage.availableRows !== expected.available ||
      coverage.unavailableRows !== expected.unavailable
    ) {
      throw new Error(`oa_data_1_season_invariant_mismatch:${year}`);
    }
  }

  const unavailable2024 = archive.rows
    .filter((row) => row.status === 'SOURCE_UNAVAILABLE')
    .map((row) => row.providerGameId);
  const actualMissingGames = [...new Set(unavailable2024)].sort(
    (a, b) => a - b
  );
  const expectedMissingGames = [...OA_DATA_1_2024_UNAVAILABLE_GAME_IDS].sort(
    (a, b) => a - b
  );

  if (
    actualMissingGames.length !== expectedMissingGames.length ||
    actualMissingGames.some(
      (gameId, index) => gameId !== expectedMissingGames[index]
    )
  ) {
    throw new Error('oa_data_1_unavailable_game_set_mismatch');
  }

  if (
    archive.gaps.length !== 8 ||
    archive.gaps.some((gap) => gap.season !== 2024)
  ) {
    throw new Error('oa_data_1_gap_invariant_mismatch');
  }
}
