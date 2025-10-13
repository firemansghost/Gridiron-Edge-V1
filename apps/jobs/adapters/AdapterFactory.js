"use strict";
/**
 * M5 Adapter Factory
 *
 * Creates and configures data source adapters based on configuration.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdapterFactory = void 0;
const js_yaml_1 = __importDefault(require("js-yaml"));
const fs_1 = __importDefault(require("fs"));
const MockAdapter_1 = require("./MockAdapter");
class AdapterFactory {
    constructor(configPath = 'datasources.yml') {
        const configFile = fs_1.default.readFileSync(configPath, 'utf8');
        this.config = js_yaml_1.default.load(configFile);
    }
    /**
     * Create an adapter by name
     */
    async createAdapter(adapterName) {
        const name = adapterName || this.config.defaultAdapter;
        const adapterConfig = this.config.adapters[name];
        if (!adapterConfig) {
            throw new Error(`Adapter '${name}' not found in configuration`);
        }
        if (!adapterConfig.enabled) {
            throw new Error(`Adapter '${name}' is disabled`);
        }
        switch (adapterConfig.provider) {
            case 'mock':
                return new MockAdapter_1.MockAdapter(adapterConfig.config);
            // Live data adapters (to be implemented)
            case 'sgo':
                throw new Error('SportsGameOdds adapter not yet implemented.\n' +
                    'To add: create apps/jobs/adapters/SportsGameOddsAdapter.ts\n' +
                    'Set SGO_API_KEY environment variable when ready.');
            case 'weather-vc':
                throw new Error('Visual Crossing weather adapter not yet implemented.\n' +
                    'To add: create apps/jobs/adapters/VisualCrossingAdapter.ts\n' +
                    'Set VISUALCROSSING_API_KEY environment variable when ready.');
            // Future adapters
            case 'espn':
                throw new Error('ESPN adapter not yet implemented');
            case 'odds-api':
                throw new Error('Odds API adapter not yet implemented');
            case 'sports-reference':
                throw new Error('Sports Reference adapter not yet implemented');
            default:
                throw new Error(`Unknown adapter provider: ${adapterConfig.provider}`);
        }
    }
    /**
     * Get list of available adapters
     */
    getAvailableAdapters() {
        return Object.keys(this.config.adapters).filter(name => this.config.adapters[name].enabled);
    }
    /**
     * Get adapter configuration
     */
    getAdapterConfig(adapterName) {
        return this.config.adapters[adapterName];
    }
}
exports.AdapterFactory = AdapterFactory;
