/**
 * Model Weights Configuration Loader
 * 
 * Loads and provides type-safe access to model configuration from model-weights.yml
 */

import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - js-yaml is available in root node_modules
import * as yaml from 'js-yaml';

export interface ModelConfig {
  name: string;
  description: string;
  hfa: number;
  offensive_weights: {
    ypp_off: number;
    pass_ypa_off: number;
    rush_ypc_off: number;
    success_off: number;
    epa_off: number;
  };
  defensive_weights: {
    ypp_def: number;
    pass_ypa_def: number;
    rush_ypc_def: number;
    success_def: number;
    epa_def: number;
  };
  confidence_tiers: {
    A: number;
    B: number;
    C: number;
  };
  min_edge_threshold: number;
  // Optional v2-specific fields
  shrinkage?: {
    base_factor: number;
    confidence_weight: number;
    games_weight: number;
  };
  sos?: {
    enabled: boolean;
    iterations: number;
    convergence_threshold: number;
  };
}

export interface ModelWeightsConfig {
  [version: string]: ModelConfig;
}

/**
 * Parse YAML using js-yaml
 */
function parseYAML(content: string): ModelWeightsConfig {
  const parsed = yaml.load(content) as ModelWeightsConfig;
  
  // Validate and set defaults for required fields
  for (const version in parsed) {
    const cfg = parsed[version];
    if (!cfg.hfa) cfg.hfa = 2.0;
    if (!cfg.min_edge_threshold) cfg.min_edge_threshold = 2.0;
    
    // Ensure offensive_weights exist
    if (!cfg.offensive_weights) {
      cfg.offensive_weights = {
        ypp_off: 0.30,
        pass_ypa_off: 0.20,
        rush_ypc_off: 0.15,
        success_off: 0.20,
        epa_off: 0.15,
      };
    }
    
    // Ensure defensive_weights exist
    if (!cfg.defensive_weights) {
      cfg.defensive_weights = {
        ypp_def: 0.20,
        pass_ypa_def: 0.20,
        rush_ypc_def: 0.15,
        success_def: 0.25,
        epa_def: 0.20,
      };
    }
    
    // Ensure confidence_tiers exist
    if (!cfg.confidence_tiers) {
      cfg.confidence_tiers = {
        A: 4.0,
        B: 3.0,
        C: 2.0,
      };
    }
  }

  return parsed;
}

let cachedConfig: ModelWeightsConfig | null = null;

/**
 * Load model weights configuration from YAML file
 */
export function loadModelConfig(): ModelWeightsConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Handle both compiled (dist) and source locations
  const configPath = path.join(__dirname, '../../config/model-weights.yml');
  let content: string;
  
  try {
    content = fs.readFileSync(configPath, 'utf-8');
  } catch (error) {
    // Try alternative path (if running from source)
    const altPath = path.join(__dirname, '../../../config/model-weights.yml');
    content = fs.readFileSync(altPath, 'utf-8');
  }
  
  cachedConfig = parseYAML(content);
  
  return cachedConfig;
}

/**
 * Get configuration for a specific model version
 */
export function getModelConfig(version: string = 'v1'): ModelConfig {
  const config = loadModelConfig();
  const modelConfig = config[version];
  
  if (!modelConfig) {
    throw new Error(`Model configuration for version "${version}" not found. Available versions: ${Object.keys(config).join(', ')}`);
  }
  
  return modelConfig;
}

/**
 * Clear the cached configuration (useful for testing)
 */
export function clearModelConfigCache(): void {
  cachedConfig = null;
}

