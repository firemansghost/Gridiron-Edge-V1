import {
  determineGenericShadowT30AutomationOutcome,
} from '@/lib/generic-shadow-t30-automation-v1';
import type { GenericShadowT30Counts } from '@/lib/shadow-model-t30-closing-v1';

function counts(extra: Partial<GenericShadowT30Counts> = {}): GenericShadowT30Counts {
  return {
    totalPredictions: 1,
    existingCount: 0,
    futureCount: 1,
    dueCount: 0,
    missedCount: 0,
    plannedAvailableCount: 0,
    plannedUnavailableCount: 0,
    plannedInsertCount: 0,
    ...extra,
  };
}

describe('Generic Shadow T-30 Automation V1 — outcome precedence', () => {
  it('keeps a current market-refresh need actionable even when an earlier target was missed', () => {
    expect(
      determineGenericShadowT30AutomationOutcome({
        blockers: [],
        counts: counts({ missedCount: 1 }),
        marketRefreshWindowOpenCount: 1,
        marketRefreshNeeded: true,
      })
    ).toBe('PREVIEW_ONLY');
  });

  it('keeps a current DUE closing actionable even when an earlier target was missed', () => {
    expect(
      determineGenericShadowT30AutomationOutcome({
        blockers: [],
        counts: counts({ dueCount: 1, missedCount: 1 }),
        marketRefreshWindowOpenCount: 0,
        marketRefreshNeeded: false,
      })
    ).toBe('PREVIEW_ONLY');
  });

  it('reports a historical miss when there is no current actionable work', () => {
    expect(
      determineGenericShadowT30AutomationOutcome({
        blockers: [],
        counts: counts({ missedCount: 1 }),
        marketRefreshWindowOpenCount: 0,
        marketRefreshNeeded: false,
      })
    ).toBe('MISSED_TARGET_PRESENT');
  });

  it('keeps blockers highest priority', () => {
    expect(
      determineGenericShadowT30AutomationOutcome({
        blockers: ['frame_invalid'],
        counts: counts({ dueCount: 1, missedCount: 1 }),
        marketRefreshWindowOpenCount: 1,
        marketRefreshNeeded: true,
      })
    ).toBe('BLOCKED');
  });
});
