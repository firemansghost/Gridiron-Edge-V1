/**
 * Unit Matchup Card
 * 
 * Visualizes V2 unit grades (Run Offense, Pass Defense, etc.) to show
 * specific mismatches that drive the V2 model's predictions.
 */

interface UnitGrades {
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
  havocGrade: number;
}

interface UnitMatchupCardProps {
  homeGrades: UnitGrades;
  awayGrades: UnitGrades;
  homeTeamName: string;
  awayTeamName: string;
}

/**
 * Convert Z-score to letter grade
 */
function zScoreToGrade(zScore: number): { grade: string; color: string } {
  if (zScore >= 1.5) return { grade: 'A+', color: 'text-green-700 bg-green-50' };
  if (zScore >= 1.0) return { grade: 'A', color: 'text-green-600 bg-green-50' };
  if (zScore >= 0.5) return { grade: 'B+', color: 'text-green-500 bg-green-50' };
  if (zScore >= 0.0) return { grade: 'B', color: 'text-blue-600 bg-blue-50' };
  if (zScore >= -0.5) return { grade: 'C+', color: 'text-yellow-600 bg-yellow-50' };
  if (zScore >= -1.0) return { grade: 'C', color: 'text-orange-600 bg-orange-50' };
  if (zScore >= -1.5) return { grade: 'D', color: 'text-red-600 bg-red-50' };
  return { grade: 'F', color: 'text-red-700 bg-red-100' };
}

/**
 * Calculate advantage (positive = home advantage, negative = away advantage)
 */
function calculateAdvantage(homeOff: number, awayDef: number): number {
  return homeOff - awayDef;
}

export function UnitMatchupCard({
  homeGrades,
  awayGrades,
  homeTeamName,
  awayTeamName,
}: UnitMatchupCardProps) {
  // Calculate matchup advantages
  const homeRunAdv = calculateAdvantage(homeGrades.offRunGrade, awayGrades.defRunGrade);
  const awayRunAdv = calculateAdvantage(awayGrades.offRunGrade, homeGrades.defRunGrade);
  const netRunAdv = homeRunAdv - awayRunAdv;

  const homePassAdv = calculateAdvantage(homeGrades.offPassGrade, awayGrades.defPassGrade);
  const awayPassAdv = calculateAdvantage(awayGrades.offPassGrade, homeGrades.defPassGrade);
  const netPassAdv = homePassAdv - awayPassAdv;

  const homeExploAdv = calculateAdvantage(homeGrades.offExplosiveness, awayGrades.defExplosiveness);
  const awayExploAdv = calculateAdvantage(awayGrades.offExplosiveness, homeGrades.defExplosiveness);
  const netExploAdv = homeExploAdv - awayExploAdv;

  // Determine which team has the advantage
  const runAdvantage = netRunAdv > 0 ? homeTeamName : awayTeamName;
  const passAdvantage = netPassAdv > 0 ? homeTeamName : awayTeamName;
  const exploAdvantage = netExploAdv > 0 ? homeTeamName : awayTeamName;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        🔬 Unit Matchups (V2 Model)
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Head-to-head unit grades showing specific mismatches that drive the V2 model's prediction.
      </p>

      {/* Rushing Matchup */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">🏃 Rushing</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">{homeTeamName} Run Offense</div>
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(homeGrades.offRunGrade).color}`}>
                  {zScoreToGrade(homeGrades.offRunGrade).grade}
                </span>
                <span className="text-xs text-gray-600">
                  ({homeGrades.offRunGrade.toFixed(2)})
                </span>
              </div>
            </div>
            <div className="text-gray-400 mx-2">vs</div>
            <div className="flex-1 text-right">
              <div className="text-xs text-gray-500 mb-1">{awayTeamName} Run Defense</div>
              <div className="flex items-center justify-end space-x-2">
                <span className="text-xs text-gray-600">
                  ({awayGrades.defRunGrade.toFixed(2)})
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(awayGrades.defRunGrade).color}`}>
                  {zScoreToGrade(awayGrades.defRunGrade).grade}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">{awayTeamName} Run Offense</div>
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(awayGrades.offRunGrade).color}`}>
                  {zScoreToGrade(awayGrades.offRunGrade).grade}
                </span>
                <span className="text-xs text-gray-600">
                  ({awayGrades.offRunGrade.toFixed(2)})
                </span>
              </div>
            </div>
            <div className="text-gray-400 mx-2">vs</div>
            <div className="flex-1 text-right">
              <div className="text-xs text-gray-500 mb-1">{homeTeamName} Run Defense</div>
              <div className="flex items-center justify-end space-x-2">
                <span className="text-xs text-gray-600">
                  ({homeGrades.defRunGrade.toFixed(2)})
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(homeGrades.defRunGrade).color}`}>
                  {zScoreToGrade(homeGrades.defRunGrade).grade}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-600">Net Advantage:</span>
            <span className={`text-sm font-semibold ${netRunAdv > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netRunAdv > 0 ? '✅' : '❌'} {runAdvantage} +{Math.abs(netRunAdv).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Passing Matchup */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">✈️ Passing</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">{homeTeamName} Pass Offense</div>
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(homeGrades.offPassGrade).color}`}>
                  {zScoreToGrade(homeGrades.offPassGrade).grade}
                </span>
                <span className="text-xs text-gray-600">
                  ({homeGrades.offPassGrade.toFixed(2)})
                </span>
              </div>
            </div>
            <div className="text-gray-400 mx-2">vs</div>
            <div className="flex-1 text-right">
              <div className="text-xs text-gray-500 mb-1">{awayTeamName} Pass Defense</div>
              <div className="flex items-center justify-end space-x-2">
                <span className="text-xs text-gray-600">
                  ({awayGrades.defPassGrade.toFixed(2)})
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(awayGrades.defPassGrade).color}`}>
                  {zScoreToGrade(awayGrades.defPassGrade).grade}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">{awayTeamName} Pass Offense</div>
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(awayGrades.offPassGrade).color}`}>
                  {zScoreToGrade(awayGrades.offPassGrade).grade}
                </span>
                <span className="text-xs text-gray-600">
                  ({awayGrades.offPassGrade.toFixed(2)})
                </span>
              </div>
            </div>
            <div className="text-gray-400 mx-2">vs</div>
            <div className="flex-1 text-right">
              <div className="text-xs text-gray-500 mb-1">{homeTeamName} Pass Defense</div>
              <div className="flex items-center justify-end space-x-2">
                <span className="text-xs text-gray-600">
                  ({homeGrades.defPassGrade.toFixed(2)})
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(homeGrades.defPassGrade).color}`}>
                  {zScoreToGrade(homeGrades.defPassGrade).grade}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-600">Net Advantage:</span>
            <span className={`text-sm font-semibold ${netPassAdv > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netPassAdv > 0 ? '✅' : '❌'} {passAdvantage} +{Math.abs(netPassAdv).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Explosiveness Matchup */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">💥 Explosiveness</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">{homeTeamName} Explosiveness</div>
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(homeGrades.offExplosiveness).color}`}>
                  {zScoreToGrade(homeGrades.offExplosiveness).grade}
                </span>
                <span className="text-xs text-gray-600">
                  ({homeGrades.offExplosiveness.toFixed(2)})
                </span>
              </div>
            </div>
            <div className="text-gray-400 mx-2">vs</div>
            <div className="flex-1 text-right">
              <div className="text-xs text-gray-500 mb-1">{awayTeamName} Explosiveness Defense</div>
              <div className="flex items-center justify-end space-x-2">
                <span className="text-xs text-gray-600">
                  ({awayGrades.defExplosiveness.toFixed(2)})
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(awayGrades.defExplosiveness).color}`}>
                  {zScoreToGrade(awayGrades.defExplosiveness).grade}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">{awayTeamName} Explosiveness</div>
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(awayGrades.offExplosiveness).color}`}>
                  {zScoreToGrade(awayGrades.offExplosiveness).grade}
                </span>
                <span className="text-xs text-gray-600">
                  ({awayGrades.offExplosiveness.toFixed(2)})
                </span>
              </div>
            </div>
            <div className="text-gray-400 mx-2">vs</div>
            <div className="flex-1 text-right">
              <div className="text-xs text-gray-500 mb-1">{homeTeamName} Explosiveness Defense</div>
              <div className="flex items-center justify-end space-x-2">
                <span className="text-xs text-gray-600">
                  ({homeGrades.defExplosiveness.toFixed(2)})
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${zScoreToGrade(homeGrades.defExplosiveness).color}`}>
                  {zScoreToGrade(homeGrades.defExplosiveness).grade}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-600">Net Advantage:</span>
            <span className={`text-sm font-semibold ${netExploAdv > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netExploAdv > 0 ? '✅' : '❌'} {exploAdvantage} +{Math.abs(netExploAdv).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <strong>Note:</strong> Grades are Z-scores normalized across FBS. A+ (>1.5) = Elite, A (>1.0) = Excellent, 
          B (>0.0) = Above Average, C (>-1.0) = Below Average, D/F (<-1.0) = Poor.
        </p>
      </div>
    </div>
  );
}

