"""In-memory predictor normalization only. No file, target, network or fit access.

Accepts the seven projected legacy schemas, never the artificial builder's SYN
guard. The output is a raw, unscaled F14 population, not a training matrix.
"""
from datetime import datetime, timezone
import math
import re
import statistics

F14 = ('elo', 'talent', 'returningPercentPPA', 'recruitingPointsY0',
       'recruitingPointsY1', 'recruitingPointsY2', 'recruitingPointsY3',
       'priorFbsGames', 'ppaOffMean', 'ppaDefMean', 'successOffMean',
       'successDefMean', 'ppaNet', 'successNet')
V1 = ('eloRaw', 'talentRaw', 'returningPercentPPA', 'recruitingPointsY0',
      'recruitingPointsY1', 'recruitingPointsY2', 'recruitingPointsY3',
      'priorFbsGames', 'ppaOffMean', 'ppaDefMean', 'successOffMean',
      'successDefMean', 'ppaNet', 'successNet')
V3 = ('elo', 'talent', 'returning', 'recruitY0', 'recruitY1', 'recruitY2',
      'recruitY3', 'priorFbsGames', 'ppaNet', 'successNet')
CONTEXT = ('season', 'gameId', 'week', 'startDate', 'homeTeam', 'awayTeam', 'neutralSite')
LEGACY_STATES = ('AVAILABLE', 'SOURCE_ROW_UNAVAILABLE', 'FIELD_VALUE_UNAVAILABLE',
                 'NO_PRIOR_FBS_GAMES', 'SOURCE_HISTORY_INCOMPLETE')


class AdapterStop(ValueError):
    pass


def require(ok, code):
    if not ok:
        raise AdapterStop(code)


def finite(x):
    try:
        return type(x) in (int, float) and math.isfinite(x)
    except OverflowError:
        return False


def positive_int(x):
    return type(x) is int and x > 0


def team(x):
    return type(x) is str and bool(x) and x == x.strip()


def time(x):
    require(type(x) is str and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z', x) is not None, 'KICKOFF_UTC_REQUIRED')
    try:
        value = datetime.fromisoformat(x[:-1] + '+00:00')
    except ValueError:
        raise AdapterStop('KICKOFF_INVALID') from None
    require(value.utcoffset() == timezone.utc.utcoffset(value), 'KICKOFF_UTC_REQUIRED')
    return value


def context(row, allowed):
    require(type(row['season']) is int and row['season'] in allowed, 'SEASON_NOT_ALLOWED')
    require(positive_int(row['gameId']) and positive_int(row['week']), 'GAME_ID_OR_WEEK_INVALID')
    require(team(row['homeTeam']) and team(row['awayTeam']) and row['homeTeam'] != row['awayTeam'], 'TEAM_IDENTITY_INVALID')
    require(type(row['neutralSite']) is bool, 'VENUE_INVALID')
    time(row['startDate'])
    return {key: row[key] for key in CONTEXT}


def feature(value, source, n=None, missing=None):
    state = missing if missing else 'SOURCE_ROW_UNAVAILABLE' if value is None else 'AVAILABLE' if finite(value) else 'SOURCE_VALUE_INVALID'
    return {'value': value if state == 'AVAILABLE' else None, 'state': state, 'n': n, 'sources': [source]}


def raw_static(wrapper, season, name, year_key, value_key, source):
    require(wrapper['status'] in ('AVAILABLE', 'SOURCE_ROW_UNAVAILABLE'), 'STATIC_WRAPPER_STATUS_INVALID')
    row = wrapper['row']
    if row is None:
        require(wrapper['status'] == 'SOURCE_ROW_UNAVAILABLE', 'STATIC_WRAPPER_CONTRADICTION')
        return feature(None, source)
    require(wrapper['status'] == 'AVAILABLE', 'STATIC_WRAPPER_CONTRADICTION')
    require(type(row[year_key]) is int and row[year_key] == season and row['team'] == name, 'STATIC_SOURCE_IDENTITY_MISMATCH')
    return feature(row[value_key], source)


def elo(wrapper, g, name):
    week = g['week']
    expected = 'elo-preseason' if week == 1 else f'elo-week-{week-1:02d}'
    require(wrapper['sourceRequestId'] == expected and wrapper['sourceWeek'] == (None if week == 1 else week-1), 'ELO_TIMING_REFERENCE_MISMATCH')
    require(wrapper['sourceWeek'] is None or type(wrapper['sourceWeek']) is int, 'ELO_SOURCE_WEEK_INVALID')
    row, value = wrapper['row'], wrapper['value']
    require(wrapper['status'] in ('AVAILABLE', 'ELO_UNAVAILABLE'), 'ELO_WRAPPER_STATUS_INVALID')
    source = f'development_frames:{g["gameId"]}:{name}:{expected}'
    if row is None:
        require(wrapper['status'] == 'ELO_UNAVAILABLE' and value is None, 'ELO_WRAPPER_CONTRADICTION')
        return feature(None, source)
    require(type(row['year']) is int and row['year'] == g['season'] and row['team'] == name, 'ELO_ROW_IDENTITY_MISMATCH')
    if finite(row['elo']):
        require(wrapper['status'] == 'AVAILABLE' and finite(value) and value == row['elo'], 'ELO_WRAPPER_CONTRADICTION')
    else:
        require(wrapper['status'] == 'ELO_UNAVAILABLE' and value is None, 'ELO_WRAPPER_CONTRADICTION')
    return feature(row['elo'], source)


def check_triple(triple, allow_incomplete=True):
    require(triple['status'] in LEGACY_STATES and (allow_incomplete or triple['status'] != 'SOURCE_HISTORY_INCOMPLETE'), 'LEGACY_STATUS_INVALID')
    require(finite(triple['value']) if triple['status'] == 'AVAILABLE' else triple['value'] is None, 'LEGACY_STATUS_VALUE_CONTRADICTION')
    require(triple['n'] is None or type(triple['n']) is int and triple['n'] >= 0, 'LEGACY_N_INVALID')


def verify_v1_form(old, components):
    """Verify historical finite-subset controls before any stricter policy change."""
    count = len(components)
    reconstructed = []
    for i, key in enumerate(V1[8:12]):
        observed = [row[i] for row in components if finite(row[i])]
        value = statistics.mean(observed) if observed else None
        state = 'NO_PRIOR_FBS_GAMES' if count == 0 else 'AVAILABLE' if observed else 'FIELD_VALUE_UNAVAILABLE'
        triple = old[key]
        check_triple(triple, False)
        require(triple['n'] == len(observed) and type(triple['n']) is int and triple['status'] == state, 'LEGACY_COMPONENT_COUNT_OR_STATE_MISMATCH')
        require(value is None if triple['value'] is None else value is not None and math.isclose(value, triple['value'], abs_tol=1e-12, rel_tol=0), 'LEGACY_PARTIAL_MEAN_MISMATCH')
        reconstructed.append(value)
    for key, a, b in (('ppaNet',0,1), ('successNet',2,3)):
        value = reconstructed[a]-reconstructed[b] if reconstructed[a] is not None and reconstructed[b] is not None else None
        state = 'NO_PRIOR_FBS_GAMES' if count == 0 else 'AVAILABLE' if value is not None else 'FIELD_VALUE_UNAVAILABLE'
        triple = old[key];check_triple(triple, False)
        require(triple['n'] is None and triple['status'] == state, 'LEGACY_NET_COUNT_OR_STATE_MISMATCH')
        require(value is None if triple['value'] is None else value is not None and math.isclose(value, triple['value'], abs_tol=1e-12, rel_tol=0), 'LEGACY_PARTIAL_NET_MISMATCH')


def packaged_static(triple, source):
    check_triple(triple)
    require(triple['status'] in ('AVAILABLE', 'SOURCE_ROW_UNAVAILABLE'), 'PACKAGED_STATIC_RAW_REASON_UNRESOLVED')
    return feature(triple['value'], source)


def reconcile(current, previous, code, changes, identity):
    check_triple(previous)
    if current['state'] == 'AVAILABLE' and previous['status'] == 'AVAILABLE':
        require(math.isclose(current['value'], previous['value'], abs_tol=1e-12, rel_tol=0), code)
    elif current['state'] != previous['status']:
        # Null static values have an explicitly reviewed legacy/new naming
        # distinction. Form completeness changes may only reduce availability.
        allowed = (previous['status'] == 'FIELD_VALUE_UNAVAILABLE' and current['state'] in ('SOURCE_VALUE_INVALID', 'SOURCE_ROW_UNAVAILABLE')) or (current['state'] == 'SOURCE_HISTORY_INCOMPLETE' and previous['status'] in ('AVAILABLE', 'FIELD_VALUE_UNAVAILABLE'))
        require(allowed, code)
        changes.append({'identity': identity, 'legacyState': previous['status'], 'newState': current['state']})


def normalize(projected, expected_games=None, expected_teams=None):
    required = {'development_frames', 'development_advanced', 'development_eligibility',
                'development_static', 'development_legacy_features',
                'exploratory_legacy_predictive', 'exploratory_advanced'}
    require(set(projected) == required and all(type(v) is list for v in projected.values()), 'SEVEN_PROJECTED_ARRAYS_REQUIRED')
    expected_games = expected_games if expected_games is not None else {2022:734, 2023:750, 2024:752}
    expected_teams = expected_teams if expected_teams is not None else {2022:131, 2023:133, 2024:134}
    require(set(expected_games) == set(expected_teams) == {2022, 2023, 2024}, 'POPULATION_POLICY_INVALID')
    games, legacy, frames = {}, {}, {}
    for alias, allowed in (('development_frames', (2022, 2023)), ('exploratory_legacy_predictive', (2024,))):
        for row in projected[alias]:
            g = context(row, allowed)
            gid = g['gameId']
            require(gid not in games, 'DUPLICATE_CANONICAL_GAME')
            games[gid] = g
            if alias == 'development_frames':
                frames[gid] = row
            else:
                legacy[gid] = row
    require(bool(games), 'EMPTY_CANONICAL_POPULATION')
    for year in expected_games:
        cohort = [g for g in games.values() if g['season'] == year]
        require(len(cohort) == expected_games[year], 'GAME_DENOMINATOR_MISMATCH')
        require(len({g[k] for g in cohort for k in ('homeTeam', 'awayTeam')}) == expected_teams[year], 'TEAM_DENOMINATOR_MISMATCH')
    for row in projected['development_legacy_features']:
        g = context(row, (2022, 2023)); gid = g['gameId']
        require(gid in frames and games[gid] == g and gid not in legacy, 'DEVELOPMENT_CONTROL_IDENTITY_MISMATCH')
        legacy[gid] = row
    require(set(legacy) == set(games), 'LEGACY_CONTROL_POPULATION_MISMATCH')
    # Same-team/week ambiguity and impossible lower-week source timing block.
    team_weeks = set()
    for g in games.values():
        for name in (g['homeTeam'], g['awayTeam']):
            key = (g['season'], name, g['week'])
            require(key not in team_weeks, 'DUPLICATE_TEAM_WEEK')
            team_weeks.add(key)
    advanced, refs = {}, {}
    excluded = 0
    for alias in ('development_advanced', 'exploratory_advanced'):
        seen_source = set()
        for i, wrapper in enumerate(projected[alias]):
            if alias == 'development_advanced':
                require(team(wrapper['rowId']) and wrapper['rowId'] not in refs, 'ADVANCED_ROW_REF_DUPLICATE')
                row = wrapper['row']
                require(type(row) is dict, 'ADVANCED_WRAPPED_ROW_REQUIRED')
                require(all(wrapper[k] == row[k] and type(wrapper[k]) is type(row[k]) for k in ('season', 'week', 'gameId', 'team')), 'ADVANCED_WRAPPER_IDENTITY_MISMATCH')
                ref = wrapper['rowId']
            else:
                row = wrapper; ref = f'exploratory_advanced:{i}'
            require(type(row) is dict, 'ADVANCED_ROW_REQUIRED')
            allowed = (2022, 2023) if alias == 'development_advanced' else (2024,)
            require(type(row['season']) is int and row['season'] in allowed and positive_int(row['week']) and positive_int(row['gameId']), 'ADVANCED_IDENTITY_INVALID')
            require(team(row['team']) and team(row['opponent']) and row['team'] != row['opponent'] and type(row['seasonType']) is str, 'ADVANCED_TEAM_INVALID')
            key = (row['gameId'], row['team'])
            require(key not in seen_source, 'DUPLICATE_ADVANCED_TEAM_GAME')
            seen_source.add(key)
            refs[ref] = row
            if row['gameId'] not in games:
                excluded += 1
                continue
            g = games[row['gameId']]
            require(row['season'] == g['season'] and row['week'] == g['week'] and row['seasonType'] == 'regular', 'CANONICAL_ADVANCED_CONTEXT_MISMATCH')
            require(row['team'] in (g['homeTeam'], g['awayTeam']) and row['opponent'] == (g['awayTeam'] if row['team'] == g['homeTeam'] else g['homeTeam']), 'CANONICAL_ADVANCED_TEAM_MISMATCH')
            require(key not in advanced, 'DUPLICATE_ADVANCED_TEAM_GAME')
            advanced[key] = (row, f'{alias}:{ref}')
    static = {}
    for row in projected['development_static']:
        require(type(row['season']) is int and row['season'] in (2022, 2023) and team(row['team']), 'STATIC_IDENTITY_INVALID')
        key = (row['season'], row['team'])
        require(key not in static, 'DUPLICATE_STATIC_TEAM_SEASON')
        require(type(row['recruiting']) is list and len(row['recruiting']) == 4, 'FOUR_RECRUITING_YEARS_REQUIRED')
        recruits = {r['year']: r for r in row['recruiting'] if type(r['year']) is int}
        require(len(recruits) == 4 and set(recruits) == set(range(row['season']-3, row['season']+1)), 'RECRUITING_YEAR_SET_MISMATCH')
        prefix = f'development_static:{row["season"]}:{row["team"]}'
        static[key] = [raw_static(row['talent'], row['season'], row['team'], 'year', 'talent', prefix+':talent'),
                       raw_static(row['returningProduction'], row['season'], row['team'], 'season', 'percentPPA', prefix+':returning')]
        static[key] += [raw_static(recruits[row['season']-n], row['season']-n, row['team'], 'year', 'points', prefix+f':recruitY{n}') for n in range(4)]
    expected_static = {(g['season'], g[k]) for g in frames.values() for k in ('homeTeam', 'awayTeam')}
    require(set(static) == expected_static, 'STATIC_POPULATION_MISMATCH')
    eligibility = {}
    for row in projected['development_eligibility']:
        gid = row['gameId']
        require(type(gid) is int and gid in frames and gid not in eligibility, 'ELIGIBILITY_POPULATION_MISMATCH')
        g = games[gid]
        require(all(type(row[k]) is type(g[k]) and row[k] == g[k] for k in ('season', 'week', 'homeTeam', 'awayTeam')) and type(row['historyCutoffWeekExclusive']) is int and row['historyCutoffWeekExclusive'] == g['week'], 'ELIGIBILITY_CONTEXT_MISMATCH')
        for side in ('home', 'away'):
            ids = row[side+'AdvancedRowIds']
            require(type(ids) is list and all(type(x) is str for x in ids) and len(ids) == len(set(ids)), 'ELIGIBILITY_REFS_INVALID')
            name = g[side+'Team']
            for ref in ids:
                require(ref in refs, 'ELIGIBILITY_REF_UNRESOLVED')
                r = refs[ref]
                require(r['season'] == g['season'] and r['team'] == name and r['week'] < g['week'], 'ELIGIBILITY_FUTURE_OR_TEAM_REF')
            found = {refs[ref]['gameId'] for ref in ids if refs[ref]['gameId'] in games}
            available = {gid2 for (gid2, t), (r, _) in advanced.items() if t == name and r['season'] == g['season'] and r['week'] < g['week']}
            require(found == available, 'ELIGIBILITY_CANONICAL_REF_SET_MISMATCH')
        eligibility[gid] = row
    require(set(eligibility) == set(frames), 'ELIGIBILITY_POPULATION_MISMATCH')
    output, changes = [], []
    for g in sorted(games.values(), key=lambda x:(x['season'], x['week'], time(x['startDate']), x['gameId'])):
        sides = {}
        for side in ('home', 'away'):
            name = g[side+'Team']; old = legacy[g['gameId']][side]
            if g['season'] < 2024:
                values = [elo(frames[g['gameId']][side+'Elo'], g, name), *static[(g['season'], name)]]
                old_features = old
            else:
                require(old['team'] == name, 'PACKAGED_TEAM_IDENTITY_MISMATCH')
                old_features = old['features']
                values = [packaged_static(old_features[k], f'exploratory_legacy_predictive:{g["gameId"]}:{name}:{k}') for k in V3[:7]]
            prior = sorted([p for p in games.values() if p['season'] == g['season'] and p['week'] < g['week'] and name in (p['homeTeam'], p['awayTeam'])], key=lambda p:(p['week'], p['gameId']))
            require(all(time(p['startDate']) < time(g['startDate']) for p in prior), 'LOWER_WEEK_KICKOFF_NOT_PRIOR')
            components, missing_rows, incomplete, sources = [], [], [], []
            for p in prior:
                item = advanced.get((p['gameId'], name))
                if item is None:
                    missing_rows.append(p['gameId']); incomplete.append(p['gameId']); continue
                r, source = item; sources.append(source)
                vector = [r[unit][metric] if r[unit] is not None else None for unit, metric in (('offense','ppa'), ('defense','ppa'), ('offense','successRate'), ('defense','successRate'))]
                components.append(vector)
                if not all(finite(v) for v in vector):
                    incomplete.append(p['gameId'])
            counts = [sum(finite(row[i]) for row in components) for i in range(4)]
            complete = sum(all(finite(v) for v in row) for row in components)
            state = 'NO_PRIOR_FBS_GAMES' if not prior else 'SOURCE_HISTORY_INCOMPLETE' if incomplete else 'AVAILABLE'
            means = [statistics.mean(row[i] for row in components) for i in range(4)] if state == 'AVAILABLE' else [None]*4
            nets = [means[0]-means[1], means[2]-means[3]] if state == 'AVAILABLE' else [None]*2
            require(state != 'AVAILABLE' or all(finite(v) for v in means+nets), 'FORM_ARITHMETIC_NONFINITE')
            values.append(feature(len(prior), f'canonical_history:{g["gameId"]}:{name}'))
            values += [{'value':v, 'state':state, 'n':complete, 'sources':list(sources)} for v in means+nets]
            require(len(values) == len(F14), 'F14_WIDTH_MISMATCH')
            identity = f'{g["gameId"]}:{name}'
            for key in (V1 if g['season'] < 2024 else V3)[:7]:
                check_triple(old_features[key])
                require(type(old_features[key]['n']) is int and old_features[key]['n'] == (1 if old_features[key]['status'] == 'AVAILABLE' else 0), 'LEGACY_STATIC_N_MISMATCH')
            require(old_features['priorFbsGames']['n'] is None, 'LEGACY_PRIOR_N_MISMATCH')
            if g['season'] < 2024:
                verify_v1_form(old_features, components)
            else:
                for key in ('ppaNet','successNet'):
                    check_triple(old_features[key])
                    require(type(old_features[key]['n']) is int and old_features[key]['n'] == complete, 'LEGACY_V3_NET_N_MISMATCH')
                    require(old_features[key]['status'] == state, 'LEGACY_V3_NET_STATE_MISMATCH')
            for i, key in enumerate(V1 if g['season'] < 2024 else V3):
                index = i if g['season'] < 2024 or i < 8 else 12 if i == 8 else 13
                reconcile(values[index], old_features[key], 'LEGACY_FEATURE_RECONCILIATION_FAILED', changes, identity+':'+key)
            count_key = 'priorFbsGames'
            require(type(old_features[count_key]['value']) is int and old_features[count_key]['value'] == len(prior), 'LEGACY_PRIOR_COUNT_MISMATCH')
            if g['season'] == 2024:
                a = old['formAudit']; provenance = a['sourceProvenanceCounts']
                require(all(type(a[k]) is int and a[k] >= 0 for k in ('priorFbsGames','observedAdvancedGames','missingAdvancedGames')), 'PACKAGED_AUDIT_COUNT_INVALID')
                require(a['priorFbsGames'] == len(prior) and a['observedAdvancedGames'] == complete and a['missingAdvancedGames'] == len(incomplete), 'PACKAGED_FORM_AUDIT_MISMATCH')
                require(all(type(x) is int for x in a['missingPriorGameIds']) and sorted(a['missingPriorGameIds']) == sorted(incomplete), 'PACKAGED_MISSING_IDS_MISMATCH')
                require(type(provenance['BULK_ADVANCED_WEEK_SCOPED_RECOVERY']) is int and provenance['BULK_ADVANCED_WEEK_SCOPED_RECOVERY'] == 0, 'UNAPPROVED_RECOVERY_SOURCE_REQUIRED')
                require(type(provenance['BULK_ADVANCED_FULL_SEASON_PRIMARY']) is int and provenance['BULK_ADVANCED_FULL_SEASON_PRIMARY'] == complete, 'PACKAGED_PROVENANCE_COUNT_MISMATCH')
            sides[side] = {'team':name, 'features':dict(zip(F14, values)),
                           'formAudit':{'expected':len(prior), 'complete':complete, 'missingRowGameIds':missing_rows, 'incompleteGameIds':incomplete, 'finiteComponentCounts':counts},
                           'legacyControls':old_features,
                           'sourceTimingQualification':'PACKAGED_UNSTANDARDIZED_NOMINAL_TIMING_ONLY' if g['season'] == 2024 else 'PINNED_WEEKLY_REFERENCE_NOT_PUBLICATION_PROOF'}
        output.append({**g, **sides})
    return output, {'status':'RAW_PREDICTORS_CONSTRUCTED_NOT_TRAINING_READY', 'gamesBySeason':{str(y):expected_games[y] for y in expected_games}, 'excludedNoncanonicalAdvancedRows':excluded,
                    'legacyPolicyDifferences':changes, 'targetsRead':False, 'fits':0,
                    'scaledOrImputed':False, 'sealed2025Read':False}
