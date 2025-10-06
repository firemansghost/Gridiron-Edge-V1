# Data Source Adapters

## DataSourceAdapter Contract

### Base Interface
```python
class DataSourceAdapter:
    def fetch_team_stats(self, season: int, week: int) -> List[TeamStats]
    def fetch_recruiting_data(self, season: int) -> List[RecruitingData]
    def fetch_schedules(self, season: int) -> List[Game]
    def fetch_market_lines(self, game_ids: List[str]) -> List[MarketLine]
```

### Configuration via datasources.yml
```yaml
sources:
  team_stats:
    provider: "sports_reference"
    endpoint: "https://www.sports-reference.com/cfb"
    rate_limit: 1.0  # requests per second
    retry_attempts: 3
    
  recruiting:
    provider: "247sports"
    endpoint: "https://247sports.com/api"
    rate_limit: 0.5
    retry_attempts: 3
    
  market_lines:
    provider: "the_odds_api"
    endpoint: "https://api.the-odds-api.com/v4"
    rate_limit: 2.0
    retry_attempts: 5
```

## Data Source Implementations

### Team Statistics
**Source**: Sports Reference, ESPN, College Football Data API
**Fields**: 
- Offensive: points_per_game, yards_per_game, passing_yards, rushing_yards
- Defensive: points_allowed, yards_allowed, turnovers_forced
- Special Teams: field_goal_percentage, punt_return_avg
**Missing in v1**: EPA, success rate, advanced metrics

### Recruiting Data
**Source**: 247Sports, Rivals, ESPN
**Fields**:
- Team rankings by class year
- Average recruit rating
- Commit count by position
- Top player commitments
**Missing in v1**: Individual player projections, transfer portal data

### Schedules
**Source**: ESPN, NCAA, team websites
**Fields**:
- Game dates and times
- Home/away teams
- Conference games
- Bowl games and playoffs
**Missing in v1**: Weather data, venue information

### Market Lines
**Source**: The Odds API, BetMGM, DraftKings
**Fields**:
- Point spreads
- Totals (over/under)
- Moneyline odds
- Timestamp and source
**Missing in v1**: Live betting lines, prop bets

## Adapter Implementation Strategy

### Error Handling
- Retry logic with exponential backoff
- Circuit breaker pattern for failing sources
- Graceful degradation when sources unavailable
- Alert system for data quality issues

### Rate Limiting
- Respect API rate limits per source
- Queue management for high-volume requests
- Caching to reduce API calls
- Batch processing where possible

### Data Validation
- Schema validation for all incoming data
- Outlier detection for statistical anomalies
- Cross-source validation
- Data quality scoring system

## Configuration Management

### Environment-Specific Configs
- Development: Sandbox APIs, reduced rate limits
- Production: Full API access, optimized rate limits
- Testing: Mock data sources for unit tests

### Secret Management
- API keys stored in environment variables
- Separate credentials per environment
- Key rotation support
- Audit logging for API access

### Monitoring & Alerting
- API response time monitoring
- Data quality metrics tracking
- Failed request alerting
- Source availability monitoring
