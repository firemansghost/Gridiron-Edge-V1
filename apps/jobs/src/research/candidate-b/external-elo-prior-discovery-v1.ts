import {
  computeTalentOnlyBridgeRatings,
  pearsonCorrelation,
  spearmanCorrelation,
} from '../../preseason/balanced-v1-preseason-bridge-eval';

export const VERSION = 'external_elo_prior_discovery_v1' as const;
export const TARGET_SEASON = 2026 as const;
export const EXPECTED_FBS_COUNT = 138 as const;
export const CFBD_OPENAPI_VERSION = '5.29.0' as const;
export const CFBD_ENDPOINT = '/ratings/elo?year=2026&preseason=true' as const;

export interface RawCfbdEloRow {
  year?: unknown;
  team?: unknown;
  conference?: unknown;
  elo?: unknown;
}
export interface MembershipRow { teamId: string; conference: string | null; }
export interface TalentRow { teamId: string; talentComposite: number | null; }
export interface ResolveResult { teamId: string | null; method: string | null; }
export type ResolveTeam = (providerTeam: string) => ResolveResult;

export interface NumericSummary {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
}
export interface UnexpectedProviderRow {
  index: number;
  providerTeam: string | null;
  providerConference: string | null;
  providerYear: number | null;
  elo: number | null;
  resolvedTeamId: string | null;
  resolutionMethod: string | null;
  reason: 'missing_team' | 'unresolved' | 'forbidden_resolution_method' | 'resolved_non_fbs';
}
export interface CanonicalEloRow {
  providerTeam: string;
  providerConference: string | null;
  teamId: string;
  conference: string;
  elo: number;
  zElo: number | null;
  resolutionMethod: string;
}
export interface ComparisonRow {
  teamId: string;
  providerTeam: string;
  conference: string;
  elo: number;
  zElo: number;
  talentComposite: number;
  talentZ: number;
  candidateAPoints: number;
  eloRank: number;
  talentRank: number;
  rankDelta: number;
  absRankDelta: number;
  zDelta: number;
  absZDelta: number;
  conferenceCenteredElo: number;
  conferenceCenteredTalent: number;
  conferenceCenteredDelta: number;
  absConferenceCenteredDelta: number;
}
export interface ConferenceCoverage {
  conference: string;
  expectedFbsCount: number;
  usableEloCount: number;
  missingTeamIds: string[];
  eloSummary: NumericSummary;
}
export interface ConferenceComparison {
  conference: string;
  comparedCount: number;
  eloSummary: NumericSummary;
  zEloSummary: NumericSummary;
  talentZSummary: NumericSummary;
  zDeltaSummary: NumericSummary;
  conferenceCenteredDeltaSummary: NumericSummary;
}
export interface DiscoveryInput {
  season: number;
  rawRows: RawCfbdEloRow[];
  memberships: MembershipRow[];
  talentRows: TalentRow[];
  resolveTeam: ResolveTeam;
}
export interface DiscoveryResult {
  version: typeof VERSION;
  season: number;
  documentedOpenApiVersion: typeof CFBD_OPENAPI_VERSION;
  endpoint: typeof CFBD_ENDPOINT;
  qaPass: boolean;
  findings: string[];
  raw: {
    rowCount: number;
    uniqueProviderTeamCount: number;
    duplicateProviderTeams: string[];
    nullEloTeams: string[];
    nonFiniteEloTeams: string[];
    yearMismatchTeams: string[];
    finiteEloSummary: NumericSummary;
  };
  authoritativeFbs: {
    expectedCount: typeof EXPECTED_FBS_COUNT;
    membershipRowCount: number;
    uniqueCount: number;
    duplicateTeamIds: string[];
  };
  resolution: {
    uniqueResolvedFbsCount: number;
    usableFbsEloCount: number;
    missingCanonicalTeamIds: string[];
    duplicateCanonicalTeamIds: string[];
    invalidCanonicalEloTeamIds: string[];
    unexpectedProviderRows: UnexpectedProviderRow[];
    methodCounts: Record<string, number>;
  };
  conferenceCoverage: ConferenceCoverage[];
  canonicalFbsEloSummary: NumericSummary;
  talent: {
    rowCount: number;
    finiteCanonicalCount: number;
    duplicateTeamIds: string[];
    missingCanonicalTeamIds: string[];
    completeForCandidateA: boolean;
  };
  comparison: {
    comparedCount: number;
    pearsonEloVsTalentZ: number | null;
    spearmanEloVsTalentZ: number | null;
    pearsonZEloVsTalentZ: number | null;
    canonicalRows: CanonicalEloRow[];
    rows: ComparisonRow[];
    largestRankDisagreements: ComparisonRow[];
    largestZDisagreements: ComparisonRow[];
    largestConferenceCenteredDisagreements: ComparisonRow[];
    byConference: ConferenceComparison[];
  };
  noImputation: true;
  candidateAUnchanged: true;
  candidateBExistingModelsUnchanged: true;
  blendWeightsAuthorized: false;
  modelChangeAuthorized: false;
  historicalRetrofitAuthorized: false;
}

const norm = (s: string) => s.trim().toLowerCase();
const asText = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const asFinite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const asInteger = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : null;

export function numericSummary(values: number[]): NumericSummary {
  const x = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!x.length) return { count: 0, min: null, max: null, mean: null, median: null, stdDev: null };
  const mean = x.reduce((a, b) => a + b, 0) / x.length;
  const m = Math.floor(x.length / 2);
  const median = x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / x.length;
  return { count: x.length, min: x[0], max: x[x.length - 1], mean, median, stdDev: Math.sqrt(variance) };
}

function duplicates(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].filter(([, n]) => n > 1).map(([v]) => v).sort();
}

function ranksDescending(rows: Array<{ teamId: string; value: number }>): Map<string, number> {
  const s = [...rows].sort((a, b) => b.value - a.value || a.teamId.localeCompare(b.teamId));
  const out = new Map<string, number>();
  let i = 0;
  while (i < s.length) {
    let j = i + 1;
    while (j < s.length && s[j].value === s[i].value) j += 1;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) out.set(s[k].teamId, rank);
    i = j;
  }
  return out;
}
const average = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;

export function buildExternalEloPriorDiscovery(input: DiscoveryInput): DiscoveryResult {
  const findings: string[] = [];
  if (input.season !== TARGET_SEASON) {
    findings.push('season ' + input.season + ' != ' + TARGET_SEASON);
  }

  const membershipIds = input.memberships.map(r => norm(r.teamId));
  const duplicateMembershipIds = duplicates(membershipIds);
  const fbsIds = [...new Set(membershipIds)].sort();
  const fbsSet = new Set(fbsIds);
  const conferenceById = new Map(
    input.memberships.map(r => [norm(r.teamId), r.conference?.trim() || 'Unknown'] as const)
  );
  if (duplicateMembershipIds.length) {
    findings.push('authoritative FBS membership duplicates: ' + duplicateMembershipIds.join(', '));
  }
  if (fbsIds.length !== EXPECTED_FBS_COUNT) {
    findings.push('authoritative FBS count ' + fbsIds.length + ' != ' + EXPECTED_FBS_COUNT);
  }

  const providerKeys: string[] = [];
  const nullEloTeams: string[] = [];
  const nonFiniteEloTeams: string[] = [];
  const yearMismatchTeams: string[] = [];
  const rawFiniteElos: number[] = [];
  const unexpectedProviderRows: UnexpectedProviderRow[] = [];
  const methodCounts: Record<string, number> = {};
  const resolved = new Map<string, Array<{
    index: number;
    providerTeam: string;
    providerConference: string | null;
    year: number | null;
    elo: number | null;
    resolutionMethod: string;
  }>>();
  const allowed = new Set(['guard', 'cfbd_alias', 'alias']);

  input.rawRows.forEach((row, index) => {
    const providerTeam = asText(row.team);
    const providerConference = asText(row.conference);
    const providerYear = asInteger(row.year);
    const elo = asFinite(row.elo);
    if (providerTeam) providerKeys.push(providerTeam.toLowerCase());
    if (row.elo === null || row.elo === undefined) nullEloTeams.push(providerTeam ?? '<row:' + index + '>');
    else if (elo === null) nonFiniteEloTeams.push(providerTeam ?? '<row:' + index + '>');
    else rawFiniteElos.push(elo);
    if (providerYear !== input.season) yearMismatchTeams.push(providerTeam ?? '<row:' + index + '>');

    if (!providerTeam) {
      unexpectedProviderRows.push({
        index, providerTeam: null, providerConference, providerYear, elo,
        resolvedTeamId: null, resolutionMethod: null, reason: 'missing_team',
      });
      return;
    }
    const rr = input.resolveTeam(providerTeam);
    const teamId = rr.teamId ? norm(rr.teamId) : null;
    if (!teamId) {
      unexpectedProviderRows.push({
        index, providerTeam, providerConference, providerYear, elo,
        resolvedTeamId: null, resolutionMethod: rr.method, reason: 'unresolved',
      });
      return;
    }
    if (!rr.method || !allowed.has(rr.method)) {
      unexpectedProviderRows.push({
        index, providerTeam, providerConference, providerYear, elo,
        resolvedTeamId: teamId, resolutionMethod: rr.method, reason: 'forbidden_resolution_method',
      });
      return;
    }
    if (!fbsSet.has(teamId)) {
      unexpectedProviderRows.push({
        index, providerTeam, providerConference, providerYear, elo,
        resolvedTeamId: teamId, resolutionMethod: rr.method, reason: 'resolved_non_fbs',
      });
      return;
    }
    methodCounts[rr.method] = (methodCounts[rr.method] ?? 0) + 1;
    const group = resolved.get(teamId) ?? [];
    group.push({
      index, providerTeam, providerConference, year: providerYear,
      elo, resolutionMethod: rr.method,
    });
    resolved.set(teamId, group);
  });

  const duplicateProviderTeams = duplicates(providerKeys);
  const duplicateCanonicalTeamIds = [...resolved]
    .filter(([, rows]) => rows.length > 1)
    .map(([id]) => id)
    .sort();
  const missingCanonicalTeamIds = fbsIds.filter(id => !resolved.has(id));
  const invalidCanonicalEloTeamIds: string[] = [];
  const usableBase: Array<{
    providerTeam: string;
    providerConference: string | null;
    teamId: string;
    conference: string;
    elo: number;
    resolutionMethod: string;
  }> = [];

  for (const [teamId, rows] of resolved) {
    if (rows.length !== 1) continue;
    const row = rows[0];
    if (row.year !== input.season || row.elo === null) {
      invalidCanonicalEloTeamIds.push(teamId);
      continue;
    }
    usableBase.push({
      providerTeam: row.providerTeam,
      providerConference: row.providerConference,
      teamId,
      conference: conferenceById.get(teamId) ?? 'Unknown',
      elo: row.elo,
      resolutionMethod: row.resolutionMethod,
    });
  }

  if (missingCanonicalTeamIds.length) {
    findings.push('missing canonical FBS Elo teams: ' + missingCanonicalTeamIds.join(', '));
  }
  if (duplicateCanonicalTeamIds.length) {
    findings.push('duplicate canonical Elo targets: ' + duplicateCanonicalTeamIds.join(', '));
  }
  if (invalidCanonicalEloTeamIds.length) {
    findings.push('canonical teams with invalid Elo/year: ' + invalidCanonicalEloTeamIds.sort().join(', '));
  }

  const fbsEloSummary = numericSummary(usableBase.map(r => r.elo));
  const eloMean = fbsEloSummary.mean;
  const eloSd = fbsEloSummary.stdDev;
  if (usableBase.length && (eloMean === null || eloSd === null || eloSd <= 0)) {
    findings.push('canonical FBS Elo standard deviation is not positive');
  }

  const canonicalRows: CanonicalEloRow[] = usableBase
    .map(r => ({
      ...r,
      zElo: eloMean !== null && eloSd !== null && eloSd > 0 ? (r.elo - eloMean) / eloSd : null,
    }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId));

  const conferences = [...new Set(input.memberships.map(r => r.conference?.trim() || 'Unknown'))].sort();
  const conferenceCoverage: ConferenceCoverage[] = conferences.map(conference => {
    const expectedIds = fbsIds.filter(id => (conferenceById.get(id) ?? 'Unknown') === conference);
    const usable = canonicalRows.filter(r => r.conference === conference && r.zElo !== null);
    const usableIds = new Set(usable.map(r => r.teamId));
    return {
      conference,
      expectedFbsCount: expectedIds.length,
      usableEloCount: usable.length,
      missingTeamIds: expectedIds.filter(id => !usableIds.has(id)),
      eloSummary: numericSummary(usable.map(r => r.elo)),
    };
  });

  const talentIds = input.talentRows.map(r => norm(r.teamId));
  const duplicateTalentTeamIds = duplicates(talentIds);
  const finiteTalentById = new Map<string, number>();
  for (const row of input.talentRows) {
    const id = norm(row.teamId);
    if (
      fbsSet.has(id) &&
      typeof row.talentComposite === 'number' &&
      Number.isFinite(row.talentComposite) &&
      !finiteTalentById.has(id)
    ) {
      finiteTalentById.set(id, row.talentComposite);
    }
  }
  const missingTalent = fbsIds.filter(id => !finiteTalentById.has(id));
  const talentComplete =
    duplicateTalentTeamIds.length === 0 &&
    finiteTalentById.size === EXPECTED_FBS_COUNT &&
    missingTalent.length === 0;
  if (duplicateTalentTeamIds.length) {
    findings.push('duplicate TeamSeasonTalent rows: ' + duplicateTalentTeamIds.join(', '));
  }
  if (!talentComplete) {
    findings.push('Candidate A talent coverage incomplete: finite=' + finiteTalentById.size + '/' + EXPECTED_FBS_COUNT);
  }

  const candidateA = talentComplete
    ? computeTalentOnlyBridgeRatings(
        fbsIds.map(teamId => ({
          teamId,
          talentComposite: finiteTalentById.get(teamId)!,
        }))
      )
    : [];
  const candidateAById = new Map(candidateA.map(r => [r.teamId, r] as const));
  const comparisonBase = canonicalRows
    .filter(r => r.zElo !== null && candidateAById.has(r.teamId))
    .map(r => {
      const a = candidateAById.get(r.teamId)!;
      return {
        teamId: r.teamId,
        providerTeam: r.providerTeam,
        conference: r.conference,
        elo: r.elo,
        zElo: r.zElo!,
        talentComposite: a.talentComposite,
        talentZ: a.talentZ,
        candidateAPoints: a.candidateA,
      };
    });

  const eloRanks = ranksDescending(comparisonBase.map(r => ({ teamId: r.teamId, value: r.elo })));
  const talentRanks = ranksDescending(comparisonBase.map(r => ({ teamId: r.teamId, value: r.talentZ })));
  const conferenceMeans = new Map<string, { elo: number; talent: number }>();
  for (const conference of [...new Set(comparisonBase.map(r => r.conference))]) {
    const rows = comparisonBase.filter(r => r.conference === conference);
    conferenceMeans.set(conference, {
      elo: average(rows.map(r => r.zElo)),
      talent: average(rows.map(r => r.talentZ)),
    });
  }

  const comparisonRows: ComparisonRow[] = comparisonBase
    .map(r => {
      const eloRank = eloRanks.get(r.teamId)!;
      const talentRank = talentRanks.get(r.teamId)!;
      const cm = conferenceMeans.get(r.conference)!;
      const conferenceCenteredElo = r.zElo - cm.elo;
      const conferenceCenteredTalent = r.talentZ - cm.talent;
      const conferenceCenteredDelta = conferenceCenteredElo - conferenceCenteredTalent;
      const zDelta = r.zElo - r.talentZ;
      const rankDelta = eloRank - talentRank;
      return {
        ...r,
        eloRank,
        talentRank,
        rankDelta,
        absRankDelta: Math.abs(rankDelta),
        zDelta,
        absZDelta: Math.abs(zDelta),
        conferenceCenteredElo,
        conferenceCenteredTalent,
        conferenceCenteredDelta,
        absConferenceCenteredDelta: Math.abs(conferenceCenteredDelta),
      };
    })
    .sort((a, b) => a.teamId.localeCompare(b.teamId));

  const byConference: ConferenceComparison[] = [
    ...new Set(comparisonRows.map(r => r.conference)),
  ].sort().map(conference => {
    const rows = comparisonRows.filter(r => r.conference === conference);
    return {
      conference,
      comparedCount: rows.length,
      eloSummary: numericSummary(rows.map(r => r.elo)),
      zEloSummary: numericSummary(rows.map(r => r.zElo)),
      talentZSummary: numericSummary(rows.map(r => r.talentZ)),
      zDeltaSummary: numericSummary(rows.map(r => r.zDelta)),
      conferenceCenteredDeltaSummary: numericSummary(rows.map(r => r.conferenceCenteredDelta)),
    };
  });

  const qaPass =
    input.season === TARGET_SEASON &&
    duplicateMembershipIds.length === 0 &&
    fbsIds.length === EXPECTED_FBS_COUNT &&
    missingCanonicalTeamIds.length === 0 &&
    duplicateCanonicalTeamIds.length === 0 &&
    invalidCanonicalEloTeamIds.length === 0 &&
    canonicalRows.length === EXPECTED_FBS_COUNT &&
    eloSd !== null &&
    eloSd > 0 &&
    talentComplete;

  return {
    version: VERSION,
    season: input.season,
    documentedOpenApiVersion: CFBD_OPENAPI_VERSION,
    endpoint: CFBD_ENDPOINT,
    qaPass,
    findings,
    raw: {
      rowCount: input.rawRows.length,
      uniqueProviderTeamCount: new Set(providerKeys).size,
      duplicateProviderTeams,
      nullEloTeams: [...new Set(nullEloTeams)].sort(),
      nonFiniteEloTeams: [...new Set(nonFiniteEloTeams)].sort(),
      yearMismatchTeams: [...new Set(yearMismatchTeams)].sort(),
      finiteEloSummary: numericSummary(rawFiniteElos),
    },
    authoritativeFbs: {
      expectedCount: EXPECTED_FBS_COUNT,
      membershipRowCount: input.memberships.length,
      uniqueCount: fbsIds.length,
      duplicateTeamIds: duplicateMembershipIds,
    },
    resolution: {
      uniqueResolvedFbsCount: resolved.size,
      usableFbsEloCount: canonicalRows.length,
      missingCanonicalTeamIds,
      duplicateCanonicalTeamIds,
      invalidCanonicalEloTeamIds: invalidCanonicalEloTeamIds.sort(),
      unexpectedProviderRows,
      methodCounts,
    },
    conferenceCoverage,
    canonicalFbsEloSummary: fbsEloSummary,
    talent: {
      rowCount: input.talentRows.length,
      finiteCanonicalCount: finiteTalentById.size,
      duplicateTeamIds: duplicateTalentTeamIds,
      missingCanonicalTeamIds: missingTalent,
      completeForCandidateA: talentComplete,
    },
    comparison: {
      comparedCount: comparisonRows.length,
      pearsonEloVsTalentZ: pearsonCorrelation(
        comparisonRows.map(r => r.elo),
        comparisonRows.map(r => r.talentZ)
      ),
      spearmanEloVsTalentZ: spearmanCorrelation(
        comparisonRows.map(r => r.elo),
        comparisonRows.map(r => r.talentZ)
      ),
      pearsonZEloVsTalentZ: pearsonCorrelation(
        comparisonRows.map(r => r.zElo),
        comparisonRows.map(r => r.talentZ)
      ),
      canonicalRows,
      rows: comparisonRows,
      largestRankDisagreements: [...comparisonRows]
        .sort((a, b) =>
          b.absRankDelta - a.absRankDelta ||
          b.absZDelta - a.absZDelta ||
          a.teamId.localeCompare(b.teamId)
        )
        .slice(0, 20),
      largestZDisagreements: [...comparisonRows]
        .sort((a, b) =>
          b.absZDelta - a.absZDelta ||
          b.absRankDelta - a.absRankDelta ||
          a.teamId.localeCompare(b.teamId)
        )
        .slice(0, 20),
      largestConferenceCenteredDisagreements: [...comparisonRows]
        .sort((a, b) =>
          b.absConferenceCenteredDelta - a.absConferenceCenteredDelta ||
          a.teamId.localeCompare(b.teamId)
        )
        .slice(0, 20),
      byConference,
    },
    noImputation: true,
    candidateAUnchanged: true,
    candidateBExistingModelsUnchanged: true,
    blendWeightsAuthorized: false,
    modelChangeAuthorized: false,
    historicalRetrofitAuthorized: false,
  };
}
