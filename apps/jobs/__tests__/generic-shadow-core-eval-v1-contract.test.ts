import * as fs from 'fs';
import * as path from 'path';
import { SHADOW_POLICY_DEFINITION_MANIFEST } from '../../web/lib/shadow-snapshot-v1';

const ROOT = path.resolve(__dirname, '../../..');
const CONTRACT = path.join(
  ROOT,
  'research/generic-shadow/GENERIC_SHADOW_CORE_EVAL_V1_READONLY_CONTRACT.md'
);

describe('Generic Shadow CORE_EVAL_V1 read-only contract', () => {
  const contract = fs.readFileSync(CONTRACT, 'utf8');

  it('preserves the frozen CORE_EVAL_V1 ATS settlement semantics', () => {
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.evaluationProtocol).toBe('CORE_EVAL_V1');
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.atsSettlement.coverMargin).toBe(
      'sideMargin + predictionPickLine'
    );
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.atsSettlement.win).toBe(
      'coverMargin > 0'
    );
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.atsSettlement.push).toBe(
      'coverMargin = 0'
    );
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.atsSettlement.loss).toBe(
      'coverMargin < 0'
    );
    expect(
      SHADOW_POLICY_DEFINITION_MANIFEST.atsSettlement.noOfficialBetHalfPointPushBand
    ).toBe(true);

    expect(contract).toContain('coverMargin > 0  -> WIN');
    expect(contract).toContain('coverMargin = 0  -> PUSH');
    expect(contract).toContain('coverMargin < 0  -> LOSS');
    expect(contract).toContain('1e-9');
  });

  it('preserves the frozen side-specific CLV semantics', () => {
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.shadowClv.homeClosingTeamLine).toBe(
      '-closingMarketHma'
    );
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.shadowClv.awayClosingTeamLine).toBe(
      '+closingMarketHma'
    );
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.shadowClv.clvPoints).toBe(
      'predictionPickLine - closingTeamLine'
    );
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.shadowClv.noSelection).toBe(
      'NOT_APPLICABLE'
    );
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.shadowClv.missingT30OnSelectedSide).toBe(
      'UNAVAILABLE'
    );

    expect(contract).toContain('predictionPickValue - closingTeamLine');
    expect(contract).toContain('Positive CLV means the prediction captured the better ATS number.');
    expect(contract).toContain('Never');
    expect(contract).toContain('reconstruct a missed T−30 close');
  });

  it('preserves the frozen research ROI convention and read-only boundary', () => {
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.researchRoi.researchOnly).toBe(true);
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.researchRoi.flatStake).toBe(100);
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.researchRoi.assumedAmericanPrice).toBe(-110);
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.researchRoi.winPnl).toBe(90.9);
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.researchRoi.lossPnl).toBe(-100);
    expect(SHADOW_POLICY_DEFINITION_MANIFEST.researchRoi.pushPnl).toBe(0);
    expect(
      SHADOW_POLICY_DEFINITION_MANIFEST.researchRoi.noSelectionExcludedFromGradedStake
    ).toBe(true);

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
