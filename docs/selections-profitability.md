# Selections & Profitability v1

This document describes the betting ledger system for tracking selections, profitability, and performance analysis.

## Overview

The Selections & Profitability system provides:
- **Betting Ledger**: Track all bets with full audit trail
- **Performance Analytics**: Hit rate, ROI, CLV analysis
- **Strategy Analysis**: Performance breakdown by strategy
- **Automated Grading**: Post-game result determination

## Database Schema

### Bets Table

The `bets` table stores all betting selections with the following key fields:

- **`id`**: Unique identifier (UUID)
- **`season`**, **`week`**: Time context
- **`gameId`**: Reference to the game
- **`marketType`**: 'spread' | 'total' | 'moneyline'
- **`side`**: 'home' | 'away' | 'over' | 'under'
- **`modelPrice`**: Our model's line/price (American odds for ML)
- **`closePrice`**: Final book line at close (nullable)
- **`stake`**: Bet amount
- **`result`**: 'W' | 'L' | 'Push' | null (graded post-game)
- **`pnl`**: Profit/Loss (calculated post-game)
- **`clv`**: Closing Line Value (calculated post-game)
- **`strategyTag`**: Strategy identifier
- **`source`**: 'strategy-run' | 'manual'

## API Endpoints

### POST /api/bets/import

Import betting selections into the ledger.

**Request Body:**
```json
[
  {
    "season": 2025,
    "week": 9,
    "gameId": "2025-wk9-alabama-south-carolina",
    "marketType": "spread",
    "side": "home",
    "modelPrice": -7.5,
    "stake": 100,
    "strategyTag": "edge-detector",
    "source": "strategy-run",
    "notes": "Strong edge on Alabama"
  }
]
```

**Response:**
```json
{
  "success": true,
  "count": 1,
  "bets": [
    {
      "id": "bet_123",
      "season": 2025,
      "week": 9,
      "gameId": "2025-wk9-alabama-south-carolina",
      "marketType": "spread",
      "side": "home",
      "modelPrice": -7.5,
      "closePrice": -7.0,
      "stake": 100,
      "result": null,
      "pnl": null,
      "clv": null,
      "strategyTag": "edge-detector",
      "source": "strategy-run",
      "notes": "Strong edge on Alabama",
      "game": {
        "homeTeam": { "name": "Alabama" },
        "awayTeam": { "name": "South Carolina" }
      }
    }
  ]
}
```

### GET /api/bets/summary

Get betting performance summary with optional filters.

**Query Parameters:**
- `season`: Filter by season (default: current)
- `week`: Filter by week (default: current)
- `strategy`: Filter by strategy tag
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 50)

**Response:**
```json
{
  "success": true,
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  },
  "summary": {
    "totalBets": 150,
    "gradedBets": 120,
    "hitRate": 0.65,
    "roi": 12.5,
    "totalPnL": 1250.00,
    "avgEdge": 1.2,
    "avgCLV": 0.8
  },
  "strategyBreakdown": [
    {
      "strategy": "edge-detector",
      "count": 75,
      "totalPnL": 800.00
    }
  ],
  "bets": [...]
}
```

## Grading Assumptions

### Spread Betting
- **Home side**: Bet wins if `homeScore - awayScore > spread`
- **Away side**: Bet wins if `awayScore - homeScore > spread`
- **Push**: Exact spread hit (rare)

### Total Betting
- **Over**: Bet wins if `homeScore + awayScore > total`
- **Under**: Bet wins if `homeScore + awayScore < total`
- **Push**: Exact total hit (rare)

### Moneyline Betting
- **Home**: Bet wins if home team wins
- **Away**: Bet wins if away team wins
- **Push**: Tie (rare in CFB)

## Closing Line Value (CLV) Calculation

CLV measures the value of our line vs. the closing line:

### Spreads & Totals
```
CLV = modelLine - closeLine
```
- Positive CLV = we got a better line
- Negative CLV = market moved against us

### Moneyline
```
CLV = implied(modelPrice) - implied(closePrice)
```
- Positive CLV = we got better implied odds
- Negative CLV = market moved against us

## Close Price Selection

The system automatically fills `closePrice` from `market_lines`:

1. **Latest timestamp ≤ now**: Find the most recent line before bet placement
2. **Game + Market + Side matching**: Ensure correct line type
3. **Fallback to null**: If no line found, closePrice remains null

## Performance Metrics

### Hit Rate
```
hitRate = wins / (wins + losses)
```
- Excludes pushes from calculation
- Target: >55% for profitable betting

### ROI (Return on Investment)
```
roi = (totalPnL / totalStake) * 100
```
- Positive ROI = profitable
- Target: >5% for sustainable edge

### Average Edge
```
avgEdge = mean(modelPrice - closePrice)
```
- Measures our line advantage
- Target: >0 for positive edge

### Average CLV
```
avgCLV = mean(CLV values)
```
- Measures line value over time
- Target: >0 for positive value

## Strategy Analysis

The system tracks performance by strategy tag:

- **Edge Detection**: High-confidence plays
- **Value Hunting**: Line shopping strategies
- **Arbitrage**: Risk-free opportunities
- **Manual**: Human-selected bets

Each strategy can be analyzed independently for:
- Hit rate by strategy
- ROI by strategy
- CLV performance by strategy
- Volume and frequency

## Automated Grading

The grading job (`jobs/grade-bets`) automatically:

1. **Finds ungraded bets** with completed games
2. **Determines results** based on final scores
3. **Calculates PnL** using stake and price
4. **Computes CLV** from model vs. close prices
5. **Updates bet records** with results

## Usage Examples

### Import Strategy Results
```bash
curl -X POST /api/bets/import \
  -H "Content-Type: application/json" \
  -d '[{
    "season": 2025,
    "week": 9,
    "gameId": "2025-wk9-alabama-south-carolina",
    "marketType": "spread",
    "side": "home",
    "modelPrice": -7.5,
    "stake": 100,
    "strategyTag": "edge-detector",
    "source": "strategy-run"
  }]'
```

### Get Week 9 Performance
```bash
curl "/api/bets/summary?season=2025&week=9"
```

### Get Strategy Breakdown
```bash
curl "/api/bets/summary?strategy=edge-detector"
```

## Best Practices

1. **Consistent Strategy Tags**: Use standardized naming
2. **Accurate Model Prices**: Ensure model prices reflect true edge
3. **Timely Grading**: Run grading job post-game
4. **CLV Tracking**: Monitor line value over time
5. **Strategy Analysis**: Regular performance review by strategy

## Troubleshooting

### Missing Close Prices
- Check if market_lines has data for the game
- Verify timestamp is before bet placement
- Ensure correct gameId mapping

### Grading Issues
- Verify game scores are final
- Check bet side logic (home/away, over/under)
- Ensure stake and price calculations

### Performance Metrics
- Hit rate <50%: Review strategy logic
- Negative ROI: Check edge detection
- Low CLV: Improve line shopping
