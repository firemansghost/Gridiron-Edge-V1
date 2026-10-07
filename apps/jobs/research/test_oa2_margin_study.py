import copy
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from types import SimpleNamespace

import numpy as np
import oa2_margin_study as s


def game(i=1, season=2022, neutral=False):
    def side(name, net):
        components = {m: dict(value=net / 2, n=2, status='AVAILABLE') for m in s.METRICS}
        raw = copy.deepcopy(components)
        raw['ppaOff']['value'] = net
        raw['ppaDef']['value'] = 0.0
        raw['successOff']['value'] = net * 0.1
        raw['successDef']['value'] = 0.0
        adjusted = copy.deepcopy(components)
        adjusted['successOff']['value'] = net * 0.05
        adjusted['successDef']['value'] = net * 0.05
        for section in (raw, adjusted):
            section['ppaNet'] = dict(value=net, status='AVAILABLE')
            section['successNet'] = dict(value=net * 0.1, status='AVAILABLE')
        return dict(teamIdInternal=name, teamNameCfbd=name, raw=raw, opponentAdjusted=adjusted,
                    priorAvailableMetricGames=2)
    return dict(season=season, providerGameId=str(i), providerWeek=3, neutralSite=neutral,
                homeTeamNameCfbd='H', awayTeamNameCfbd='A', homeTeamIdInternal='H', awayTeamIdInternal='A',
                home=side('H', 1.0), away=side('A', 0.1))


class StudyTests(unittest.TestCase):
    def test_known_ols_coefficients(self):
        x = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1], [2, 3, 1]], dtype=float)
        beta = np.array([2, -3, 4], dtype=float)
        result = s.fit_matrix(x, x @ beta)
        np.testing.assert_allclose(result['coefficients'], beta, atol=1e-12)

    def test_rank_deficiency_blocks(self):
        with self.assertRaisesRegex(s.Blocked, 'ill_conditioned'):
            s.fit_matrix(np.ones((4, 3)), np.arange(4))

    def test_bad_condition_blocks(self):
        with self.assertRaisesRegex(s.Blocked, 'ill_conditioned'):
            s.fit_matrix(np.diag([1, 1, 1e-11]), np.ones(3))

    def test_metric_sign_and_denominator(self):
        result = s.metrics([2, 0], [0, 1])
        self.assertEqual(result['n'], 2)
        self.assertEqual(result['mae'], 1.5)
        self.assertEqual(result['meanSignedError'], 0.5)
        self.assertAlmostEqual(result['rmse'], np.sqrt(2.5))

    def test_neutral_reversal_symmetry(self):
        g = game(neutral=True)
        swapped = copy.deepcopy(g)
        swapped['home'], swapped['away'] = g['away'], g['home']
        for model in ('RAW', 'OA'):
            np.testing.assert_allclose(s.design([g], model), -s.design([swapped], model))

    def test_home_reversal_changes_only_hfa(self):
        g = game()
        swapped = copy.deepcopy(g)
        swapped['home'], swapped['away'] = g['away'], g['home']
        beta = np.array([3, 5, 2])
        for model in ('RAW', 'OA'):
            self.assertAlmostEqual(float((s.design([g], model) @ beta)[0] +
                                         (s.design([swapped], model) @ beta)[0]), 4)

    def test_forbidden_season(self):
        with self.assertRaisesRegex(s.Blocked, 'forbidden_season'):
            s.key(dict(season=2025, gameId=1))

    def test_duplicate_json_keys(self):
        with self.assertRaisesRegex(s.Blocked, 'duplicate_json'):
            s.decode('{"season":2022,"season":2023}')

    def test_nonfinite_json(self):
        with self.assertRaisesRegex(s.Blocked, 'nonfinite_json'):
            s.decode('{"score":NaN}')

    def test_prefix_skips_elo_content(self):
        frame = '{"season":2022,"gameId":1,"week":2,"startDate":null,"homeTeam":"H", "awayTeam":"A","neutralSite":false,"homeElo":{"value":NaN}}'
        result = s.project_prefix(frame, s.FRAME_FIELDS)
        self.assertNotIn('homeElo', result)
        self.assertEqual(result['week'], 2)

    def test_prefix_requires_frozen_field_order(self):
        with self.assertRaisesRegex(s.Blocked, 'prefix_schema'):
            s.project_prefix('{"gameId":1,"season":2022}', ('season', 'gameId'))

    def test_selected_season_only_decodes_numeric_labels(self):
        records = []
        for year, count in ((2022, 734), (2023, 750)):
            for i in range(count):
                row = dict(season=year, gameId=i+1, homeTeam='H', awayTeam='A',
                           finalHomePoints=7, finalAwayPoints=0, homeMargin=7)
                records.append(json.dumps(row))
        data = ('[' + ','.join(records) + ']').encode()
        archive = SimpleNamespace(read=lambda member: data)
        original = s.decode
        decoded_seasons = []
        def spy(text):
            row = original(text)
            decoded_seasons.append(row['season'])
            return row
        with patch.object(s, 'decode', spy):
            labels = s.read_labels(archive, 2022)
        self.assertEqual(len(labels), 734)
        self.assertEqual(set(decoded_seasons), {2022})

    def test_escaped_braces_do_not_split_records(self):
        data = json.dumps([dict(season=2022, team='x{["\\'), dict(season=2023)]).encode()
        slices = list(s.object_slices(data))
        self.assertEqual(len(slices), 2)
        self.assertEqual(s.decode(slices[0])['team'], 'x{["\\')

    def test_object_scanner_rejects_trailing_and_bad_separator(self):
        for data in (b'[{"season":2022}] extra', b'[{"season":2022}{"season":2023}]', b'[{"season":2022},]'):
            with self.assertRaises(s.Blocked):
                list(s.object_slices(data))

    def test_source_hash_failure_before_parse(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'x.zip'
            p.write_bytes(b'not a zip')
            with self.assertRaisesRegex(s.Blocked, 'source_zip_hash'):
                s.Archive(p, '0' * 64)

    def test_archive_manifest_inventory_and_no_market_parser(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'x.zip'
            b = b'[]'
            with zipfile.ZipFile(p, 'w') as z:
                z.writestr('root/outcomes/outcomes.json', b)
                z.writestr('root/manifest.json', s.json_bytes(dict(artifacts=[dict(file='outcomes/outcomes.json', bytes=2, sha256=s.digest(b))])))
            archive = s.Archive(p, s.digest(p.read_bytes()))
            with self.assertRaisesRegex(s.Blocked, 'forbidden_member'):
                archive.read('evaluation/market_lines.json')

    def test_receipt_tamper_and_exclusive_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'out'
            evidence = s.Evidence(out)
            evidence.write('report.json', dict(status='PASS'))
            evidence.finish({})
            h = s.digest((out / 'manifest.json').read_bytes())
            s.verify_receipt(out, h)
            with self.assertRaises(FileExistsError):
                s.Evidence(out)
            (out / 'report.json').write_text('{}')
            with self.assertRaisesRegex(s.Blocked, 'receipt_member'):
                s.verify_receipt(out, h)

    def test_label_exact_identity(self):
        g = game()
        labels = {s.key(g): dict(homeTeam='WRONG', awayTeam='A', homeMargin=1)}
        with self.assertRaisesRegex(s.Blocked, 'outcome_identity'):
            s.label_vector([g], labels)

    def test_score_requires_fit_receipt_before_labels(self):
        g = game(season=2023)
        args = SimpleNamespace(mode='SCORE', expected_repo_sha='a'*40, confirm='OA_2_SCORE_2022_2023',
                               preview_dir='p', expected_preview_manifest_sha='b'*64,
                               fit_dir=None, expected_fit_manifest_sha=None)
        with tempfile.TemporaryDirectory() as tmp:
            args.contract = str(Path(tmp) / 'contract')
            Path(args.contract).write_text('frozen')
            with patch.dict(os.environ, GITHUB_SHA='a'*40, GITHUB_REF='refs/heads/main'), \
                 patch.object(s, 'load_sources', return_value=(None, [g], [], [g], {})), \
                 patch.object(s, 'verify_stage'), patch.object(s, 'read_labels') as labels:
                with self.assertRaisesRegex(s.Blocked, 'frozen_fit_required'):
                    s.run(args)
                labels.assert_not_called()

    def test_preview_never_opens_outcomes_or_fits(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = Path(tmp) / 'contract'
            c.write_text('frozen')
            args = SimpleNamespace(mode='PREVIEW', expected_repo_sha='a'*40,
                                   confirm='OA_2_PREVIEW_2022_2023', contract=str(c),
                                   output_dir=str(Path(tmp)/'preview'))
            with patch.dict(os.environ, GITHUB_SHA='a'*40, GITHUB_REF='refs/heads/main'), \
                 patch.object(s, 'load_sources', return_value=(None, [], [], [], {})), \
                 patch.object(s, 'read_labels') as labels, patch.object(s, 'fit_matrix') as fit, \
                 patch('sys.stdout', new_callable=io.StringIO):
                s.run(args)
                labels.assert_not_called()
                fit.assert_not_called()


if __name__ == '__main__':
    unittest.main()
