/**
 * Line Sparkline Component
 * 
 * Displays a simple sparkline visualization of line movement over time
 */

'use client';

import { useEffect, useRef } from 'react';

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
}

export function LineSparkline({ 
  data, 
  lineType, 
  width = 200, 
  height = 40,
  color = '#3b82f6',
  openingValue,
  closingValue,
  movement,
  showLabels = true,
  showCaption = true,
  favoriteTeamName
}: LineSparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (data.length < 2) {
      // Draw single point
      const value = data[0].lineValue;
      const normalized = (value - Math.min(...data.map(d => d.lineValue))) / 
                        (Math.max(...data.map(d => d.lineValue)) - Math.min(...data.map(d => d.lineValue)) || 1);
      const y = height - (normalized * height);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(width / 2, y, 3, 0, 2 * Math.PI);
      ctx.fill();
      return;
    }

    // Normalize values to fit in height
    const values = data.map(d => d.lineValue);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1; // Avoid division by zero

    // Calculate points
    const points = data.map((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const normalized = (point.lineValue - min) / range;
      const y = height - (normalized * height);
      return { x, y, value: point.lineValue };
    });

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Draw points
    ctx.fillStyle = color;
    points.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 0 || index === points.length - 1 ? 3 : 2, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Highlight opening (first) and closing (last)
    if (points.length > 1) {
      // Opening point
      ctx.fillStyle = '#10b981'; // Green
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      // Closing point
      ctx.fillStyle = '#ef4444'; // Red
      ctx.beginPath();
      ctx.arc(points[points.length - 1].x, points[points.length - 1].y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw Open/Close labels if enabled and values provided
    if (showLabels && openingValue !== undefined && closingValue !== undefined && points.length > 1) {
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      // Opening label (left side)
      ctx.fillStyle = '#059669'; // Darker green
      ctx.fillText(`Open: ${openingValue.toFixed(1)}`, 2, points[0].y - 8);
      
      // Closing label (right side)
      ctx.fillStyle = '#dc2626'; // Darker red
      ctx.textAlign = 'right';
      ctx.fillText(`Close: ${closingValue.toFixed(1)}`, width - 2, points[points.length - 1].y - 8);
    }

  }, [data, width, height, color, openingValue, closingValue, showLabels]);

  if (data.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic" style={{ width, height }}>
        No line history
      </div>
    );
  }

  const altText = lineType === 'spread' && favoriteTeamName
    ? `Spread moved from ${openingValue?.toFixed(1) || 'N/A'} to ${closingValue?.toFixed(1) || 'N/A'} for ${favoriteTeamName}`
    : lineType === 'total'
    ? `Total moved from ${openingValue?.toFixed(1) || 'N/A'} to ${closingValue?.toFixed(1) || 'N/A'}`
    : `${lineType} line movement chart`;

  return (
    <div className="inline-block">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block"
        style={{ imageRendering: 'crisp-edges' }}
        aria-label={altText}
        role="img"
      />
      <div className="text-xs text-gray-500 mt-1 flex justify-between">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
          Open
        </span>
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

