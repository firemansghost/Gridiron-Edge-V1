/**
 * Line Sparkline Component
 * 
 * Displays a visualization of line movement over time with model reference line
 */

'use client';

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface LineHistoryPoint {
  timestamp: string;
  lineValue: number;
  bookName: string;
  source: string;
}

interface LineSparklineProps {
  data: LineHistoryPoint[];
  lineType: 'spread' | 'total' | 'moneyline';
  width?: number;
  height?: number;
  color?: string;
  openingValue?: number; // Opening line value for label
  closingValue?: number; // Closing line value for label
  movement?: number; // Movement amount (closing - opening)
  showLabels?: boolean; // Whether to show Open/Close labels on chart
  showCaption?: boolean; // Whether to show caption below chart
  favoriteTeamName?: string; // For spreads: the favorite team name (e.g., "Alabama Crimson Tide")
  modelSpread?: number | null; // Model prediction for spread
  modelTotal?: number | null; // Model prediction for total
}

export function LineSparkline({ 
  data, 
  lineType, 
  width = 280, 
  height = 150,
  color = '#3b82f6',
  openingValue,
  closingValue,
  movement,
  showLabels = true,
  showCaption = true,
  favoriteTeamName,
  modelSpread,
  modelTotal
}: LineSparklineProps) {
  // Sort data chronologically by timestamp
  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });
  }, [data]);

  // Format data for Recharts
  const chartData = useMemo(() => {
    return sortedData.map((point, index) => ({
      time: new Date(point.timestamp).getTime(),
      value: point.lineValue,
      bookName: point.bookName,
      source: point.source,
      timestamp: point.timestamp,
      index,
    }));
  }, [sortedData]);

  // Determine model value based on line type
  const modelValue = lineType === 'spread' ? modelSpread : lineType === 'total' ? modelTotal : null;

  // Calculate Y-axis domain for better scaling
  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return ['auto', 'auto'];
    const values = chartData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range * 0.1; // 10% padding
    return [min - padding, max + padding];
  }, [chartData]);

  // Format timestamp for tooltip
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-xs">
          <p className="font-semibold text-gray-900">
            {formatTime(data.timestamp)}
          </p>
          <p className="text-gray-700">
            Line: <span className="font-medium">{data.value.toFixed(1)}</span>
          </p>
          <p className="text-gray-600">
            Book: <span className="font-medium">{data.bookName || data.source}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic" style={{ width, height }}>
        No line history
      </div>
    );
  }

  return (
    <div className="inline-block w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }}
            stroke="#6b7280"
            fontSize={10}
          />
          <YAxis 
            domain={yAxisDomain}
            stroke="#6b7280"
            fontSize={10}
            tickFormatter={(value) => value.toFixed(1)}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Model Reference Line */}
          {modelValue !== null && modelValue !== undefined && (
            <ReferenceLine 
              y={modelValue} 
              stroke="#ef4444" 
              strokeDasharray="5 5" 
              strokeWidth={2}
              label={{ value: "Model", position: "right", fill: "#ef4444", fontSize: 10 }}
            />
          )}
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={2}
            dot={{ fill: color, r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="text-xs text-gray-500 mt-1 flex justify-between">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
          Open
        </span>
        {modelValue !== null && modelValue !== undefined && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" style={{ borderStyle: 'dashed' }}></span>
            Model: {modelValue.toFixed(1)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
          Close
        </span>
      </div>
      {showCaption && openingValue !== undefined && closingValue !== undefined && movement !== undefined && (
        <div className="text-xs text-gray-600 mt-1 font-medium text-center">
          {lineType === 'spread' && favoriteTeamName ? (
            <>
              {/* Display favorite-centric format: favorite always shows negative (laying points) */}
              Favorite spread: <span className="font-semibold">{favoriteTeamName}</span> {openingValue.toFixed(1)} → {closingValue.toFixed(1)}
              <span className={`ml-1 ${movement >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ({movement >= 0 ? '+' : ''}{movement.toFixed(1)})
              </span>
            </>
          ) : (
            <>
              Open: {openingValue.toFixed(1)} → Close: {closingValue.toFixed(1)} 
              <span className={`ml-1 ${movement >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ({movement >= 0 ? '+' : ''}{movement.toFixed(1)})
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

