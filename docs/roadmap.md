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

## Milestone 3 - Implied Lines & Edge Detection
**Purpose**: Convert power ratings to implied spreads/totals and identify betting edges
**Success**: Implied lines within 3 points of market 70% of the time; edge detection working
**Out of Scope**: Betting execution; advanced strategy development
**Risks**: Market efficiency; model overconfidence; edge decay
**Inputs**: Power ratings; market lines; confidence thresholds
**Definition of Done**: Implied lines generated; edge detection working; confidence tiers assigned

## Milestone 4 - Core Web Interface
**Purpose**: Build essential UI pages for viewing ratings, edges, and game details
**Success**: Users can view all data; responsive design; fast loading
**Out of Scope**: Advanced analytics; user accounts; betting integration
**Risks**: UI complexity; performance issues; mobile responsiveness
**Inputs**: Design requirements; data models; user feedback
**Definition of Done**: All core pages functional; mobile responsive; performance targets met

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
