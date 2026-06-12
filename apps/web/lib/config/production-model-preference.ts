/**
 * Production model preference resolution (URL + localStorage).
 * Pure helpers used by ProductionModelContext; no API or slate behavior changes until Phase D.
 */

import {
  AVAILABLE_PRODUCTION_MODELS,
  DEFAULT_PRODUCTION_MODEL,
  PRODUCTION_MODEL_LABELS,
  type ProductionModelId,
} from './production-models';

export const PRODUCTION_MODEL_STORAGE_KEY = 'ge:productionModel';
export const PRODUCTION_MODEL_QUERY_PARAM = 'model';

export function isValidProductionModelId(
  value: string | null | undefined
): value is ProductionModelId {
  if (!value) {
    return false;
  }
  return (AVAILABLE_PRODUCTION_MODELS as readonly string[]).includes(value);
}

/**
 * Resolve active production model. URL param wins over localStorage; invalid values fall back to default.
 */
export function resolveProductionModelFromSources(sources: {
  urlModel: string | null | undefined;
  storedModel: string | null | undefined;
}): ProductionModelId {
  if (isValidProductionModelId(sources.urlModel)) {
    return sources.urlModel;
  }
  if (isValidProductionModelId(sources.storedModel)) {
    return sources.storedModel;
  }
  return DEFAULT_PRODUCTION_MODEL;
}

/** Options exposed by ProductionModelSelector (labs models excluded). */
export function getProductionModelSelectorOptions(): Array<{
  id: ProductionModelId;
  label: string;
}> {
  return AVAILABLE_PRODUCTION_MODELS.map((id) => ({
    id,
    label: PRODUCTION_MODEL_LABELS[id],
  }));
}
