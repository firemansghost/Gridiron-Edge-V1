# Gridiron Edge Roadmap

## Current Production Stack

### Hybrid Spread Model (V1 + V2)
**Status:** Production ATS Engine

- **V1 Component (70%):** Power ratings from balanced four-pillar approach (Talent, Efficiency, Scoring, Record - 25% each)
- **V2 Component (30%):** Unit matchup analysis (Run 40%, Pass 40%, Explosiveness 20%)
- **Blend:** Optimized 70/30 split from backtesting against 2025 season results
- **Performance:** Extremely strong Tier A results (~66% win rate, 25%+ ROI over 540 bets)
- **Usage:** All ATS edges, confidence tiers, and official spread picks across Current Slate, My Picks, and Matchup pages

### V3 Drive-Based Totals Model
**Status:** Production Totals Engine

- **Core Insight:** Drives gaining 40+ yards ("Quality Drives") typically yield ~5 points
- **Formula:** Projected Points = (Expected Drives × Quality Drive Rate) × 5.0
- **Data Source:** Drive-level data from CFBD API, stored as `drive_stats` on `TeamSeasonStats`
- **Performance:** Tier A profitable (~57% win rate, +9% ROI over 453 bets); Tier B/C negative ROI
- **Usage:** All totals predictions on Game API, Week Slate API, My Picks, and Season Review
- **Operational Rule:** Tier A only is the primary "serious" system; Tier B/C are experimental/action

### Tiering & UX
**Status:** Production

- **Tier A (|edge| ≥ 4.0):** Best Bets — primary recommendations, green styling, top of My Picks page
- **Tier B (3.0 ≤ |edge| < 4.0):** Medium confidence
- **Tier C (|edge| < 3.0):** Leans/Experimental — muted styling, "High Risk" warnings for totals
- **My Picks:** Two-section layout (Best Bets vs Leans/Action)
- **Season Review & Week Review:** Confidence tier filters with all metrics respecting selected tier

---

## Near-Term Improvements (1-3 Months)

### Harden V3 Totals
**Priority:** High

- Continue backtesting Tier A vs B/C by week and by conference
- Confirm recommended edge thresholds (e.g., ≥ 2.0, ≥ 3.0) for different liquidity levels
- Improve "Best Line" logic documentation and ensure we always display:
  - Consensus line (neutral reference)
  - Best line used for the bet (for the chosen side)
- Add clear copy explaining "Consensus vs Best Book Line" in documentation

### Better Diagnostics & Monitoring
**Priority:** Medium

- Add documentation on how to:
  - Run `sync-drives.ts` for new seasons
  - Run `sync-v3-bets.ts` for specific weeks
  - Run debug scripts to inspect why a game did/didn't generate a bet
- Improve error handling and logging for V3 totals calculation failures
- Add monitoring dashboards for drive data coverage and bet generation rates

### Data Quality & Coverage
**Priority:** Medium

- Ensure 100% drive stats coverage for all FBS teams before season start
- Automate drive data sync as part of weekly ingestion pipeline
- Add validation checks to catch missing drive data early

---

## Mid-Term Model Upgrades (V4 Spread)

### V4 Spread Model – SP+/FEI-Inspired
**Timeline:** 3-6 months

**Goal:** Replace/augment the current Hybrid model with a true tempo-free, opponent-adjusted efficiency engine.

#### Tempo-Free Efficiency Core (SP+-style)

**Components:**
- **Success Rate:** Already implemented in V1/V2
- **Explosiveness (IsoPPP):** Already implemented in V2
- **Finishing Drives:**
  - Points per scoring opportunity (inside the 40 or red zone)
  - Build a dedicated "Finishing Drives / Red Zone" module
  - Track conversion rates from quality drives to actual scores
- **Opponent Adjustments:**
  - Opponent strength weighting for all efficiency stats
  - Iterative adjustment process (similar to SP+ methodology)
- **Garbage Time Filters:**
  - Define garbage time rules (e.g., spread & quarter thresholds)
  - Exclude those plays/drives from the efficiency sample

#### Possession-Based Layer (FEI-style)

**Components:**
- **Net Points per Drive (NPD):**
  - Points scored per offensive drive minus points allowed per defensive drive
  - Treat this as a top-level predictive metric
  - More stable than play-level efficiency in small samples
- **Available Yards %:**
  - "How much of the field did you gain?" per drive
  - Incorporate as an efficiency/field position component
  - Complements quality drive rate from V3 totals

#### Model Integration

**Approach:**
- Combine tempo-free play-level efficiency with possession-level metrics into a single team rating
- Replace the current V1/V2 blend with this V4 rating in:
  - ATS edges
  - Season Review / Week Review
  - Ratings pages
- Maintain backward compatibility during transition (run V4 alongside Hybrid for validation)

**Success Criteria:**
- V4 achieves equal or better MAE than Hybrid on 2025 season
- V4 Tier A spreads maintain or improve win rate vs Hybrid
- V4 provides better calibration (predicted probabilities match actual outcomes)

---

## Long-Term Research Tracks

### Transfer Portal & Roster Churn
**Timeline:** 6-12 months

**Concept:** Incorporate transfer portal activity as a pre-season / in-season adjustment to team ratings.

**Data Source:**
- 247Sports Transfer Portal feed (or equivalent)
- Track incoming/outgoing transfers with star ratings, positional value, snap counts

**Transfer Impact Score (TIS):**
- For each team, compute a metric based on:
  - Incoming transfers (star ratings, positional value, snap counts)
  - Outgoing transfers (same inputs)
  - Net rating (inbound – outbound)
- Use this as:
  - A prior adjustment on team ratings heading into the season
  - A slow-decaying modifier that fades as real game data accumulates (Weeks 1-4)

**Implementation Tasks:**
1. Design schema for storing transfer portal events
2. Implement a simple ingestion script
3. Backtest: see if teams with high positive TIS outperform baseline spreads in Weeks 1-4
4. If predictive, fold TIS into preseason & early-season V4 ratings

**Success Criteria:**
- TIS shows statistically significant predictive power in Weeks 1-4
- Teams with high positive TIS outperform baseline by ≥2% ROI
- TIS decay function properly weights early-season adjustments

### Advanced Situational Adjustments
**Timeline:** 6+ months

**Potential Areas:**
- Weather impact modeling (beyond current V2 wind/precipitation penalties)
- Rest/bye week adjustments
- Travel distance and time zone changes
- Coaching changes and scheme adjustments
- Injury impact modeling (if reliable data sources become available)

### Machine Learning Integration
**Timeline:** 12+ months

**Potential Approaches:**
- Gradient boosting models (XGBoost, LightGBM) for non-linear relationships
- Neural networks for complex feature interactions
- Ensemble methods combining multiple model types
- Reinforcement learning for bet sizing optimization

**Note:** ML integration should only proceed after establishing strong baseline performance with V4 and validating that ML approaches meaningfully improve upon existing models.

---

## Documentation & Transparency

### Ongoing Documentation Updates
- Keep methodology docs current with production model changes
- Document all model versions and their performance characteristics
- Maintain clear changelog of model updates and improvements
- Provide reproducible examples and verification queries

### User Education
- Expand "Getting Started" guide with model explanations
- Add glossary of terms (edge, tier, quality drive, etc.)
- Create video tutorials for key features (My Picks, Season Review)
- Publish blog posts explaining model insights and methodology

---

## Success Metrics

### Model Performance
- **Hybrid Tier A Spreads:** Maintain ≥65% win rate, ≥20% ROI
- **V3 Totals Tier A:** Maintain ≥55% win rate, ≥5% ROI
- **V4 Spread:** Achieve equal or better performance than Hybrid

### User Engagement
- Track usage of Best Bets vs Leans sections
- Monitor Season Review tier filter usage
- Measure user retention and return visits

### Data Quality
- 100% drive stats coverage for all FBS teams
- <1% missing market line data for active games
- <5% calculation errors or fallbacks in production

---

## Notes

- This roadmap is a living document and will be updated as priorities shift
- All timeline estimates are approximate and subject to change
- Model improvements are prioritized based on backtesting results and user feedback
- Production stability takes precedence over new feature development
