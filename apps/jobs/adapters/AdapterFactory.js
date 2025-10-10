/**
 * M5 Adapter Factory
 * 
 * Creates and configures data source adapters based on configuration.
 */

const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const { MockAdapter } = require('./MockAdapter');

class AdapterFactory {
  constructor(configPath = 'datasources.yml') {
    const configFile = fs.readFileSync(configPath, 'utf8');
    this.config = yaml.load(configFile);
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
        return new MockAdapter(adapterConfig.config);
      
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
    return Object.keys(this.config.adapters).filter(
      name => this.config.adapters[name].enabled
    );
  }

  /**
   * Get adapter configuration
   */
  getAdapterConfig(adapterName) {
    return this.config.adapters[adapterName];
  }
}

module.exports = { AdapterFactory };
