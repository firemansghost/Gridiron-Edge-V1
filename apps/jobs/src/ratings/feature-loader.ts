/**
 * Feature Loader for Ratings v1
 * 
 * Implements smart data source selection with fallback hierarchy:
 * 1. Game-level features from team_game_stats (preferred)
 * 2. Season-level features from team_season_stats (fallback)
 * 3. Baseline ratings from team_season_ratings (last resort)
 * 
 * Usage:
 *   const loader = new FeatureLoader(prisma);
 *   const features = await loader.loadTeamFeatures(teamId, season);
 */

import { PrismaClient } from '@prisma/client';

export interface TeamFeatures {
  teamId: string;
  season: number;
  
  // Core offensive features
  yppOff?: number | null;
  successOff?: number | null;
  epaOff?: number | null;
  paceOff?: number | null;
  passYpaOff?: number | null;
  rushYpcOff?: number | null;
  
  // Core defensive features
  yppDef?: number | null;
  successDef?: number | null;
  epaDef?: number | null;
  paceDef?: number | null;
  passYpaDef?: number | null;
  rushYpcDef?: number | null;
  
  // Talent features (Phase 3)
  talentComposite?: number | null;
  blueChipsPct?: number | null;
  commitsSignal?: number | null; // Weighted star mix from commits
  weeksPlayed?: number; // Number of completed games this season
  
  // Data source metadata
  dataSource: 'game' | 'season' | 'baseline' | 'missing';
  confidence: number; // 0-1 scale
  gamesCount: number; // Number of games used for calculation
  lastUpdated: Date | null;
}

export interface DataSourceSummary {
  gameFeatures: number; // Teams with game-level features
  seasonFeatures: number; // Teams with season-level features
  baselineOnly: number; // Teams with only baseline ratings
  missing: number; // Teams with no data
  total: number;
}

export class FeatureLoader {
  constructor(private prisma: PrismaClient) {}

  /**
   * Convert Prisma Decimal to number
   */
  private toNumber(value: any): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value);
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return null;
  }

  /**
   * Load team features with smart fallback hierarchy
   */
  async loadTeamFeatures(teamId: string, season: number): Promise<TeamFeatures> {
    // Try game-level features first (most accurate)
    const gameFeatures = await this.loadGameFeatures(teamId, season);
    if (gameFeatures) {
      // Load talent features and merge
      const talentFeatures = await this.loadTalentFeatures(teamId, season);
      return { ...gameFeatures, ...talentFeatures };
    }

    // Fallback to season-level features
    const seasonFeatures = await this.loadSeasonFeatures(teamId, season);
    if (seasonFeatures) {
      // Load talent features and merge
      const talentFeatures = await this.loadTalentFeatures(teamId, season);
      return { ...seasonFeatures, ...talentFeatures };
    }

    // Last resort: baseline ratings
    const baselineFeatures = await this.loadBaselineFeatures(teamId, season);
    if (baselineFeatures) {
      // Load talent features and merge
      const talentFeatures = await this.loadTalentFeatures(teamId, season);
      return { ...baselineFeatures, ...talentFeatures };
    }

    // No data available - but still load talent (for early-season fallback)
    const missingFeatures = this.createMissingFeatures(teamId, season);
    const talentFeatures = await this.loadTalentFeatures(teamId, season);
    return { ...missingFeatures, ...talentFeatures };
  }

  /**
   * Load talent features (roster talent and recruiting commits)
   */
  private async loadTalentFeatures(teamId: string, season: number): Promise<Partial<TeamFeatures>> {
    try {
      // Load roster talent
      const talent = await this.prisma.teamSeasonTalent.findUnique({
        where: {
          season_teamId: {
            season,
            teamId,
          }
        }
      });

      // Load recruiting commits
      const commits = await this.prisma.teamClassCommits.findUnique({
        where: {
          season_teamId: {
            season,
            teamId,
          }
        }
      });

      // Calculate weeks played (count final games)
      const gamesPlayed = await this.prisma.game.count({
        where: {
          season,
          status: 'final',
          OR: [
            { homeTeamId: teamId },
            { awayTeamId: teamId }
          ]
        }
      });

      // Calculate commits signal (weighted star mix: 5*=5, 4*=4, 3*=3)
      let commitsSignal: number | null = null;
      if (commits) {
        const weightedStars = (commits.fiveStarCommits || 0) * 5 +
                             (commits.fourStarCommits || 0) * 4 +
                             (commits.threeStarCommits || 0) * 3;
        const totalCommits = commits.commitsTotal || 0;
        commitsSignal = totalCommits > 0 ? weightedStars / totalCommits : null;
      }

      return {
        talentComposite: talent ? this.toNumber(talent.talentComposite) : null,
        blueChipsPct: talent ? this.toNumber(talent.blueChipsPct) : null,
        commitsSignal,
        weeksPlayed: gamesPlayed,
      };
    } catch (error) {
      console.warn(`Failed to load talent features for ${teamId} ${season}:`, error);
      return {
        talentComposite: null,
        blueChipsPct: null,
        commitsSignal: null,
        weeksPlayed: 0,
      };
    }
  }

  /**
   * Load features from game-level stats (preferred)
   */
  private async loadGameFeatures(teamId: string, season: number): Promise<TeamFeatures | null> {
    try {
      const gameStats = await this.prisma.teamGameStat.findMany({
        where: {
          teamId,
          season,
          // Only include games with meaningful data
          OR: [
            { yppOff: { not: null } },
            { yppDef: { not: null } },
            { successOff: { not: null } },
            { successDef: { not: null } },
          ]
        },
        orderBy: { updatedAt: 'desc' },
        take: 10, // Use last 10 games for better sample
      });

      if (gameStats.length === 0) {
        return null;
      }

      // Calculate averages from game stats
      const features = this.calculateGameAverages(gameStats);
      
      return {
        teamId,
        season,
        ...features,
        dataSource: 'game' as const,
        confidence: Math.min(1.0, gameStats.length / 8), // Higher confidence with more games
        gamesCount: gameStats.length,
        lastUpdated: gameStats[0]?.updatedAt || null,
      };
    } catch (error) {
      console.warn(`Failed to load game features for ${teamId} ${season}:`, error);
      return null;
    }
  }

  /**
   * Load features from season-level stats (fallback)
   */
  private async loadSeasonFeatures(teamId: string, season: number): Promise<TeamFeatures | null> {
    try {
      const seasonStats = await this.prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: {
            season,
            teamId,
          }
        }
      });

      if (!seasonStats) {
        return null;
      }

      return {
        teamId,
        season,
        yppOff: this.toNumber(seasonStats.yppOff),
        successOff: this.toNumber(seasonStats.successOff),
        epaOff: this.toNumber(seasonStats.epaOff),
        paceOff: this.toNumber(seasonStats.paceOff),
        passYpaOff: this.toNumber(seasonStats.passYpaOff),
        rushYpcOff: this.toNumber(seasonStats.rushYpcOff),
        yppDef: this.toNumber(seasonStats.yppDef),
        successDef: this.toNumber(seasonStats.successDef),
        epaDef: this.toNumber(seasonStats.epaDef),
        paceDef: this.toNumber(seasonStats.paceDef),
        passYpaDef: this.toNumber(seasonStats.passYpaDef),
        rushYpcDef: this.toNumber(seasonStats.rushYpcDef),
        dataSource: 'season' as const,
        confidence: 0.7, // Medium confidence for season stats
        gamesCount: 0, // Season stats don't track individual games
        lastUpdated: seasonStats.createdAt, // Use createdAt since updatedAt might not exist
      };
    } catch (error) {
      console.warn(`Failed to load season features for ${teamId} ${season}:`, error);
      return null;
    }
  }

  /**
   * Load features from baseline ratings (last resort)
   */
  private async loadBaselineFeatures(teamId: string, season: number): Promise<TeamFeatures | null> {
    try {
      const baselineRating = await this.prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season,
            teamId,
            modelVersion: 'v1',
          }
        }
      });

      if (!baselineRating) {
        return null;
      }

      // Convert baseline ratings to approximate features
      // This is a rough approximation - baseline ratings are offense/defense scores
      const offenseRating = this.toNumber(baselineRating.offenseRating) || 0;
      const defenseRating = this.toNumber(baselineRating.defenseRating) || 0;
      
      return {
        teamId,
        season,
        yppOff: offenseRating > 0 ? offenseRating / 10 : null, // Rough conversion
        successOff: null, // Not available from baseline
        epaOff: offenseRating > 0 ? offenseRating / 20 : null, // Rough conversion
        paceOff: null, // Not available from baseline
        passYpaOff: null, // Not available from baseline
        rushYpcOff: null, // Not available from baseline
        yppDef: defenseRating > 0 ? defenseRating / 10 : null, // Rough conversion
        successDef: null, // Not available from baseline
        epaDef: defenseRating > 0 ? defenseRating / 20 : null, // Rough conversion
        paceDef: null, // Not available from baseline
        passYpaDef: null, // Not available from baseline
        rushYpcDef: null, // Not available from baseline
        dataSource: 'baseline' as const,
        confidence: 0.3, // Low confidence for baseline approximations
        gamesCount: 0,
        lastUpdated: baselineRating.createdAt, // Use createdAt since updatedAt might not exist
      };
    } catch (error) {
      console.warn(`Failed to load baseline features for ${teamId} ${season}:`, error);
      return null;
    }
  }

  /**
   * Create missing features placeholder
   */
  private createMissingFeatures(teamId: string, season: number): TeamFeatures {
    return {
      teamId,
      season,
      yppOff: null,
      successOff: null,
      epaOff: null,
      paceOff: null,
      passYpaOff: null,
      rushYpcOff: null,
      yppDef: null,
      successDef: null,
      epaDef: null,
      paceDef: null,
      passYpaDef: null,
      rushYpcDef: null,
      talentComposite: null,
      blueChipsPct: null,
      commitsSignal: null,
      weeksPlayed: 0,
      dataSource: 'missing' as const,
      confidence: 0,
      gamesCount: 0,
      lastUpdated: null,
    };
  }

  /**
   * Calculate averages from game stats
   */
  private calculateGameAverages(gameStats: any[]): Partial<TeamFeatures> {
    const validStats = gameStats.filter(stat => 
      stat.yppOff !== null || stat.yppDef !== null || 
      stat.successOff !== null || stat.successDef !== null
    );

    if (validStats.length === 0) {
      return {};
    }

    const sums = validStats.reduce((acc, stat) => ({
      yppOff: acc.yppOff + (stat.yppOff || 0),
      successOff: acc.successOff + (stat.successOff || 0),
      epaOff: acc.epaOff + (stat.epaOff || 0),
      paceOff: acc.paceOff + (stat.pacePlaysGm || 0),
      passYpaOff: acc.passYpaOff + (stat.passYpaOff || 0),
      rushYpcOff: acc.rushYpcOff + (stat.rushYpcOff || 0),
      yppDef: acc.yppDef + (stat.yppDef || 0),
      successDef: acc.successDef + (stat.successDef || 0),
      epaDef: acc.epaDef + (stat.epaDef || 0),
      paceDef: acc.paceDef + (stat.paceDef || 0),
      passYpaDef: acc.passYpaDef + (stat.passYpaDef || 0),
      rushYpcDef: acc.rushYpcDef + (stat.rushYpcDef || 0),
    }), {
      yppOff: 0, successOff: 0, epaOff: 0, paceOff: 0, passYpaOff: 0, rushYpcOff: 0,
      yppDef: 0, successDef: 0, epaDef: 0, paceDef: 0, passYpaDef: 0, rushYpcDef: 0,
    });

    const count = validStats.length;
    
    return {
      yppOff: sums.yppOff / count || null,
      successOff: sums.successOff / count || null,
      epaOff: sums.epaOff / count || null,
      paceOff: sums.paceOff / count || null,
      passYpaOff: sums.passYpaOff / count || null,
      rushYpcOff: sums.rushYpcOff / count || null,
      yppDef: sums.yppDef / count || null,
      successDef: sums.successDef / count || null,
      epaDef: sums.epaDef / count || null,
      paceDef: sums.paceDef / count || null,
      passYpaDef: sums.passYpaDef / count || null,
      rushYpcDef: sums.rushYpcDef / count || null,
    };
  }

  /**
   * Get data source summary for a season
   */
  async getDataSourceSummary(season: number): Promise<DataSourceSummary> {
    try {
      // Get all teams for the season
      const teams = await this.prisma.team.findMany({
        select: { id: true }
      });

      const summary: DataSourceSummary = {
        gameFeatures: 0,
        seasonFeatures: 0,
        baselineOnly: 0,
        missing: 0,
        total: teams.length,
      };

      for (const team of teams) {
        const features = await this.loadTeamFeatures(team.id, season);
        
        switch (features.dataSource) {
          case 'game':
            summary.gameFeatures++;
            break;
          case 'season':
            summary.seasonFeatures++;
            break;
          case 'baseline':
            summary.baselineOnly++;
            break;
          case 'missing':
            summary.missing++;
            break;
        }
      }

      return summary;
    } catch (error) {
      console.error(`Failed to get data source summary for ${season}:`, error);
      return {
        gameFeatures: 0,
        seasonFeatures: 0,
        baselineOnly: 0,
        missing: 0,
        total: 0,
      };
    }
  }
}
