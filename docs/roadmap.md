# Gridiron Edge Roadmap

## Milestone 0 - Project Skeleton (Current)
**Purpose**: Establish stable foundation and shared language for feature development
**Success**: Complete monorepo structure with comprehensive documentation
**Out of Scope**: Any runtime code beyond scaffolding
**Risks**: Over-engineering documentation; scope creep into implementation
**Inputs**: Project requirements, tech stack decisions
**Definition of Done**: All docs exist with real content; monorepo structure complete

## Milestone 1 - Data Pipeline Foundation
**Purpose**: Lock down JSON data shapes (seed files) and seed ingestion plan that mirrors final database tables
**Success**: Complete seed data contracts with realistic CFB 2024 Week 1 data; UI can render Home, Teams, and Game Detail pages
**Out of Scope**: Production ETL code; API adapters; power rating calculations
**Risks**: Schema changes; data quality issues; UI rendering gaps
**Inputs**: Database schema from M0; UI requirements
**Definition of Done**: 
- /seed/ folder exists with 5 JSON files and realistic example rows for CFB 2024 Week 1
- /docs/seed.md includes JSON schemas, ingestion plan, and validation rules
- /docs/ui.md updated to confirm seed coverage for Home, Teams, and Game Detail
- All dates/times normalized to America/Chicago
- No runtime adapter/ETL/model code introduced

### Branch & PR Instructions
- **Branch Name**: `m1-data-contracts-seed`
- **PR Title**: "M1: Data contracts and seed files for CFB 2024 Week 1"
- **Acceptance Criteria**:
  - [ ] /seed/ folder with 5 JSON files created
  - [ ] Realistic CFB 2024 Week 1 data in all files
  - [ ] JSON schemas documented in /docs/seed.md
  - [ ] Seed ingestion plan documented
  - [ ] UI coverage confirmed in /docs/ui.md
  - [ ] All timestamps in America/Chicago timezone
  - [ ] No production code beyond documentation

## Milestone 2 - Power Rating Engine
**Purpose**: Implement core power rating algorithm with opponent adjustment
**Success**: Accurate team power ratings that correlate with game outcomes
**Out of Scope**: Betting edge identification; UI for ratings
**Risks**: Algorithm complexity; overfitting; computational performance
**Inputs**: Team stats; game results; recruiting data
**Definition of Done**: Power ratings calculated; validation against historical games; performance benchmarks

## Milestone 3 - Linear Ratings and Seed UI
**Purpose**: Deliver minimal vertical slice with linear ratings, implied lines, and basic UI
**Success**: End-to-end flow from seed data → ratings → implied lines → API → UI
**Out of Scope**: External data providers; advanced UI features; authentication
**Risks**: Data quality; UI complexity; performance issues
**Inputs**: Seed JSON files; Prisma database; Next.js app
**Definition of Done**: 
- Ratings job populates power_ratings and matchup_outputs for seed week with model_version=v0.0.1
- Server route returns seeded slate with implied vs market and confidence tier
- Home and Game Detail pages render from database via API routes
- Tests for z-score, mapping, and tiering pass locally
- Documentation updated with M3 constants and assumptions

**M3 Implementation Details**:
- **Jobs**: Node.js script loads seed JSONs, computes linear ratings using z-scored features (ypp_off, ypp_def, success_off, success_def), outputs to power_ratings and matchup_outputs
- **API**: Next.js server routes return seed slate data and game details from Prisma database
- **UI**: Minimal Home page (slate table) and Game Detail page (factor breakdown) using Tailwind
- **Constants**: HFA=2.0 pts, Confidence thresholds A≥4.0, B≥3.0, C≥2.0 pts
- **Model**: Linear regression with simple feature weights, constant HFA, seed-only z-scores

## Milestone 3 - Implied Lines & Edge Detection
**Purpose**: Convert power ratings to implied spreads/totals and identify betting edges
**Success**: Implied lines within 3 points of market 70% of the time; edge detection working
**Out of Scope**: Betting execution; advanced strategy development
**Risks**: Market efficiency; model overconfidence; edge decay
**Inputs**: Power ratings; market lines; confidence thresholds
**Definition of Done**: Implied lines generated; edge detection working; confidence tiers assigned

## Milestone 4 - Review Previous Weeks & Profitability (Seed-Mode)
**Purpose**: Build historical week review with profitability tracking for seed data
**Success**: Users can review past weeks with filters, see ROI analysis, and track performance
**Out of Scope**: Real betting integration; advanced analytics; user accounts
**Risks**: ROI calculation accuracy; data quality; UI complexity
**Inputs**: Seed week data; pick helpers from M3.5; profitability requirements
**Definition of Done**: 
- /weeks page renders with filters (season, week, confidence, market)
- Table shows matchup, kickoff, model line, picks, market close, edges, confidence
- Summary card shows A/B/C counts and ROI if scores exist (else friendly note)
- /api/weeks returns correct JSON with pick helpers
- Home page links to /weeks for seed week
- Documentation updated with M4 fields and DoD

**M4 Implementation Details**:
- **Filters**: Season (2024), Week (1), Confidence (A/B/C), Market (spread/total)
- **Table**: Matchup, Kickoff (CT), Model Line, Pick (Spread), Pick (Total), Market Close, Edges, Confidence
- **Summary**: Confidence tier counts, ROI analysis with win/loss/push at -110 odds
- **ROI Logic**: Compare model picks to closing market, track wins/losses/pushes
- **No Results**: "No results yet — scores not seeded" when scores missing
- **Deep Link**: /weeks?season=2024&week=1 from Home page

## Milestone 5 - Betting Integration & Tracking
**Purpose**: Enable bet logging and performance tracking
**Success**: Complete bet lifecycle tracking; accurate P/L calculations
**Out of Scope**: Real money integration; advanced analytics
**Risks**: Data integrity; calculation accuracy; user experience
**Inputs**: Betting data models; performance metrics
**Definition of Done**: Bet logging working; P/L calculations accurate; performance dashboards functional

## Milestone 6 - Backtesting & Strategy Development
**Purpose**: Enable historical strategy testing and optimization
**Success**: Backtesting framework working; strategy performance metrics available
**Out of Scope**: Real-time strategy execution; advanced ML models
**Risks**: Data quality; backtesting accuracy; overfitting
**Inputs**: Historical data; strategy definitions; performance metrics
**Definition of Done**: Backtesting working; strategy performance tracked; optimization tools available

## Milestone 7 - Production Optimization
**Purpose**: Optimize for production scale and reliability
**Success**: System handles production load; monitoring in place; user feedback incorporated
**Out of Scope**: New features; major architectural changes
**Risks**: Performance bottlenecks; reliability issues; user adoption
**Inputs**: Performance requirements; user feedback; monitoring data
**Definition of Done**: Production ready; monitoring active; performance targets met
