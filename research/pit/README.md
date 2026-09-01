# CFBD Point-in-Time (PIT) Archive — Research Only

Immutable CFBD **point-in-time research evidence**. This is **not** a production
pipeline and must not interact with Prisma, ratings, Odds, Core V1 card, scores,
grading, lifecycle, Hybrid authorization, or GitHub Actions production workflows.

## Privacy

- Raw CFBD payloads live only under **`.research-data/`** (gitignored).
- Never commit raw JSON, never upload it via Actions artifacts, never paste bodies
  into ChatGPT or PR descriptions.
- Review should be **metadata-only** (`manifest.json` fields + checksums), not raw
  payloads.
- The capture tool never prints response bodies, `Authorization` headers, or
  `CFBD_API_KEY`.

## September 1, 2026 SEED semantics

| Field | Value |
|-------|--------|
| `snapshot_kind` | `SEED` |
| `season` | `2026` |
| `provider_week` | `1` |
| `provider_week_state` | `PARTIAL` |
| Timezone for directory date | `America/Chicago` |
| Returning / portal designation | `ONE_TIME_OPENING_WEEK_BASELINE` |

This capture is **not** preseason, **not** completed Week 1, and **not**
“through completed Week 1.” It is an **opening-week baseline** while provider
Week 1 is still **PARTIAL**.

Snapshot ID pattern:

```text
cfbd-2026-w01-seed-partial-YYYYMMDDTHHMMSSZ
```

(UTC timestamp component.)

## Six endpoints (exact order)

Normal successful execution makes **exactly 6 HTTP requests before retries**.

1. `core` — `GET /ratings/core?year=2026`
2. `wepa_team` — `GET /wepa/team/season?year=2026`
3. `passing_plays` — `GET /passing/plays?year=2026&week=1&seasonType=regular&classification=fbs`
4. `passing_team_games` — `GET /passing/teams/games?year=2026&week=1&seasonType=regular&classification=fbs`
5. `returning` — `GET /player/returning?year=2026`
6. `portal` — `GET /player/portal?year=2026`

No exploratory endpoints, no `/info`, no teams/games/advanced-stats in this seed.

## Environment

- `CFBD_API_KEY` — required only for live `--capture-seed`
- Live `--capture-seed` origin is locked to `https://api.collegefootballdata.com`
  (HTTPS, host `api.collegefootballdata.com`, no username/password, default HTTPS
  port only). `CFBD_BASE_URL` is **not** a live override and is not used to send
  the API key to an arbitrary host.
- Auth: `Authorization: Bearer <CFBD_API_KEY>`, `Accept: application/json`

## Invocation

Offline (Stage A / CI-safe):

```bash
node scripts/research/capture-cfbd-pit.mjs --self-test
```

Live capture (**Stage B only — do not run until authorized**):

```bash
node scripts/research/capture-cfbd-pit.mjs --capture-seed
```

Without `--capture-seed` or `--self-test`, the script prints usage and exits
without network calls.

## Output structure

```text
.research-data/
  cfbd-pit/
    2026/
      <America-Chicago-YYYY-MM-DD>/
        <snapshot_id>/
          manifest.json
          checksums.sha256
          raw/
            ratings_core.json
            wepa_team_season.json
            passing_plays_w01.json
            passing_teams_games_w01.json
            player_returning.json
            player_portal.json
```

## Raw-byte / hash rule

- Persist **exact** `Buffer.from(await response.arrayBuffer())` bytes.
- SHA-256 is over those bytes (manifest + `checksums.sha256`).
- Do **not** `JSON.stringify` / pretty-print / sort / normalize raw archives.
- Empty `[]` is **VALID_EMPTY** (valid PIT evidence), not failure.
- Non-200 / malformed JSON: preserve received bytes when present; mark validation
  failure.

## Retry policy

- Network errors and HTTP **5xx**: up to **2 retries** after the initial attempt
  (max 3 attempts per source), short backoff.
- HTTP **400 / 401 / 403 / 429**: **no retry**; fail closed; preserve body if any.
- No compensating exploratory calls.
- Target capture window ≤ 10 minutes; overage is recorded as a warning.
- Later recovery must be a separate **`SEED_RECOVERY`** snapshot identity (not
  implemented in v1 execution).

## What v1 does **not** do

- No normalization into model features
- No DB writes
- No production workflow changes
- No recurring archive platform generalization beyond this SEED contract
