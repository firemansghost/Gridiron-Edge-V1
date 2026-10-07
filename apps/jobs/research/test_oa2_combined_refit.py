import io
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import oa2_combined_refit as r
import oa2_margin_study as s


class RefitTests(unittest.TestCase):
    def test_wrong_cohort_blocks_before_fit(self):
        with patch.object(s, 'fit_matrix') as fit:
            with self.assertRaisesRegex(s.Blocked, 'authorized_refit_count'):
                r.refit_models([], {})
            fit.assert_not_called()

    def test_helper_drift_blocks_before_sources(self):
        args = SimpleNamespace()
        with patch.object(r, 'HELPER_SHA', '0' * 64), patch.object(s, 'load_sources') as sources:
            with self.assertRaisesRegex(s.Blocked, 'helper_drift'):
                r.load_authorized_inputs(args)
            sources.assert_not_called()

    def test_refit_reuses_exact_frozen_model_math(self):
        games = [None] * 1211
        x = np.vstack([np.eye(3), np.ones((1208, 3))])
        y = x @ np.array([2.0, 3.0, 4.0])
        def design(g, model):
            return np.ones((1211, 1)) if model == 'STRUCTURAL' else x
        with patch.object(s, 'label_vector', return_value=y), patch.object(s, 'design', side_effect=design):
            models, _ = r.refit_models(games, {})
        np.testing.assert_allclose(models['RAW']['coefficients'], [2,3,4], atol=1e-12)
        np.testing.assert_allclose(models['OA']['coefficients'], [2,3,4], atol=1e-12)
        self.assertEqual(len(models['STRUCTURAL']['coefficients']), 1)

    def test_preview_decodes_no_labels_or_models(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = SimpleNamespace(expected_repo_sha='a'*40, mode='PREVIEW',
                                   confirm='OA_2_REFIT_PREVIEW_2022_2023_1211', output_dir=str(Path(tmp)/'out'))
            with patch.dict(os.environ, GITHUB_SHA='a'*40, GITHUB_REF='refs/heads/main'), \
                 patch.object(r, 'load_authorized_inputs', return_value=(None, [], [], [], {})), \
                 patch.object(s, 'read_labels') as labels, patch.object(r, 'refit_models') as fit, \
                 patch('sys.stdout', new_callable=io.StringIO):
                r.run(args)
                labels.assert_not_called()
                fit.assert_not_called()

    def test_refit_requires_preview_before_labels(self):
        args = SimpleNamespace(expected_repo_sha='a'*40, mode='REFIT',
                               confirm='OA_2_REFIT_2022_2023_1211', preview_dir=None,
                               expected_preview_manifest_sha=None)
        with patch.dict(os.environ, GITHUB_SHA='a'*40, GITHUB_REF='refs/heads/main'), \
             patch.object(r, 'load_authorized_inputs', return_value=(None, [], [], [], {})), \
             patch.object(s, 'read_labels') as labels:
            with self.assertRaisesRegex(s.Blocked, 'refit_preview_required'):
                r.run(args)
            labels.assert_not_called()


if __name__ == '__main__':
    unittest.main()
