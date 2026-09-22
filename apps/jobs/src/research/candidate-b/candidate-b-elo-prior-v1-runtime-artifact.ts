import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { sha256CanonicalJson } from '../../../../web/lib/shadow-model-capture-v1';

export const CANDIDATE_B_ELO_RUNTIME_ARTIFACT_ID =
  'candidate_b_elo_prior_features_2026_v1' as const;
export const CANDIDATE_B_ELO_MODEL_ID = 'candidate_b_elo_prior_v1' as const;
export const CANDIDATE_B_ELO_FEATURE_DEFINITION_ID =
  'candidate_b_elo_prior_features_v1' as const;
export const CANDIDATE_B_ELO_FEATURE_DEFINITION_VERSION = 'v1' as const;
export const CANDIDATE_B_ELO_SOURCE_RAW_SHA256 =
  '97e40e9f8220f9e7bafd8c6cd68dbf9ecb4b94208fe5911b97b07891f9fa4e64' as const;
export const CANDIDATE_B_ELO_SOURCE_AUDIT_SHA256 =
  '94ff7e38c2f7f921ccaf4934537739d667542168c5a5ca0aef0dfb7280f512a0' as const;
export const CANDIDATE_B_ELO_MAPPING_HASH =
  'f6465665aa20ffcc55d0be9b03e00d39a03d3a7a961fc8c5225552d0c180c527' as const;
export const CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH =
  '204458cdf96f9326335725d5c5cd712beead26876027aee72a49e43dad0d5566' as const;
export const CANDIDATE_B_ELO_EXPECTED_TEAM_COUNT = 138 as const;
export const CANDIDATE_B_ELO_MEAN = 1498.7608695652175 as const;
export const CANDIDATE_B_ELO_POPULATION_SD = 193.5003858868873 as const;
export const CANDIDATE_B_ELO_POINTS_PER_Z = 3.5 as const;

export const CANDIDATE_B_ELO_RAW_PATH =
  'research/candidate-b/snapshots/cfbd-preseason-elo/2026/2026-09-22-raw.json' as const;
export const CANDIDATE_B_ELO_MAPPING_PATH =
  'research/candidate-b/snapshots/cfbd-preseason-elo/2026/2026-09-22-team-mapping-v1.json' as const;

interface RawEloRow {
  year: number;
  team: string;
  conference: string;
  elo: number;
}

interface MappingRow {
  providerTeam: string;
  teamId: string;
  resolutionMethod: string;
  conference: string;
}

interface MappingFile {
  mappingId: string;
  sourceDiscoveryRunId: number;
  sourceAuditReportSha256: string;
  expectedTeamCount: number;
  rows: MappingRow[];
  mappingHash: string;
}

export interface CandidateBEloRuntimeTeamRow {
  teamId: string;
  providerTeam: string;
  conference: string;
  rawElo: number;
  zElo: number;
  candidateBEloTeamRatingPoints: number;
  resolutionMethod: string;
  sourceRawRowIndex: number;
  rowHash: string;
}

export interface CandidateBEloRuntimeArtifact {
  artifactId: typeof CANDIDATE_B_ELO_RUNTIME_ARTIFACT_ID;
  artifactVersion: 'v1';
  season: 2026;
  modelDefinitionId: typeof CANDIDATE_B_ELO_MODEL_ID;
  featureDefinitionId: typeof CANDIDATE_B_ELO_FEATURE_DEFINITION_ID;
  featureDefinitionVersion: typeof CANDIDATE_B_ELO_FEATURE_DEFINITION_VERSION;
  source: {
    provider: 'CFBD';
    endpoint: '/ratings/elo?year=2026&preseason=true';
    documentedOpenApiVersion: '5.29.0';
    retrievalTimestamp: '2026-09-22T14:24:48.916Z';
    discoveryRunId: 35740044682;
    rawPath: typeof CANDIDATE_B_ELO_RAW_PATH;
    rawByteCount: 9542;
    rawSha256: typeof CANDIDATE_B_ELO_SOURCE_RAW_SHA256;
    auditReportSha256: typeof CANDIDATE_B_ELO_SOURCE_AUDIT_SHA256;
    historicalBoundary: 'SEPTEMBER_2026_DISCOVERY_ARCHIVE_NOT_PRESEASON_AVAILABILITY_PROOF';
  };
  population: {
    definition: '2026 TeamMembership level=fbs canonical universe';
    count: 138;
    meanElo: typeof CANDIDATE_B_ELO_MEAN;
    populationStdDevElo: typeof CANDIDATE_B_ELO_POPULATION_SD;
    scalePointsPerZ: typeof CANDIDATE_B_ELO_POINTS_PER_Z;
  };
  derivation: {
    normalization: 'zElo=(rawElo-meanElo)/populationStdDevElo';
    teamRatingPoints: 'candidateBEloTeamRatingPoints=3.5*zElo';
    noImputation: true;
    noOutcomeFit: true;
    noProviderRefreshAtRuntime: true;
    mappingSource: 'External Elo Prior Discovery V1 canonicalRows from run 35740044682';
  };
  teams: CandidateBEloRuntimeTeamRow[];
  artifactHash: typeof CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH;
}

let cached: CandidateBEloRuntimeArtifact | null = null;

function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertClose(actual: number, expected: number, label: string): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-12) {
    throw new Error('candidate_b_elo_' + label + '_mismatch:' + actual + '!=' + expected);
  }
}

function readJsonFile<T>(repoPath: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), repoPath), 'utf8')) as T;
}

function verifyMapping(mapping: MappingFile): void {
  if (mapping.mappingHash !== CANDIDATE_B_ELO_MAPPING_HASH) {
    throw new Error('candidate_b_elo_mapping_hash_field_mismatch');
  }
  const base = { ...mapping } as Record<string, unknown>;
  delete base.mappingHash;
  if (sha256CanonicalJson(base) !== CANDIDATE_B_ELO_MAPPING_HASH) {
    throw new Error('candidate_b_elo_mapping_hash_mismatch');
  }
  if (
    mapping.expectedTeamCount !== CANDIDATE_B_ELO_EXPECTED_TEAM_COUNT ||
    mapping.rows.length !== CANDIDATE_B_ELO_EXPECTED_TEAM_COUNT
  ) {
    throw new Error('candidate_b_elo_mapping_count_mismatch');
  }
  if (mapping.sourceDiscoveryRunId !== 35740044682) {
    throw new Error('candidate_b_elo_mapping_discovery_run_mismatch');
  }
  if (mapping.sourceAuditReportSha256 !== CANDIDATE_B_ELO_SOURCE_AUDIT_SHA256) {
    throw new Error('candidate_b_elo_mapping_audit_hash_mismatch');
  }
  const provider = new Set(mapping.rows.map((row) => row.providerTeam));
  const teamIds = new Set(mapping.rows.map((row) => row.teamId));
  if (provider.size !== mapping.rows.length || teamIds.size !== mapping.rows.length) {
    throw new Error('candidate_b_elo_mapping_duplicate_identity');
  }
}

export function loadCandidateBEloPriorRuntimeArtifact(): CandidateBEloRuntimeArtifact {
  if (cached) return cached;

  const rawBytes = fs.readFileSync(path.join(process.cwd(), CANDIDATE_B_ELO_RAW_PATH));
  if (rawBytes.length !== 9542) {
    throw new Error('candidate_b_elo_raw_byte_count_mismatch:' + rawBytes.length);
  }
  const rawSha = sha256Bytes(rawBytes);
  if (rawSha !== CANDIDATE_B_ELO_SOURCE_RAW_SHA256) {
    throw new Error('candidate_b_elo_raw_sha_mismatch:' + rawSha);
  }

  const rawRows = JSON.parse(rawBytes.toString('utf8')) as RawEloRow[];
  const mapping = readJsonFile<MappingFile>(CANDIDATE_B_ELO_MAPPING_PATH);
  verifyMapping(mapping);

  if (rawRows.length !== CANDIDATE_B_ELO_EXPECTED_TEAM_COUNT) {
    throw new Error('candidate_b_elo_raw_row_count_mismatch:' + rawRows.length);
  }
  const rawByTeam = new Map<string, { row: RawEloRow; index: number }>();
  rawRows.forEach((row, index) => {
    if (
      row.year !== 2026 ||
      !row.team ||
      !Number.isFinite(row.elo) ||
      rawByTeam.has(row.team)
    ) {
      throw new Error('candidate_b_elo_raw_row_invalid:' + index);
    }
    rawByTeam.set(row.team, { row, index });
  });
  if (rawByTeam.size !== CANDIDATE_B_ELO_EXPECTED_TEAM_COUNT) {
    throw new Error('candidate_b_elo_raw_unique_count_mismatch');
  }

  const mappingTeams = new Set(mapping.rows.map((row) => row.providerTeam));
  if (
    mappingTeams.size !== rawByTeam.size ||
    [...rawByTeam.keys()].some((team) => !mappingTeams.has(team))
  ) {
    throw new Error('candidate_b_elo_raw_mapping_population_mismatch');
  }

  const elos = rawRows.map((row) => row.elo);
  const mean = elos.reduce((sum, value) => sum + value, 0) / elos.length;
  const variance =
    elos.reduce((sum, value) => sum + (value - mean) ** 2, 0) / elos.length;
  const sd = Math.sqrt(variance);
  assertClose(mean, CANDIDATE_B_ELO_MEAN, 'mean');
  assertClose(sd, CANDIDATE_B_ELO_POPULATION_SD, 'population_sd');

  const teams = mapping.rows
    .map((mappingRow): CandidateBEloRuntimeTeamRow => {
      const source = rawByTeam.get(mappingRow.providerTeam);
      if (!source) {
        throw new Error('candidate_b_elo_provider_team_missing:' + mappingRow.providerTeam);
      }
      const zElo = (source.row.elo - mean) / sd;
      const base = {
        teamId: mappingRow.teamId,
        providerTeam: mappingRow.providerTeam,
        conference: mappingRow.conference,
        rawElo: source.row.elo,
        zElo,
        candidateBEloTeamRatingPoints: CANDIDATE_B_ELO_POINTS_PER_Z * zElo,
        resolutionMethod: mappingRow.resolutionMethod,
        sourceRawRowIndex: source.index,
      };
      return {
        ...base,
        rowHash: sha256CanonicalJson(base),
      };
    })
    .sort((a, b) => a.teamId.localeCompare(b.teamId));

  if (
    teams.length !== CANDIDATE_B_ELO_EXPECTED_TEAM_COUNT ||
    new Set(teams.map((row) => row.teamId)).size !== CANDIDATE_B_ELO_EXPECTED_TEAM_COUNT
  ) {
    throw new Error('candidate_b_elo_derived_team_count_mismatch');
  }

  const baseArtifact = {
    artifactId: CANDIDATE_B_ELO_RUNTIME_ARTIFACT_ID,
    artifactVersion: 'v1' as const,
    season: 2026 as const,
    modelDefinitionId: CANDIDATE_B_ELO_MODEL_ID,
    featureDefinitionId: CANDIDATE_B_ELO_FEATURE_DEFINITION_ID,
    featureDefinitionVersion: CANDIDATE_B_ELO_FEATURE_DEFINITION_VERSION,
    source: {
      provider: 'CFBD' as const,
      endpoint: '/ratings/elo?year=2026&preseason=true' as const,
      documentedOpenApiVersion: '5.29.0' as const,
      retrievalTimestamp: '2026-09-22T14:24:48.916Z' as const,
      discoveryRunId: 35740044682 as const,
      rawPath: CANDIDATE_B_ELO_RAW_PATH,
      rawByteCount: 9542 as const,
      rawSha256: CANDIDATE_B_ELO_SOURCE_RAW_SHA256,
      auditReportSha256: CANDIDATE_B_ELO_SOURCE_AUDIT_SHA256,
      historicalBoundary:
        'SEPTEMBER_2026_DISCOVERY_ARCHIVE_NOT_PRESEASON_AVAILABILITY_PROOF' as const,
    },
    population: {
      definition: '2026 TeamMembership level=fbs canonical universe' as const,
      count: 138 as const,
      meanElo: CANDIDATE_B_ELO_MEAN,
      populationStdDevElo: CANDIDATE_B_ELO_POPULATION_SD,
      scalePointsPerZ: CANDIDATE_B_ELO_POINTS_PER_Z,
    },
    derivation: {
      normalization: 'zElo=(rawElo-meanElo)/populationStdDevElo' as const,
      teamRatingPoints: 'candidateBEloTeamRatingPoints=3.5*zElo' as const,
      noImputation: true as const,
      noOutcomeFit: true as const,
      noProviderRefreshAtRuntime: true as const,
      mappingSource:
        'External Elo Prior Discovery V1 canonicalRows from run 35740044682' as const,
    },
    teams,
  };

  const artifactHash = sha256CanonicalJson(baseArtifact);
  if (artifactHash !== CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH) {
    throw new Error('candidate_b_elo_derived_artifact_hash_mismatch:' + artifactHash);
  }

  cached = {
    ...baseArtifact,
    artifactHash: CANDIDATE_B_ELO_DERIVED_ARTIFACT_HASH,
  };
  return cached;
}

export function candidateBEloRuntimeTeamsById(): ReadonlyMap<
  string,
  CandidateBEloRuntimeTeamRow
> {
  return new Map(loadCandidateBEloPriorRuntimeArtifact().teams.map((row) => [row.teamId, row]));
}
