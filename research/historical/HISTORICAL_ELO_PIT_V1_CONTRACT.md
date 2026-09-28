# Historical Elo Point-in-Time V1 Contract

**Status:** FROZEN RESEARCH INPUT MAPPING  
**Scope:** Historical CFBD Elo only  
**Evidence basis:** independently audited 2022, 2023, and 2025 Historical Research Snapshot V1 captures

## Purpose

This contract defines the only authorized mapping from CFBD historical Elo snapshots to
historical pregame research features.

It exists to prevent outcome leakage caused by treating
`/ratings/elo?year=Y&week=N` as an entering-Week-N rating.

The audited historical snapshots show that the weekly endpoint behaves as an
**end-of-provider-week** state.

## Frozen mapping

For a historical game in provider Week `N`:

- **Week 1:** use the season's **preseason Elo** snapshot.
- **Week N, N >= 2:** use the **Week N-1 Elo** snapshot.
- **Never** use Week N Elo to predict a Week N game.

This mapping applies independently to both teams.

## Why Week N is prohibited

The 2022 audit found:

- **1,570 / 1,570** comparable played team-weeks where Week N Elo matched the team's
  final regular-season postgame Elo in provider Week N;
- **393 / 393** bye team-weeks where Week N Elo exactly carried forward the prior
  snapshot;
- all same-week canonical-game deviations were explained by another game later in the
  same provider week.

The audited 2023 capture independently reconfirmed the same behavior:

- **1,605 / 1,605** comparable played team-weeks matched the team's final regular-season
  postgame Elo in provider Week N;
- **390 / 390** comparable bye team-weeks carried the prior snapshot forward unchanged;
- all 13 same-week canonical deviations occurred in multi-game Week 1 team-weeks.

The previously audited 2025 capture also showed the same end-of-week behavior.

Therefore Week N Elo contains information from Week N outcomes and is not eligible as
a pregame Week N feature.

## Bye handling

Do not search backward manually for the last game.

The prior weekly snapshot is the authorized input:

- a team that played in Week N-1 receives its end-of-Week-N-1 Elo;
- a team that did not play in Week N-1 receives the provider's carried-forward value.

The 2022 audit observed **393 / 393** comparable bye team-weeks carrying forward
unchanged. The 2023 audit independently observed **390 / 390**.

## Multiple games in one provider week

If a team plays more than once under the same provider week label, the Week N endpoint
may reflect the final game in that provider week.

That is another reason same-week Elo is prohibited.

Historical feature construction must still use:

- preseason for Week 1;
- Week N-1 for Week N >= 2.

No special same-week exception is allowed.

## Missing Elo

Missingness remains missing.

If the authorized source snapshot lacks a team Elo:

- do not use a later weekly snapshot;
- do not use a game postgame Elo;
- do not interpolate;
- do not copy an opponent value;
- do not substitute zero;
- do not reconstruct from score margin or another rating system.

The Elo feature is unavailable for that team/game unless a separately frozen missingness
policy explicitly authorizes another treatment.

## Game-level Elo fields

`homePregameElo`, `awayPregameElo`, `homePostgameElo`, and
`awayPostgameElo` from the games payload are semantic-audit/evaluation evidence.

They are not the feature source under this contract.

The 2023 audit also found that the frozen preseason/prior-week source matched the games
payload's game-level pregame Elo on **1,410 / 1,500** canonical team-games, with **90**
differences. Do not force equality between these sources or substitute one for the
other.

Two audited 2022 team-weeks had null game-level Elo fields while a weekly snapshot was
still available:

- LSU Week 2 vs Southern;
- New Mexico State Week 14 vs Valparaiso.

Do not use these cases to infer or reconstruct a game-level Elo value.

## Newly classified / newly available teams

If a team appears in the historical game universe but lacks the authorized preseason or
prior-week Elo snapshot, the feature remains unavailable.

Do not backfill from the first later week in which the provider begins returning the
team.

This rule protects against classification-transition and provider-history leakage.

## Provider-week semantics vs wall-clock publication

This contract freezes a **leakage-safe provider-week mapping**.

It does not claim that the present-day historical endpoint proves the exact historical
wall-clock publication timestamp at which CFBD made each weekly rating available.

Accordingly:

- prior-week snapshots may be used for historical feature reconstruction under this
  contract;
- they must not be described as a timestamp-perfect recreation of the live historical
  CFBD publication process;
- any study requiring actual historical publication timestamps needs a separate
  evidence contract.

## Allowed use

This contract authorizes the mapped Elo value as a candidate historical research feature
only after the underlying season snapshot has passed its independent artifact/coverage
audit.

It does not authorize:

- model formula changes;
- feature selection decisions;
- database writes;
- backtest conclusions;
- production model changes;
- betting use.

Those remain separate research decisions.

## Holdout boundary

The 2025 season remains the eventual untouched final holdout.

The existence of this Elo mapping contract does not authorize using 2025 outcomes to
choose whether Elo belongs in the model, how strongly it should be weighted, or what
thresholds should be used.

Feature/model development remains confined to the authorized development seasons,
followed by 2024 validation and only then final 2025 holdout evaluation.

## Versioning

Any change to these semantics requires a new contract version.

In particular, a future rule that uses:

- same-week Elo;
- reconstructed missing Elo;
- wall-clock historical publication timestamps;
- another provider's Elo;
- postseason-specific mapping;

must not silently modify Historical Elo PIT V1.
