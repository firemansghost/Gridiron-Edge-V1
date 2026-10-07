"""Frozen OA-2 artifact-only study. No provider, database, or market runtime path."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import sys
import zipfile

import numpy as np

VERSION = 'oa_2_raw_vs_adjusted_margin_study_v1'
FEATURE_SHA = '2624219b2d8e4e85b27490900f2a1c340a03e9368a071f24d45ae7f3ff57bc95'
CORPUS_SHA = 'cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d'
FEATURE_MEMBER_SHA = 'bf7e2e8ba797241a1ad0a8d941e0e56c4895e5d26e202c63f0bd9682351e8ba2'
CONTRACT = 'research/opponent-adjustment/OA_2_RAW_VS_ADJUSTED_MARGIN_STUDY_V1_DRAFT.md'
METRICS = ('ppaOff', 'ppaDef', 'successOff', 'successDef')
OUTCOME_FIELDS = ('season', 'gameId', 'homeTeam', 'awayTeam', 'finalHomePoints', 'finalAwayPoints', 'homeMargin')
FRAME_FIELDS = ('season', 'gameId', 'week', 'startDate', 'homeTeam', 'awayTeam', 'neutralSite')
BOUNDARIES = dict(providerCalls=0, databaseReads=0, databaseWrites=0,
                  marketReads=0, betReads=0, modelPredictionReads=0,
                  season2024RowsRead=0, season2025RowsRead=0, season2026RowsRead=0)


class Blocked(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise Blocked(reason)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(obj):
    return (json.dumps(obj, indent=2, sort_keys=True, allow_nan=False) + '\n').encode()


def unique_object(pairs):
    obj = {}
    for k, v in pairs:
        require(k not in obj, 'duplicate_json_key:' + k)
        obj[k] = v
    return obj


def decode(data):
    return json.loads(data, object_pairs_hook=unique_object,
                      parse_constant=lambda value: (_ for _ in ()).throw(Blocked('nonfinite_json')))


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def integer(value):
    return type(value) is int


def key(row):
    season = row['season']
    require(integer(season) and season in (2022, 2023), 'forbidden_season')
    game_id = row.get('providerGameId', row.get('gameId'))
    require((integer(game_id) and game_id > 0) or
            (type(game_id) is str and re.fullmatch(r'[1-9][0-9]*', game_id)), 'invalid_game_id')
    return f'{season}|{game_id}'


class Archive:
    """Verify every manifested byte, but parse only explicitly allowed members."""
    def __init__(self, path, expected_sha):
        require(digest(Path(path).read_bytes()) == expected_sha, 'source_zip_hash_mismatch')
        self.z = zipfile.ZipFile(path)
        names = self.z.namelist()
        require(len(names) == len(set(names)), 'duplicate_zip_member')
        require(all(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts
                    and not n.endswith('/') for n in names), 'unsafe_zip_member')
        manifests = [n for n in names if PurePosixPath(n).name == 'manifest.json']
        require(len(manifests) == 1, 'ambiguous_manifest')
        self.root = manifests[0][:-len('manifest.json')]
        manifest = decode(self.z.read(manifests[0]))
        entries = manifest.get('artifacts')
        require(type(entries) is list, 'manifest_schema')
        expected = {manifests[0]}
        for entry in entries:
            name = self.root + entry['file']
            require(name not in expected, 'duplicate_manifest_member')
            expected.add(name)
            b = self.z.read(name)
            require(len(b) == entry['bytes'] and digest(b) == entry['sha256'], 'member_hash_mismatch')
        require(set(names) == expected, 'manifest_inventory_mismatch')
        self.sha = expected_sha

    def read(self, member):
        allowed = {'features/oa_1_game_features.json', 'report.json', 'audit/source_identity.json',
                   'predictive/game_frames.json', 'outcomes/outcomes.json'}
        require(member in allowed, 'forbidden_member_parse')
        return self.z.read(self.root + member)


def object_slices(data):
    """Split a JSON array by syntax, without deserializing skipped record values."""
    text = data.decode('utf-8')
    pos = 0
    def ws(p):
        while p < len(text) and text[p].isspace():
            p += 1
        return p
    pos = ws(pos)
    require(pos < len(text) and text[pos] == '[', 'array_schema')
    pos = ws(pos + 1)
    if pos < len(text) and text[pos] == ']':
        require(ws(pos + 1) == len(text), 'trailing_json')
        return
    while True:
        require(pos < len(text) and text[pos] == '{', 'record_schema')
        start, depth, quoted, escaped = pos, 0, False, False
        while pos < len(text):
            char = text[pos]
            if quoted:
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                elif char == '"':
                    quoted = False
            elif char == '"':
                quoted = True
            elif char in '{[':
                depth += 1
            elif char in '}]':
                depth -= 1
                if depth == 0:
                    pos += 1
                    break
            pos += 1
        require(depth == 0 and not quoted, 'unterminated_record')
        yield text[start:pos]
        pos = ws(pos)
        require(pos < len(text), 'unterminated_array')
        if text[pos] == ']':
            require(ws(pos + 1) == len(text), 'trailing_json')
            return
        require(text[pos] == ',', 'array_separator')
        pos = ws(pos + 1)


def project_prefix(text, fields):
    """Decode only named leading fields; Elo/other frame content remains unparsed."""
    decoder, pos, result = json.JSONDecoder(), 1, {}
    for field in fields:
        while text[pos].isspace():
            pos += 1
        name, pos = decoder.raw_decode(text, pos)
        require(name == field, 'prefix_schema:' + field)
        while text[pos].isspace():
            pos += 1
        require(text[pos] == ':', 'prefix_colon')
        pos += 1
        while text[pos].isspace():
            pos += 1
        value, pos = decoder.raw_decode(text, pos)
        result[name] = value
        while text[pos].isspace():
            pos += 1
        if field != fields[-1]:
            require(text[pos] == ',', 'prefix_separator')
            pos += 1
    return result


def read_frames(archive):
    result = {}
    for text in object_slices(archive.read('predictive/game_frames.json')):
        row = project_prefix(text, FRAME_FIELDS)
        k = key(row)
        require(k not in result, 'duplicate_frame_key')
        result[k] = row
    require(len(result) == 1484, 'frame_count')
    return result


def read_labels(archive, season):
    """Unselected seasons are never JSON-decoded, including their numeric labels."""
    require(season in (2022, 2023), 'forbidden_label_season')
    result = {}
    counts = {2022: 0, 2023: 0}
    seen = set()
    for text in object_slices(archive.read('outcomes/outcomes.json')):
        identity = project_prefix(text, OUTCOME_FIELDS[:4])
        k = key(identity)
        require(k not in seen, 'duplicate_outcome_key')
        seen.add(k)
        counts[identity['season']] += 1
        if identity['season'] != season:
            continue
        row = decode(text)
        require(set(row) == set(OUTCOME_FIELDS), 'outcome_schema')
        require(all(finite(row[f]) for f in OUTCOME_FIELDS[-3:]), 'invalid_outcome_value')
        require(row['homeMargin'] == row['finalHomePoints'] - row['finalAwayPoints'], 'label_arithmetic')
        result[k] = row
    require(counts == {2022: 734, 2023: 750}, 'outcome_universe_count')
    return result


def cohort(games, frames):
    seen, ledger, included = set(), [], []
    counts = {2022: 0, 2023: 0}
    for g in games:
        k = key(g)
        require(k not in seen, 'duplicate_feature_key')
        seen.add(k)
        counts[g['season']] += 1
        require(k in frames, 'unmatched_frame')
        frame = frames[k]
        require(frame['week'] == g['providerWeek'] and
                frame['homeTeam'] == g['homeTeamNameCfbd'] and
                frame['awayTeam'] == g['awayTeamNameCfbd'] and
                frame['neutralSite'] == g['neutralSite'], 'frame_identity_mismatch')
        require(integer(g['providerWeek']) and g['providerWeek'] >= 1, 'invalid_week')
        reasons = []
        if type(g['neutralSite']) is not bool:
            reasons.append('UNKNOWN_NEUTRAL_SITE')
        for side_name in ('home', 'away'):
            side = g[side_name]
            require(side['teamIdInternal'] == g[side_name + 'TeamIdInternal'] and
                    side['teamNameCfbd'] == g[side_name + 'TeamNameCfbd'], 'side_identity_mismatch')
            for m in METRICS:
                raw, adj = side['raw'][m], side['opponentAdjusted'][m]
                require(integer(raw['n']) and integer(adj['n']) and 0 <= adj['n'] <= raw['n'], 'invalid_metric_count')
                if adj['status'] != 'AVAILABLE':
                    reasons.append(side_name + '.' + m + ':' + adj['status'])
                elif not (adj['n'] > 0 and adj['n'] == raw['n'] and
                          finite(raw['value']) and finite(adj['value'])):
                    raise Blocked('available_component_inconsistent')
            for section in ('raw', 'opponentAdjusted'):
                for net in ('ppaNet', 'successNet'):
                    if not finite(side[section][net]['value']):
                        reasons.append(side_name + '.' + section + '.' + net + ':UNAVAILABLE')
        eligible = not reasons
        ledger.append(dict(key=k, season=g['season'], providerGameId=g['providerGameId'],
                           providerWeek=g['providerWeek'], eligible=eligible, reasons=sorted(set(reasons))))
        if eligible:
            included.append(g)
    require(counts == {2022: 734, 2023: 750} and seen == set(frames), 'universe_mismatch')
    ledger.sort(key=lambda x: x['key'])
    included.sort(key=key)
    return ledger, included


def design(games, model):
    require(model in ('RAW', 'OA', 'STRUCTURAL'), 'unknown_model')
    rows = []
    for g in games:
        require(type(g['neutralSite']) is bool, 'unknown_neutral')
        h = float(not g['neutralSite'])
        if model == 'STRUCTURAL':
            rows.append([h])
        else:
            section = 'raw' if model == 'RAW' else 'opponentAdjusted'
            rows.append([g['home'][section][m]['value'] - g['away'][section][m]['value']
                         for m in ('ppaNet', 'successNet')] + [h])
    matrix = np.array(rows, dtype=np.float64)
    require(matrix.ndim == 2 and np.isfinite(matrix).all(), 'invalid_design')
    return matrix


def fit_matrix(x, y):
    require(len(x) == len(y) and len(y) > 0 and np.isfinite(y).all(), 'invalid_fit_data')
    beta, _, rank, singular = np.linalg.lstsq(x, y, rcond=1e-12)
    condition = float(singular[0] / singular[-1]) if singular[-1] > 0 else float('inf')
    require(rank == x.shape[1] and condition <= 1e10 and np.isfinite(beta).all(), 'ill_conditioned_fit')
    return dict(coefficients=beta.tolist(), rank=int(rank), singularValues=singular.tolist(),
                conditionNumber=condition, coefficientFloat64LeSha256=digest(beta.astype('<f8').tobytes()))


def metrics(prediction, y):
    e = np.array(prediction, dtype=np.float64) - np.array(y, dtype=np.float64)
    require(len(e) > 0 and np.isfinite(e).all(), 'invalid_metrics')
    a = np.abs(e)
    return dict(n=len(e), mae=float(a.mean()), rmse=float(np.sqrt(np.mean(e * e))),
                meanSignedError=float(e.mean()), medianAbsoluteError=float(np.median(a)),
                absoluteErrorQuantiles={str(q): float(np.quantile(a, q, method='linear')) for q in (0.5, 0.75, 0.9, 0.95)})


def label_vector(games, labels):
    require(set(labels) == {key(g) for g in games} or
            {key(g) for g in games}.issubset(labels), 'label_join_missing')
    values = []
    for g in games:
        row = labels[key(g)]
        require(row['homeTeam'] == g['homeTeamNameCfbd'] and
                row['awayTeam'] == g['awayTeamNameCfbd'], 'outcome_identity_mismatch')
        values.append(row['homeMargin'])
    return np.array(values, dtype=np.float64)


def validate_all_labels(games, labels, season):
    targets = [g for g in games if g['season'] == season]
    require(set(labels) == {key(g) for g in targets}, 'label_universe_mismatch')
    label_vector(targets, labels)


class Evidence:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=False)
        self.entries = []

    def write(self, name, obj):
        b = json_bytes(obj)
        with (self.root / name).open('xb') as handle:
            handle.write(b)
        self.entries.append(dict(file=name, bytes=len(b), sha256=digest(b)))
        return digest(b)

    def finish(self, context):
        with (self.root / 'manifest.json').open('xb') as handle:
            handle.write(json_bytes(dict(version=VERSION, context=context, artifacts=self.entries)))


def verify_receipt(root, expected_sha):
    root = Path(root)
    b = (root / 'manifest.json').read_bytes()
    require(digest(b) == expected_sha, 'receipt_manifest_hash_mismatch')
    manifest = decode(b)
    require(manifest['version'] == VERSION, 'receipt_version')
    expected = {'manifest.json'}
    for entry in manifest['artifacts']:
        name = entry['file']
        require(PurePosixPath(name).name == name and name not in expected, 'unsafe_receipt_member')
        expected.add(name)
        b = (root / name).read_bytes()
        require(len(b) == entry['bytes'] and digest(b) == entry['sha256'], 'receipt_member_hash_mismatch')
    require({p.name for p in root.iterdir()} == expected, 'receipt_inventory')
    return manifest


def unpack_receipt(path, expected_sha, output):
    """Extract only one flat receipt root after validating the reviewed ZIP identity."""
    require(digest(Path(path).read_bytes()) == expected_sha, 'preview_zip_hash_mismatch')
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        require(len(names) == len(set(names)), 'duplicate_receipt_zip_member')
        manifests = [n for n in names if PurePosixPath(n).name == 'manifest.json']
        require(len(manifests) == 1, 'receipt_zip_manifest')
        root = manifests[0][:-len('manifest.json')]
        require(all(n.startswith(root) and PurePosixPath(n[len(root):]).name == n[len(root):]
                    for n in names), 'receipt_zip_inventory')
        out = Path(output)
        out.mkdir(parents=True, exist_ok=False)
        for n in names:
            with (out / n[len(root):]).open('xb') as f:
                f.write(z.read(n))
    h = digest((out / 'manifest.json').read_bytes())
    verify_receipt(out, h)
    return h


def load_sources(args):
    features = Archive(args.feature_zip, FEATURE_SHA)
    corpus = Archive(args.corpus_zip, CORPUS_SHA)
    fb = features.read('features/oa_1_game_features.json')
    require(digest(fb) == FEATURE_MEMBER_SHA, 'feature_member_identity')
    payload = decode(fb)
    require(payload['seasons'] == [2022, 2023] and
            payload['version'] == 'oa_1_opponent_adjusted_efficiency_feature_v1', 'feature_schema')
    frames = read_frames(corpus)
    games = payload['games']
    ledger, included = cohort(games, frames)
    identity = dict(version=VERSION, featureArtifactId=11479616709, featureZipSha256=FEATURE_SHA,
                    featureMemberSha256=FEATURE_MEMBER_SHA, outcomeCorpusArtifactId=10997010171,
                    outcomeCorpusZipSha256=CORPUS_SHA, contractSha256=digest(Path(args.contract).read_bytes()),
                    cohortLedgerSha256=digest(json_bytes(ledger)))
    return corpus, games, ledger, included, identity


def verify_stage(root, expected_sha, mode, identity, context, ledger):
    manifest = verify_receipt(root, expected_sha)
    require(manifest['context'] == context, 'receipt_context_mismatch')
    require(decode((Path(root) / 'source_identity.json').read_bytes()) == identity, 'receipt_source_mismatch')
    require(decode((Path(root) / 'cohort_ledger.json').read_bytes()) == ledger, 'receipt_cohort_mismatch')
    report = decode((Path(root) / 'report.json').read_bytes())
    require(report['mode'] == mode and report['status'] == 'PASS', 'receipt_not_pass')


def score_diagnostics(games, predictions, y):
    buckets = {}
    for i, g in enumerate(games):
        w = g['providerWeek']
        n = min(g[s]['priorAvailableMetricGames'] for s in ('home', 'away'))
        keys = [('weekBand', '1-4' if w <= 4 else '5-8' if w <= 8 else '9+'),
                ('site', 'NEUTRAL' if g['neutralSite'] else 'NON_NEUTRAL'),
                ('historyBand', '1-2' if n <= 2 else '3-5' if n <= 5 else '6+'),
                ('seasonWeek', f'{g["season"]}-W{w}')]
        for category, name in keys:
            buckets.setdefault((category, name), []).append(i)
    result = {}
    for (category, name), indices in sorted(buckets.items()):
        values = {m: metrics(p[indices], y[indices]) for m, p in predictions.items()}
        values['deltaMAE'] = values['OA']['mae'] - values['RAW']['mae']
        values['deltaRMSE'] = values['OA']['rmse'] - values['RAW']['rmse']
        result.setdefault(category, {})[name] = values
    return result


def run(args):
    require(re.fullmatch(r'[0-9a-f]{40}', args.expected_repo_sha) is not None, 'invalid_repo_sha')
    require(os.environ.get('GITHUB_SHA') == args.expected_repo_sha and
            os.environ.get('GITHUB_REF') == 'refs/heads/main', 'source_sha_guard')
    require(args.confirm == 'OA_2_' + args.mode + '_2022_2023', 'confirmation_guard')
    context = dict(repoCommitSha=args.expected_repo_sha, contractSha256=digest(Path(args.contract).read_bytes()))
    corpus, games, ledger, included, identity = load_sources(args)
    counts = {str(y): dict(universe=sum(g['season'] == y for g in games),
                           eligible=sum(g['season'] == y for g in included)) for y in (2022, 2023)}
    extra = dict(outcomeRowsDecoded2022=0, outcomeRowsDecoded2023=0, modelFitting=False)
    outputs = {}
    if args.mode != 'PREVIEW':
        require(args.preview_dir and args.expected_preview_manifest_sha, 'reviewed_preview_required')
        verify_stage(args.preview_dir, args.expected_preview_manifest_sha, 'PREVIEW', identity, context, ledger)
    if args.mode == 'FIT':
        labels = read_labels(corpus, 2022)
        validate_all_labels(games, labels, 2022)
        train = [g for g in included if g['season'] == 2022]
        y = label_vector(train, labels)
        models, training_metrics = {}, {}
        for model in ('RAW', 'OA', 'STRUCTURAL'):
            x = design(train, model)
            models[model] = fit_matrix(x, y)
            training_metrics[model] = metrics(x @ np.array(models[model]['coefficients']), y)
        outputs['frozen_models.json'] = dict(version=VERSION, context=context, sourceIdentity=identity,
                                             trainingKeys=[key(g) for g in train], models=models,
                                             numpyVersion=np.__version__, labelSeason=2022)
        outputs['metrics_2022.json'] = dict(interpretation='IN_SAMPLE_ONLY', models=training_metrics)
        extra.update(outcomeRowsDecoded2022=len(labels), modelFitting=True)
    if args.mode == 'SCORE':
        require(args.fit_dir and args.expected_fit_manifest_sha, 'frozen_fit_required')
        verify_stage(args.fit_dir, args.expected_fit_manifest_sha, 'FIT', identity, context, ledger)
        freeze = decode((Path(args.fit_dir) / 'frozen_models.json').read_bytes())
        require(freeze['context'] == context and freeze['sourceIdentity'] == identity and
                freeze['labelSeason'] == 2022 and
                freeze['trainingKeys'] == [key(g) for g in included if g['season'] == 2022], 'model_freeze_mismatch')
        models = freeze['models']
        require(set(models) == {'RAW', 'OA', 'STRUCTURAL'}, 'model_inventory')
        for model, record in models.items():
            beta = np.array(record['coefficients'], dtype=np.float64)
            require(len(beta) == (1 if model == 'STRUCTURAL' else 3) and np.isfinite(beta).all() and
                    digest(beta.astype('<f8').tobytes()) == record['coefficientFloat64LeSha256'], 'coefficient_hash')
        # This is deliberately the first access to any 2023 numeric outcome label.
        labels = read_labels(corpus, 2023)
        validate_all_labels(games, labels, 2023)
        test = [g for g in included if g['season'] == 2023]
        y = label_vector(test, labels)
        predictions = {m: design(test, m) @ np.array(models[m]['coefficients']) for m in models}
        measured = {m: metrics(p, y) for m, p in predictions.items()}
        delta_mae = measured['OA']['mae'] - measured['RAW']['mae']
        delta_rmse = measured['OA']['rmse'] - measured['RAW']['rmse']
        decision = 'ADVANCE_TO_SEPARATELY_CONTRACTED_VALIDATION' if delta_mae < 0 and delta_rmse <= 0 else 'NO_CLEAR_DEVELOPMENT_ADVANTAGE'
        outputs['predictions_2023.json'] = [dict(key=key(g), homeMargin=float(y[i]),
                                                predictions={m: float(p[i]) for m, p in predictions.items()})
                                           for i, g in enumerate(test)]
        outputs['frozen_models.json'] = freeze
        outputs['metrics_2022.json'] = decode((Path(args.fit_dir) / 'metrics_2022.json').read_bytes())
        outputs['metrics.json'] = dict(interpretation='CHRONOLOGICAL_DEVELOPMENT_TEST_NOT_PRISTINE_HOLDOUT',
                                       models=measured, deltaMAE=delta_mae, deltaRMSE=delta_rmse,
                                       decision=decision, diagnostics=score_diagnostics(test, predictions, y))
        extra.update(outcomeRowsDecoded2023=len(labels), scientificDecision=decision,
                     frozenFitManifestSha256=args.expected_fit_manifest_sha)
    report = dict(version=VERSION, mode=args.mode, status='PASS', context=context, coverage=counts,
                  executionHost='GITHUB_ACTIONS' if os.environ.get('GITHUB_ACTIONS') == 'true' else 'LOCAL_ARTIFACT_ONLY',
                  workflowRunId=os.environ.get('GITHUB_RUN_ID'), runnerFileSha256=digest(Path(__file__).read_bytes()),
                  boundaries=BOUNDARIES, **extra)
    evidence = Evidence(args.output_dir)
    evidence.write('source_identity.json', identity)
    evidence.write('cohort_ledger.json', ledger)
    for name, obj in outputs.items():
        evidence.write(name, obj)
    evidence.write('report.json', report)
    evidence.finish(context)
    print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', required=True, choices=('PREVIEW', 'FIT', 'SCORE'))
    for name in ('feature-zip', 'corpus-zip', 'output-dir', 'expected-repo-sha', 'confirm'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--contract', default=CONTRACT)
    for name in ('preview-dir', 'expected-preview-manifest-sha', 'fit-dir', 'expected-fit-manifest-sha'):
        parser.add_argument('--' + name)
    args = parser.parse_args()
    try:
        run(args)
    except (Blocked, KeyError, TypeError, json.JSONDecodeError, OSError, zipfile.BadZipFile) as exc:
        print('OA_2_BLOCKED:' + str(exc), file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
