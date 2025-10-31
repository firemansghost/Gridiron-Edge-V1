/**
 * Ratings Configuration & Backtesting Page
 * 
 * Allows users to adjust rating weights and run backtests
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

interface OffensiveWeights {
  yppOff: number;
  passYpaOff: number;
  rushYpcOff: number;
  successOff: number;
  epaOff: number;
}

interface DefensiveWeights {
  yppDef: number;
  passYpaDef: number;
  rushYpcDef: number;
  successDef: number;
  epaDef: number;
}

const DEFAULT_OFFENSIVE_WEIGHTS: OffensiveWeights = {
  yppOff: 0.30,
  passYpaOff: 0.20,
  rushYpcOff: 0.15,
  successOff: 0.20,
  epaOff: 0.15,
};

const DEFAULT_DEFENSIVE_WEIGHTS: DefensiveWeights = {
  yppDef: 0.20,
  passYpaDef: 0.20,
  rushYpcDef: 0.15,
  successDef: 0.25,
  epaDef: 0.20,
};

export default function RatingsConfigPage() {
  const [offensiveWeights, setOffensiveWeights] = useState<OffensiveWeights>(DEFAULT_OFFENSIVE_WEIGHTS);
  const [defensiveWeights, setDefensiveWeights] = useState<DefensiveWeights>(DEFAULT_DEFENSIVE_WEIGHTS);
  const [backtestSeason, setBacktestSeason] = useState<string>('2024');
  const [backtestWeeks, setBacktestWeeks] = useState<string>('1-12');
  const [minEdge, setMinEdge] = useState<string>('3');
  const [kellyFraction, setKellyFraction] = useState<string>('0.25');
  const [configName, setConfigName] = useState<string>('');
  const [savedConfigs, setSavedConfigs] = useState<Array<{ name: string; config: any }>>([]);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  const normalizeWeights = (weights: any, total: number): any => {
    const sum = Object.values(weights).reduce((acc: number, val: any) => acc + Number(val || 0), 0);
    if (sum === 0) return weights;
    const factor = total / sum;
    const normalized: any = {};
    for (const key in weights) {
      normalized[key] = (Number(weights[key] || 0) * factor).toFixed(3);
    }
    return normalized;
  };

  const handleOffensiveWeightChange = (key: keyof OffensiveWeights, value: string) => {
    const newWeights = { ...offensiveWeights, [key]: parseFloat(value) || 0 };
    const normalized = normalizeWeights(newWeights, 1.0);
    setOffensiveWeights(normalized as OffensiveWeights);
  };

  const handleDefensiveWeightChange = (key: keyof DefensiveWeights, value: string) => {
    const newWeights = { ...defensiveWeights, [key]: parseFloat(value) || 0 };
    const normalized = normalizeWeights(newWeights, 1.0);
    setDefensiveWeights(normalized as DefensiveWeights);
  };

  // Load saved configs from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ratings-configs');
      if (saved) {
        const configs = JSON.parse(saved);
        setSavedConfigs(configs);
      }
    } catch (error) {
      console.error('Error loading saved configs:', error);
    }
  }, []);

  const handleSaveWeights = () => {
    if (!configName.trim()) {
      setMessage('Please enter a name for this configuration');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    const config = {
      offensiveWeights,
      defensiveWeights,
      backtestSettings: {
        season: backtestSeason,
        weeks: backtestWeeks,
        minEdge: parseFloat(minEdge),
        kellyFraction: parseFloat(kellyFraction),
      },
    };

    try {
      const updated = [...savedConfigs.filter(c => c.name !== configName), { name: configName, config }];
      localStorage.setItem('ratings-configs', JSON.stringify(updated));
      setSavedConfigs(updated);
      setMessage(`Configuration "${configName}" saved successfully!`);
      setMessageType('success');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error saving configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setMessageType('error');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleLoadConfig = (configName: string) => {
    const saved = savedConfigs.find(c => c.name === configName);
    if (saved) {
      setOffensiveWeights(saved.config.offensiveWeights);
      setDefensiveWeights(saved.config.defensiveWeights);
      if (saved.config.backtestSettings) {
        setBacktestSeason(saved.config.backtestSettings.season);
        setBacktestWeeks(saved.config.backtestSettings.weeks);
        setMinEdge(saved.config.backtestSettings.minEdge.toString());
        setKellyFraction(saved.config.backtestSettings.kellyFraction.toString());
      }
      setConfigName(configName);
      setMessage(`Configuration "${configName}" loaded`);
      setMessageType('success');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleDeleteConfig = (configName: string) => {
    try {
      const updated = savedConfigs.filter(c => c.name !== configName);
      localStorage.setItem('ratings-configs', JSON.stringify(updated));
      setSavedConfigs(updated);
      if (configName === configName) {
        setConfigName('');
      }
      setMessage(`Configuration "${configName}" deleted`);
      setMessageType('success');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error deleting configuration');
      setMessageType('error');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleExportWeights = () => {
    const config = {
      offensiveWeights,
      defensiveWeights,
      backtestSettings: {
        season: backtestSeason,
        weeks: backtestWeeks,
        minEdge: parseFloat(minEdge),
        kellyFraction: parseFloat(kellyFraction),
      },
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ratings-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    setMessage('Configuration exported!');
    setMessageType('success');
    setTimeout(() => setMessage(''), 3000);
  };

  const handleRunBacktest = () => {
    // TODO: Implement API endpoint to trigger backtest with custom weights
    setMessage('Backtest with custom weights not yet implemented. Use the backtest command-line tool with exported config.');
    setMessageType('error');
    setTimeout(() => setMessage(''), 5000);
  };

  const resetWeights = () => {
    setOffensiveWeights(DEFAULT_OFFENSIVE_WEIGHTS);
    setDefensiveWeights(DEFAULT_DEFENSIVE_WEIGHTS);
    setMessage('Weights reset to defaults');
    setMessageType('success');
    setTimeout(() => setMessage(''), 3000);
  };

  const offensiveTotal = Object.values(offensiveWeights).reduce((sum, val) => sum + Number(val), 0);
  const defensiveTotal = Object.values(defensiveWeights).reduce((sum, val) => sum + Number(val), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNav />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Ratings Configuration</h1>
          <p className="text-gray-600">
            Adjust feature weights for Ratings v1 and configure backtesting parameters
          </p>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            messageType === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
            messageType === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
            'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            {message}
          </div>
        )}

        {/* Offensive Weights */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-green-700">Offensive Feature Weights</h2>
            <div className={`text-sm font-medium ${Math.abs(offensiveTotal - 1.0) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              Total: {offensiveTotal.toFixed(3)} {Math.abs(offensiveTotal - 1.0) >= 0.01 && '(should be 1.0)'}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {Object.entries(offensiveWeights).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={value}
                  onChange={(e) => handleOffensiveWeightChange(key as keyof OffensiveWeights, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <div className="text-xs text-gray-500 mt-1">{Number(value).toFixed(3)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Defensive Weights */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-red-700">Defensive Feature Weights</h2>
            <div className={`text-sm font-medium ${Math.abs(defensiveTotal - 1.0) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              Total: {defensiveTotal.toFixed(3)} {Math.abs(defensiveTotal - 1.0) >= 0.01 && '(should be 1.0)'}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {Object.entries(defensiveWeights).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={value}
                  onChange={(e) => handleDefensiveWeightChange(key as keyof DefensiveWeights, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <div className="text-xs text-gray-500 mt-1">{Number(value).toFixed(3)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Backtest Settings */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Backtest Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
              <input
                type="text"
                value={backtestSeason}
                onChange={(e) => setBacktestSeason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="2024"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weeks</label>
              <input
                type="text"
                value={backtestWeeks}
                onChange={(e) => setBacktestWeeks(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="1-12"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Edge (pts)</label>
              <input
                type="number"
                step="0.1"
                value={minEdge}
                onChange={(e) => setMinEdge(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kelly Fraction</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={kellyFraction}
                onChange={(e) => setKellyFraction(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleExportWeights}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              Export Configuration (JSON)
            </button>
            <button
              onClick={resetWeights}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition"
            >
              Reset to Defaults
            </button>
            <Link
              href="/backtests"
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition inline-block text-center"
            >
              View Backtest Results →
            </Link>
          </div>
          
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <h3 className="font-medium text-yellow-900 mb-2">How to Use Custom Weights</h3>
            <ol className="list-decimal list-inside text-sm text-yellow-800 space-y-1">
              <li>Adjust weights above (they auto-normalize to sum to 1.0)</li>
              <li>Export the configuration as JSON</li>
              <li>Use the exported config with the command-line backtest tool:
                <pre className="mt-2 p-2 bg-yellow-100 rounded text-xs overflow-x-auto">
                  npm run backtest -- --season {backtestSeason} --weeks {backtestWeeks} --minEdge {minEdge} --kelly {kellyFraction} --weights config.json
                </pre>
              </li>
              <li>Upload the resulting CSV to <Link href="/backtests" className="underline">/backtests</Link> to visualize results</li>
            </ol>
          </div>
        </div>

        {/* Current Default Weights Info */}
        <div className="mt-6 bg-gray-100 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Current Default Weights (Ratings v1)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium text-green-700 mb-1">Offensive:</div>
              <div className="font-mono text-gray-700">
                {Object.entries(DEFAULT_OFFENSIVE_WEIGHTS).map(([key, val]) => (
                  <div key={key}>{key}: {val.toFixed(2)}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-medium text-red-700 mb-1">Defensive:</div>
              <div className="font-mono text-gray-700">
                {Object.entries(DEFAULT_DEFENSIVE_WEIGHTS).map(([key, val]) => (
                  <div key={key}>{key}: {val.toFixed(2)}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

