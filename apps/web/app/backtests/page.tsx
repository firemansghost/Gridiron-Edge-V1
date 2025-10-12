/**
 * Backtests Viewer Page
 * 
 * Client-side CSV upload and visualization for backtest reports
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

interface BacktestRow {
  season: string;
  week: string;
  gameId: string;
  matchup: string;
  betType: string;
  pickLabel: string;
  line: string;
  marketLine: string;
  edge: string;
  confidence: string;
  price: string;
  stake: string;
  result: string;
  pnl: string;
  clv: string;
  homeScore: string;
  awayScore: string;
}

interface SummaryStats {
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  hitRate: number;
  totalRisked: number;
  totalProfit: number;
  roi: number;
  avgClv: number;
  maxDrawdown: number;
  avgStake: number;
  confidenceBreakdown: {
    A: number;
    B: number;
    C: number;
  };
}

export default function BacktestsPage() {
  const [data, setData] = useState<BacktestRow[]>([]);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof BacktestRow; direction: 'asc' | 'desc' } | null>(null);
  const [filterConfidence, setFilterConfidence] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [parseInfo, setParseInfo] = useState<string>('');
  const [skippedRows, setSkippedRows] = useState<number>(0);

  // Header normalization map
  const normalizeHeader = (header: string): string => {
    const normalized = header.trim().toLowerCase();
    const headerMap: { [key: string]: string } = {
      'bettype': 'betType',
      'bet_type': 'betType',
      'marketline': 'marketLine',
      'market_line': 'marketLine',
      'picklabel': 'pickLabel',
      'pick_label': 'pickLabel',
      'homescore': 'homeScore',
      'home_score': 'homeScore',
      'awayscore': 'awayScore',
      'away_score': 'awayScore',
      'gameid': 'gameId',
      'game_id': 'gameId',
      'p/l': 'pnl',
      'pl': 'pnl',
      'conf': 'confidence',
    };
    
    return headerMap[normalized] || normalized;
  };

  const parseCSV = (file: File) => {
    setError('');
    setParseInfo('');
    setSkippedRows(0);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // We'll handle type coercion manually
      delimiter: undefined, // Auto-detect
      transformHeader: (h: string) => normalizeHeader(h),
      complete: (results) => {
        try {
          const rawRows = results.data as any[];
          
          if (rawRows.length === 0) {
            setError('No rows parsed. Please check your CSV format.');
            return;
          }

          // Validate required columns
          const requiredColumns = ['gameId', 'betType', 'pickLabel', 'edge', 'confidence'];
          const firstRow = rawRows[0];
          const missingColumns = requiredColumns.filter(col => !(col in firstRow));
          
          if (missingColumns.length > 0) {
            setError(`Missing required columns: ${missingColumns.join(', ')}`);
            return;
          }

          // Process and validate rows
          const validRows: BacktestRow[] = [];
          let skipped = 0;

          rawRows.forEach((row, index) => {
            // Skip rows without gameId
            if (!row.gameId || String(row.gameId).trim() === '') {
              skipped++;
              return;
            }

            // Coerce numeric fields
            const coerceNumber = (val: any): string => {
              if (val === null || val === undefined || val === '') return '';
              const num = parseFloat(String(val).trim());
              return isNaN(num) ? '' : String(num);
            };

            // Trim string fields
            const trimString = (val: any): string => {
              return val ? String(val).trim() : '';
            };

            validRows.push({
              season: trimString(row.season),
              week: trimString(row.week),
              gameId: trimString(row.gameId),
              matchup: trimString(row.matchup),
              betType: trimString(row.betType),
              pickLabel: trimString(row.pickLabel),
              line: coerceNumber(row.line),
              marketLine: coerceNumber(row.marketLine),
              edge: coerceNumber(row.edge),
              confidence: trimString(row.confidence),
              price: coerceNumber(row.price),
              stake: coerceNumber(row.stake),
              result: trimString(row.result),
              pnl: coerceNumber(row.pnl),
              clv: coerceNumber(row.clv),
              homeScore: coerceNumber(row.homeScore),
              awayScore: coerceNumber(row.awayScore),
            });
          });

          if (validRows.length === 0) {
            setError('No valid rows found after parsing. Check that your CSV has data rows with gameId.');
            return;
          }

          console.debug('CSV Parsing Success - First 3 rows:', validRows.slice(0, 3));
          
          setData(validRows);
          calculateSummary(validRows);
          setParseInfo(`Parsed ${validRows.length} rows`);
          
          if (skipped > 0) {
            setSkippedRows(skipped);
          }
        } catch (err) {
          setError('Error processing CSV: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      },
      error: (error) => {
        setError('Error parsing CSV: ' + error.message);
      },
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    parseCSV(file);
  };

  const handleDemoLoad = async () => {
    setError('');
    setParseInfo('Loading demo...');
    
    try {
      const response = await fetch('/demo/backtest_sample.csv');
      if (!response.ok) throw new Error('Failed to load demo file');
      
      const text = await response.text();
      const blob = new Blob([text], { type: 'text/csv' });
      const file = new File([blob], 'demo.csv', { type: 'text/csv' });
      parseCSV(file);
    } catch (err) {
      setError('Failed to load demo: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setParseInfo('');
    }
  };

  const calculateSummary = (rows: BacktestRow[]) => {
    const completedBets = rows.filter(r => r.result && r.result !== 'PENDING');
    const wins = completedBets.filter(r => r.result === 'WIN').length;
    const losses = completedBets.filter(r => r.result === 'LOSS').length;
    const pushes = completedBets.filter(r => r.result === 'PUSH').length;
    const pending = rows.filter(r => !r.result || r.result === 'PENDING').length;

    const totalRisked = completedBets.reduce((sum, r) => sum + parseFloat(r.stake || '0'), 0);
    const totalProfit = completedBets.reduce((sum, r) => sum + parseFloat(r.pnl || '0'), 0);
    const roi = totalRisked > 0 ? (totalProfit / totalRisked) * 100 : 0;

    const clvValues = rows.filter(r => r.clv && r.clv !== '').map(r => parseFloat(r.clv));
    const avgClv = clvValues.length > 0 ? clvValues.reduce((a, b) => a + b, 0) / clvValues.length : 0;

    // Calculate max drawdown
    let cumulativePnl = 0;
    let peak = 0;
    let maxDD = 0;
    completedBets.forEach(r => {
      cumulativePnl += parseFloat(r.pnl || '0');
      if (cumulativePnl > peak) peak = cumulativePnl;
      const drawdown = peak - cumulativePnl;
      if (drawdown > maxDD) maxDD = drawdown;
    });

    const confidenceBreakdown = {
      A: rows.filter(r => r.confidence === 'A').length,
      B: rows.filter(r => r.confidence === 'B').length,
      C: rows.filter(r => r.confidence === 'C').length,
    };

    const avgStake = totalRisked / (completedBets.length || 1);

    setSummary({
      totalBets: rows.length,
      wins,
      losses,
      pushes,
      pending,
      hitRate: completedBets.length > 0 ? (wins / completedBets.length) * 100 : 0,
      totalRisked,
      totalProfit,
      roi,
      avgClv,
      maxDrawdown: maxDD,
      avgStake,
      confidenceBreakdown,
    });
  };

  const handleSort = (key: keyof BacktestRow) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedData = () => {
    let filteredData = [...data];
    
    // Apply confidence filter
    if (filterConfidence) {
      filteredData = filteredData.filter(row => row.confidence === filterConfidence);
    }

    // Apply sorting
    if (sortConfig) {
      filteredData.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        // Try to parse as numbers for numeric sorting
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        // String comparison
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filteredData;
  };

  // Prepare chart data
  const getEquityData = () => {
    const completedBets = data.filter(r => r.result && r.result !== 'PENDING');
    let cumulative = 0;
    return completedBets.map((row, index) => {
      cumulative += parseFloat(row.pnl || '0');
      return {
        bet: index + 1,
        equity: cumulative,
      };
    });
  };

  const getDrawdownData = () => {
    const completedBets = data.filter(r => r.result && r.result !== 'PENDING');
    let cumulative = 0;
    let peak = 0;
    return completedBets.map((row, index) => {
      cumulative += parseFloat(row.pnl || '0');
      if (cumulative > peak) peak = cumulative;
      return {
        bet: index + 1,
        drawdown: peak - cumulative,
      };
    });
  };

  const getEdgeHistogram = () => {
    const edges = data.map(r => parseFloat(r.edge || '0'));
    const buckets: { [key: string]: number } = {};
    
    edges.forEach(edge => {
      const bucket = Math.floor(edge);
      const key = `${bucket}-${bucket + 1}`;
      buckets[key] = (buckets[key] || 0) + 1;
    });

    return Object.entries(buckets).map(([range, count]) => ({
      range,
      count,
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Backtest Viewer</h1>
            <p className="text-gray-600 mt-1">Upload and analyze backtest CSV reports</p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700 font-medium">CSV Parsing Error</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Backtest CSV</h2>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <label className="flex-1">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
                      cursor-pointer"
                  />
                </label>
              </div>
              
              {/* Parse info and warnings */}
              <div className="flex flex-col gap-2">
                {parseInfo && (
                  <div className="text-sm text-green-600 font-medium">
                    ✓ {parseInfo}
                  </div>
                )}
                {skippedRows > 0 && (
                  <div className="text-sm text-yellow-600 bg-yellow-50 px-3 py-2 rounded">
                    ⚠ Skipped {skippedRows} invalid row{skippedRows > 1 ? 's' : ''} (missing gameId or empty)
                  </div>
                )}
              </div>

              {/* Demo and Template buttons */}
              <div className="flex items-center gap-4 pt-2 border-t border-gray-200">
                <button
                  onClick={handleDemoLoad}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                >
                  📊 Load Demo CSV
                </button>
                <a
                  href="/demo/backtest_header.csv"
                  download="backtest_header.csv"
                  className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm font-medium"
                >
                  📥 Download Header Template
                </a>
              </div>

              <p className="text-xs text-gray-500">
                Upload a CSV file from /reports/backtest_*.csv or try the demo
              </p>
            </div>
          </div>

          {data.length > 0 && summary && (
            <>
              {/* Summary Tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-2xl font-bold text-blue-600">{summary.totalBets}</div>
                  <div className="text-xs text-gray-600">Total Bets</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-2xl font-bold text-green-600">{summary.hitRate.toFixed(1)}%</div>
                  <div className="text-xs text-gray-600">Hit Rate</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className={`text-2xl font-bold ${summary.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary.roi >= 0 ? '+' : ''}{summary.roi.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-600">ROI</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-2xl font-bold text-blue-600">
                    {summary.avgClv >= 0 ? '+' : ''}{summary.avgClv.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-600">Avg CLV</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-2xl font-bold text-red-600">
                    {summary.maxDrawdown.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-600">Max DD</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-2xl font-bold text-gray-900">
                    {summary.avgStake.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-600">Avg Stake</div>
                </div>
              </div>

              {/* Win/Loss Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Results Breakdown</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Wins:</span>
                      <span className="font-medium text-green-600">{summary.wins}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Losses:</span>
                      <span className="font-medium text-red-600">{summary.losses}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Pushes:</span>
                      <span className="font-medium text-gray-600">{summary.pushes}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Pending:</span>
                      <span className="font-medium text-gray-400">{summary.pending}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Confidence Tiers</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tier A:</span>
                      <span className="font-medium text-green-600">{summary.confidenceBreakdown.A}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tier B:</span>
                      <span className="font-medium text-yellow-600">{summary.confidenceBreakdown.B}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tier C:</span>
                      <span className="font-medium text-red-600">{summary.confidenceBreakdown.C}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Equity Curve */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Equity Curve</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={getEquityData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bet" label={{ value: 'Bet #', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Equity', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="equity" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Drawdown */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Drawdown</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={getDrawdownData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bet" label={{ value: 'Bet #', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Drawdown', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="drawdown" stroke="#dc2626" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Edge Histogram */}
                <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Edge Distribution</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={getEdgeHistogram()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range" label={{ value: 'Edge Range (pts)', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bets Table */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Bet Details</h2>
                  <div className="flex items-center gap-4">
                    <label className="text-sm text-gray-600">
                      Confidence:
                      <select
                        value={filterConfidence}
                        onChange={(e) => setFilterConfidence(e.target.value)}
                        className="ml-2 px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="">All</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </select>
                    </label>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th 
                          onClick={() => handleSort('week')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        >
                          Week {sortConfig?.key === 'week' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Matchup
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Pick
                        </th>
                        <th 
                          onClick={() => handleSort('edge')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        >
                          Edge {sortConfig?.key === 'edge' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          onClick={() => handleSort('confidence')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        >
                          Conf {sortConfig?.key === 'confidence' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Stake
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Result
                        </th>
                        <th 
                          onClick={() => handleSort('pnl')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        >
                          P/L {sortConfig?.key === 'pnl' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          onClick={() => handleSort('clv')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        >
                          CLV {sortConfig?.key === 'clv' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {getSortedData().map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.season} W{row.week}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>{row.matchup}</div>
                            <div className="text-xs text-gray-500">{row.betType}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.pickLabel}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            +{parseFloat(row.edge || '0').toFixed(1)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              row.confidence === 'A' ? 'bg-green-100 text-green-800' :
                              row.confidence === 'B' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {row.confidence}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {parseFloat(row.stake || '0').toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`font-medium ${
                              row.result === 'WIN' ? 'text-green-600' :
                              row.result === 'LOSS' ? 'text-red-600' :
                              row.result === 'PUSH' ? 'text-gray-600' :
                              'text-gray-400'
                            }`}>
                              {row.result || 'PENDING'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <span className={parseFloat(row.pnl || '0') >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {parseFloat(row.pnl || '0') >= 0 ? '+' : ''}{parseFloat(row.pnl || '0').toFixed(2)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.clv ? `${parseFloat(row.clv) >= 0 ? '+' : ''}${parseFloat(row.clv).toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {data.length === 0 && !error && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📊</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Loaded</h3>
              <p className="text-gray-600 mb-6">
                Upload a backtest CSV to view analysis and charts, or try the demo
              </p>
              <div className="flex justify-center gap-4 mb-6">
                <button
                  onClick={handleDemoLoad}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  📊 Try Demo
                </button>
              </div>
              <div className="text-sm text-gray-500">
                Run a backtest with: <code className="bg-gray-100 px-2 py-1 rounded">npm run backtest</code>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

