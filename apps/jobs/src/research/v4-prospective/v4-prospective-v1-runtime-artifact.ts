import artifactJson from '../../../../../research/v4-prospective/V4_PROSPECTIVE_V1_RUNTIME_ARTIFACT.json';
import { sha256CanonicalJson } from '../../../../web/lib/shadow-model-capture-v1';

export const V4_PROSPECTIVE_MODEL_ID = 'v4_prospective_v1' as const;
export const V4_PROSPECTIVE_MODEL_FAMILY = 'v4_prospective' as const;
export const V4_PROSPECTIVE_RUNTIME_ARTIFACT_HASH =
  '0c1fddf9e1d08a308887024c86c8be5a34aa3aa5bae16e53fe3dc2cb3edb0a33';
export const V4_PROSPECTIVE_TARGET_WEEK = 4 as const;
export const V4_PROSPECTIVE_HFA_POINTS = 2.0;
export const V4_PROSPECTIVE_SELECTION_THRESHOLD_ABS = 0.1;

export interface V4ProspectiveRuntimeTeamRow {
  teamId: string;
  rating: number;
  rowHash: string;
}

export interface V4ProspectiveRuntimeArtifact {
  artifactId: string;
  modelId: string;
  season: number;
  targetWeek: number;
  completedSourceWeeks: number[];
  sourceRunId: number;
  sourceRepoSha: string;
  sourceArtifactId: number;
  sourceArtifactArchiveSha256: string;
  teamRatingsSha256: string;
  teamCount: number;
  finalScoreExactMatches: number;
  finalScoreExpectedGames: number;
  scoringRows: number;
  invalidScoringEvents: number;
  hfaPoints: number;
  selectionThresholdAbs: number;
  teams: V4ProspectiveRuntimeTeamRow[];
  artifactHash: string;
}

function withoutArtifactHash(
  artifact: V4ProspectiveRuntimeArtifact
): Omit<V4ProspectiveRuntimeArtifact, 'artifactHash'> {
  const { artifactHash: _ignore, ...rest } = artifact;
  return rest;
}

export function loadV4ProspectiveRuntimeArtifact(): V4ProspectiveRuntimeArtifact {
  const artifact = artifactJson as V4ProspectiveRuntimeArtifact;
  if (artifact.modelId !== V4_PROSPECTIVE_MODEL_ID) {
    throw new Error('v4_prospective_runtime_model_id_mismatch');
  }
  if (artifact.season !== 2026 || artifact.targetWeek !== V4_PROSPECTIVE_TARGET_WEEK) {
    throw new Error('v4_prospective_runtime_season_week_mismatch');
  }
  if (artifact.teamCount !== 138 || artifact.teams.length !== 138) {
    throw new Error('v4_prospective_runtime_team_count_mismatch');
  }
  if (
    artifact.finalScoreExactMatches !== artifact.finalScoreExpectedGames ||
    artifact.invalidScoringEvents !== 0
  ) {
    throw new Error('v4_prospective_runtime_source_audit_not_clean');
  }
  if (
    artifact.hfaPoints !== V4_PROSPECTIVE_HFA_POINTS ||
    artifact.selectionThresholdAbs !== V4_PROSPECTIVE_SELECTION_THRESHOLD_ABS
  ) {
    throw new Error('v4_prospective_runtime_policy_mismatch');
  }

  const seen = new Set<string>();
  for (const row of artifact.teams) {
    if (!row.teamId || seen.has(row.teamId) || !Number.isFinite(row.rating)) {
      throw new Error('v4_prospective_runtime_team_row_invalid');
    }
    seen.add(row.teamId);
    const computedRowHash = sha256CanonicalJson({
      teamId: row.teamId,
      rating: row.rating,
    });
    if (computedRowHash !== row.rowHash) {
      throw new Error('v4_prospective_runtime_row_hash_mismatch:' + row.teamId);
    }
  }

  const computedArtifactHash = sha256CanonicalJson(withoutArtifactHash(artifact));
  if (
    computedArtifactHash !== V4_PROSPECTIVE_RUNTIME_ARTIFACT_HASH ||
    artifact.artifactHash !== V4_PROSPECTIVE_RUNTIME_ARTIFACT_HASH
  ) {
    throw new Error('v4_prospective_runtime_artifact_hash_mismatch');
  }
  return artifact;
}
