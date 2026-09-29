# 2026-09-29 Week 5 Betting Ticket Launch

**Status:** LIVE / READ-ONLY / PRIORITY CARD LIVE / SMART ODDS REFRESH ACTIVE  
**Current repository checkpoint:** `0c11ebe7ee339f6954c356325935a4de8b9bcdf8`  
**Page:** `/ticket`

## Purpose

The Betting Ticket is the betting-day operator layer that sits on top of two existing truth
surfaces:

- **Official Card** — frozen persisted Core V1 official wager/model truth
- **Current persisted market** — latest coherent MarketLine snapshot

The ticket does not create a third model or a third persisted source of truth.

It answers:

1. what is still actionable now;
2. what remains worth watching;
3. what should no longer be chased;
4. what line/price would bring a wager back into a stronger value band.

## Navigation

Primary navigation now begins with:

1. **Betting Ticket**
2. Official Card
3. Current Slate

Official Card and Current Slate keep their prior semantics.

## Read-only boundary

The Betting Ticket API is GET-only.

It:

- reads persisted `official_flat_100` Bet rows;
- reads persisted MarketLine rows;
- reuses coherent market snapshot selection;
- computes current edge/value from the frozen persisted `modelPrice`;
- does not recalculate Core V1;
- does not write Bet;
- does not write MarketLine;
- does not promote Hybrid / Candidate B / V4.

## Operator buckets

### BET NOW

Requires all of:

- locked official wager grade = **A**;
- current market still grades **A**;
- current price is not worse than the locked price;
- persisted current market snapshot age <= **3 hours**;
- game remains scheduled and outside the 30-minute kickoff gate.

### WATCH

Used when:

- current A/B value remains but the strict BET NOW filter is not met;
- locked A/current A is available only at a worse price than lock;
- current market is unavailable;
- persisted market is older than 3 hours.

WATCH is a price-monitoring list, not a rejection.

### PASS / NO CHASE

Used when:

- only C/no qualifying value remains at the current number;
- the game is inside the 30-minute kickoff gate;
- kickoff has passed / game is no longer scheduled.

## Action ranges

The ticket displays:

- locked pick / grade / edge or value;
- current line/price;
- book and snapshot age;
- bettor-friendly better/worse movement from the locked price;
- current grade / edge / value;
- **Playable to** threshold based on the B-grade boundary;
- **A-grade** watch target where applicable.

These thresholds are derived from the frozen persisted `modelPrice`.

They are operator thresholds, not a new model calculation.

## Freshness repair

The first production deployment exposed an important operator-safety issue:

- all Week 5 market snapshots were approximately **31 hours old**.

The ticket was immediately repaired so snapshots older than **3 hours** cannot produce BET NOW.

PR #219 added:

- stale-market WATCH downgrade;
- fresh/stale/unavailable counts;
- amber page-level warning.

No stale market remained actionable.

## Fresh Week 5 Odds refresh

A guarded Live Odds PREVIEW/COMMIT was then executed.

### PREVIEW

Run:

`36623364235`

Artifact:

- ID `11059382290`
- ZIP SHA-256
  `35f9c1f1c953cef298bd1d56403733e9ea40982269842fa643eadd27509c638c`

Audit:

- provider calls: **1**
- provider events: **58**
- requested-week matches: **56**
- out-of-week events: **2**
- unresolved / ambiguous / fuzzy required: **0**
- spread coverage: **56 / 56**
- total coverage: **56 / 56**
- moneyline coverage: **56 / 56**
- proposed inserts: **2,918**
- writeSafe: **true**
- blockers: **0**
- PREVIEW DB mutations: **0**

### COMMIT

Run:

`36623581586`

Artifact:

- ID `11059537695`
- ZIP SHA-256:
  `700fdd4b4da69c3b4726b5dbdb14ac2bb0443d1636e906b7efcb88fed0b812a7`

Independent ZIP SHA matched GitHub.

Commit audit:

- provider calls: **1**
- matched Week 5 games: **56 / 56**
- proposed/still-new/createMany/inserted: **2,918 / 2,918 / 2,918 / 2,918**
- commitSucceeded: **true**
- postWriteVerificationSucceeded: **true**
- MarketLine total after: **8,406**
- distinct Week 5 games after: **56**
- spreads after: **3,616**
- totals after: **1,810**
- moneylines after: **2,980**
- distinct books: **11**
- missing inserted fingerprints: **0**
- conflicting inserted fingerprints: **0**

## Live Week 5 ticket

Production endpoint:

`/api/betting-ticket?week=5`

Live verification returned HTTP 200 with:

- official wagers: **96**
- fresh markets: **96**
- stale markets: **0**
- unavailable markets: **0**
- **BET NOW: 21**
- **WATCH: 43**
- **PASS / NO CHASE: 32**

At launch:

- moneyline BET NOW: **6**
- spread BET NOW: **15**

The BET NOW section now carries an **operator-priority overlay**:

- **Primary Card: 7**
- **Secondary Plays: 12**
- **Correlated / Same-Game Alternates: 2**

The two current same-game alternates are:

- UConn spread, with UConn moneyline preferred on the main card;
- Fresno State spread, with Fresno State moneyline preferred on the main card.

Primary / Secondary / Alternate is **not** a new model grade, confidence score, staking rule,
or promotion. It normalizes current BET NOW edge/value against the existing A-grade floor and
keeps only one preferred expression per game on the main operator cards.

Current Primary rule:

> preferred BET NOW expression for a game with current edge/value cushion at least **2x**
> the existing A-grade floor.

These counts are dynamic because the page overlays the frozen Official Card with the latest
persisted market.

## Current operating use

For betting-day use:

1. open **Betting Ticket** first;
2. work the BET NOW section;
3. use WATCH for line shopping / movement monitoring;
4. leave PASS collapsed unless reviewing what changed;
5. use Official Card when frozen truth is needed;
6. use Current Slate for the broader dynamic model view.

Do not interpret a WATCH-to-BET or BET-to-WATCH transition as a change to the official model.

It is a change in current market playability only.

## Automated Betting Ticket odds freshness

The 3-hour Betting Ticket stale-market guard remains unchanged.

Rather than weaken that guard to six hours, Betting Ticket Odds Refresh V1 now keeps the
persisted operator board fresh efficiently.

Workflow:

`.github/workflows/run-betting-ticket-odds-refresh-v1-2026.yml`

Rules:

- planner freshness threshold: **150 minutes**;
- Betting Ticket actionability threshold: **180 minutes**;
- required future-game coverage: spread / total / moneyline;
- if any active-week kickoff is within **60 minutes**, outcome is `T30_HANDOFF` and
  providerCalls=0;
- T-30 Stage C remains the sole final-hour board-refresh path;
- conditional refresh invokes the existing guarded append-only Live Odds COMMIT once;
- no Bet, model, Game, T-30 closing, or migration writes.

Explicit proof:

- GitHub run: **36629755387**
- runtime SHA: `0c11ebe7ee339f6954c356325935a4de8b9bcdf8`
- outcome: **BOARD_FRESH**
- future games: **56**
- stale games: **0**
- T-30 handoff games: **0**
- provider calls: **0**
- inserted rows: **0**
- conditional provider step: **skipped**

Artifact:

- ID: **11061657135**
- ZIP SHA-256:
  `f2813031e59716af30e55c10f379b4ad701df6a828035cb619189c07777ae170`

Independent ZIP SHA matched GitHub.

Supabase production clock:

- job ID: **2**
- name: `betting-ticket-odds-refresh-github-dispatch-v1`
- schedule: `20 * * * *`
- active: **true**
- operator-time gate: Tuesday–Saturday at 07:20 / 10:20 / 13:20 / 16:20 / 19:20 /
  22:20 America/Chicago
- GitHub still performs the authoritative freshness / T-30 handoff decision.

Observed provider economics from the latest Week 5 board refresh:

- provider board cost: **3 credits**
- requests used: **280**
- requests remaining: **19,720**

Even if every eligible operator-clock opportunity required a provider call, the theoretical
maximum is about **90 credits/week**. Actual usage should be lower because fresh boards,
T-30 handoffs, and no-future-game states no-op.

## Next enhancement boundary

Barnes / Crick overlays may later be added as a separate operator layer after their weekly
picks arrive.

Do not bake external tipster opinion into Core V1 or rewrite Official Card truth.

## Current live priorities

1. work the **7-play Primary Card** first, then Secondary Plays;
2. treat same-game Alternates as intentional exposure choices, not automatic additional bets;
3. audit the first natural operator-hours odds-refresh cron tick;
4. audit the first natural in-window T-30 automation cycle on Thursday;
5. add Barnes / Crick overlays when source picks arrive;
6. run normal Week 5 score / grading / TeamGameStat / lifecycle closeout after games.
