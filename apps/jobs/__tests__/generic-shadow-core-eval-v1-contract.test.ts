import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const CONTRACT = path.join(
  ROOT,
  'research/generic-shadow/GENERIC_SHADOW_CORE_EVAL_V1_READONLY_CONTRACT.md'
);
const HYBRID_SOURCE = path.join(ROOT, 'apps/web/lib/shadow-snapshot-v1.ts');

describe('Generic Shadow CORE_EVAL_V1 read-only contract', () => {
  const contract = fs.readFileSync(CONTRACT, 'utf8');
  const hybridSource = fs.readFileSync(HYBRID_SOURCE, 'utf8');

  it('preserves the frozen CORE_EVAL_V1 ATS settlement semantics', () => {
    expect(hybridSource).toContain("evaluationProtocol: SHADOW_EVALUATION_PROTOCOL");
    expect(hybridSource).toContain("homeSideMargin: 'homeScore - awayScore'");
    expect(hybridSource).toContain("awaySideMargin: 'awayScore - homeScore'");
    expect(hybridSource).toContain("coverMargin: 'sideMargin + predictionPickLine'");
    expect(hybridSource).toContain("win: 'coverMargin > 0'");
    expect(hybridSource).toContain("push: 'coverMargin = 0'");
    expect(hybridSource).toContain("loss: 'coverMargin < 0'");
    expect(hybridSource).toContain('noOfficialBetHalfPointPushBand: true');

    expect(contract).toContain('coverMargin > 0  -> WIN');
    expect(contract).toContain('coverMargin = 0  -> PUSH');
    expect(contract).toContain('coverMargin < 0  -> LOSS');
    expect(contract).toContain('1e-9');
  });

  it('preserves the frozen side-specific CLV semantics', () => {
    expect(hybridSource).toContain("homeClosingTeamLine: '-closingMarketHma'");
    expect(hybridSource).toContain("awayClosingTeamLine: '+closingMarketHma'");
    expect(hybridSource).toContain(
      "clvPoints: 'predictionPickLine - closingTeamLine'"
    );
    expect(hybridSource).toContain("noSelection: 'NOT_APPLICABLE'");
    expect(hybridSource).toContain("missingT30OnSelectedSide: 'UNAVAILABLE'");

    expect(contract).toContain('predictionPickValue - closingTeamLine');
    expect(contract).toContain(
      'Positive CLV means the prediction captured the better ATS number.'
    );
    expect(contract).toContain('reconstruct a missed T−30 close');
  });

  it('preserves the frozen research ROI convention and read-only boundary', () => {
    expect(hybridSource).toContain('researchOnly: true');
    expect(hybridSource).toContain('flatStake: 100');
    expect(hybridSource).toContain('assumedAmericanPrice: -110');
    expect(hybridSource).toContain('winPnl: 90.9');
    expect(hybridSource).toContain('lossPnl: -100');
    expect(hybridSource).toContain('pushPnl: 0');
    expect(hybridSource).toContain('noSelectionExcludedFromGradedStake: true');

    expect(contract).toContain('flat risk stake = **$100**');
    expect(contract).toContain('WIN PnL = **+$90.90**');
    expect(contract).toContain('LOSS PnL = **−$100.00**');
    expect(contract).toContain('PUSH PnL = **$0.00**');
    expect(contract).toContain('readOnly = true');
    expect(contract).toContain('providerCalls = 0');
    expect(contract).toContain('mutationsInvoked = false');
  });

  it('keeps Generic and Hybrid evidence families separate', () => {
    expect(contract).toContain('ShadowModelCaptureRun');
    expect(contract).toContain('ShadowModelPrediction');
    expect(contract).toContain('ShadowModelClosingMarketSnapshot');
    expect(contract).toContain('must **not** read Hybrid');
    expect(contract).toContain('ShadowEvaluationResult');
  });
});
