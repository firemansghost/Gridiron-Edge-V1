"""Authorized unchanged OA-2 refit; PREVIEW then freeze, 2022/2023 only."""
import argparse
import os
from pathlib import Path
import re
import sys

import numpy as np
import oa2_margin_study as s

REFIT_VERSION = 'oa_2_combined_season_refit_v1'
STUDY_MANIFEST_SHA = '65c1dd88f6646fd7fcba323241271e494ca90c35c4e0c5441a9b22222f91ce9f'
HELPER_SHA = 'fb9c112d62b113a5239dc33326f1a5a97f0e88dba2870b81b8715f42c9520934'
CONTRACT_SHA = 'c5469eb672c20e1a247fe69b6bf23ad12bda00dac8e6a55561460a5f714562b2'


def load_authorized_inputs(args):
    s.require(s.digest(Path(s.__file__).read_bytes()) == HELPER_SHA, 'frozen_helper_drift')
    s.require(s.digest(Path(args.contract).read_bytes()) == CONTRACT_SHA, 'frozen_contract_drift')
    s.verify_receipt(args.study_dir, STUDY_MANIFEST_SHA)
    corpus, games, ledger, included, identity = s.load_sources(args)
    root = Path(args.study_dir)
    report = s.decode((root / 'report.json').read_bytes())
    measured = s.decode((root / 'metrics.json').read_bytes())
    s.require(report['mode'] == 'SCORE' and report['status'] == 'PASS' and
              measured['decision'] == 'ADVANCE_TO_SEPARATELY_CONTRACTED_VALIDATION', 'development_not_accepted')
    s.require(s.decode((root / 'source_identity.json').read_bytes()) == identity and
              s.decode((root / 'cohort_ledger.json').read_bytes()) == ledger, 'development_input_mismatch')
    s.require(len(included) == 1211 and
              sum(g['season'] == 2022 for g in included) == 598 and
              sum(g['season'] == 2023 for g in included) == 613, 'authorized_cohort_mismatch')
    return corpus, games, ledger, included, identity


def refit_models(games, labels):
    s.require(len(games) == 1211, 'authorized_refit_count')
    y = s.label_vector(games, labels)
    models, training_metrics = {}, {}
    for model in ('RAW', 'OA', 'STRUCTURAL'):
        x = s.design(games, model)
        models[model] = s.fit_matrix(x, y)
        training_metrics[model] = s.metrics(x @ np.array(models[model]['coefficients']), y)
    return models, training_metrics


def run(args):
    s.require(re.fullmatch(r'[0-9a-f]{40}', args.expected_repo_sha) is not None and
              os.environ.get('GITHUB_SHA') == args.expected_repo_sha and
              os.environ.get('GITHUB_REF') == 'refs/heads/main', 'source_sha_guard')
    expected = 'OA_2_REFIT_PREVIEW_2022_2023_1211' if args.mode == 'PREVIEW' else 'OA_2_REFIT_2022_2023_1211'
    s.require(args.confirm == expected, 'refit_confirmation_guard')
    corpus, games, ledger, included, identity = load_authorized_inputs(args)
    context = dict(repoCommitSha=args.expected_repo_sha, contractSha256=CONTRACT_SHA,
                   helperSha256=HELPER_SHA, operation=REFIT_VERSION,
                   acceptedDevelopmentManifestSha256=STUDY_MANIFEST_SHA)
    outputs = {}
    decoded = {2022: 0, 2023: 0}
    if args.mode == 'REFIT':
        s.require(args.preview_dir and args.expected_preview_manifest_sha, 'refit_preview_required')
        s.verify_stage(args.preview_dir, args.expected_preview_manifest_sha, 'PREVIEW', identity, context, ledger)
        labels = {}
        for year in (2022, 2023):
            selected = s.read_labels(corpus, year)
            s.validate_all_labels(games, selected, year)
            labels.update(selected)
            decoded[year] = len(selected)
        models, measured = refit_models(included, labels)
        outputs['frozen_models.json'] = dict(
            version=REFIT_VERSION, modelSpecificationVersion=s.VERSION, context=context,
            sourceIdentity=identity, trainingSeasons=[2022, 2023],
            trainingKeys=[s.key(g) for g in included], models=models,
            numpyVersion=np.__version__, normalization='NONE', intercept=False,
            loss='EQUAL_GAME_OLS', singularValueCutoff=1e-12,
            eligibleCounts={'2022': 598, '2023': 613},
            authorization='Bobby explicitly authorized unchanged 1211-game refit on 2026-10-07',
            purpose='FROZEN_RESEARCH_CANDIDATES_FOR_SEPARATELY_CONTRACTED_VALIDATION')
        outputs['training_metrics.json'] = dict(interpretation='IN_SAMPLE_ONLY_NOT_NEW_VALIDATION', models=measured)
    report = dict(version=REFIT_VERSION, mode=args.mode, status='PASS', context=context,
                  universeGames=len(games), trainingGames=len(included), excludedGames=len(ledger)-len(included),
                  eligibleCounts={'2022': 598, '2023': 613}, modelSpecificationChanged=False,
                  modelFitting=args.mode == 'REFIT', numericOutcomeRowsDecoded=decoded,
                  boundaries=s.BOUNDARIES,
                  executionHost='GITHUB_ACTIONS' if os.environ.get('GITHUB_ACTIONS') == 'true' else 'LOCAL_ARTIFACT_ONLY',
                  workflowRunId=os.environ.get('GITHUB_RUN_ID'), runnerFileSha256=s.digest(Path(__file__).read_bytes()))
    evidence = s.Evidence(args.output_dir)
    evidence.write('source_identity.json', identity)
    evidence.write('cohort_ledger.json', ledger)
    for name, value in outputs.items():
        evidence.write(name, value)
    evidence.write('report.json', report)
    evidence.finish(context)
    print(s.json_bytes(report).decode())


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mode', choices=('PREVIEW', 'REFIT'), required=True)
    for name in ('feature-zip', 'corpus-zip', 'study-dir', 'output-dir', 'expected-repo-sha', 'confirm'):
        p.add_argument('--' + name, required=True)
    p.add_argument('--contract', default=s.CONTRACT)
    p.add_argument('--preview-dir')
    p.add_argument('--expected-preview-manifest-sha')
    args = p.parse_args()
    try:
        run(args)
    except (s.Blocked, ValueError, KeyError, TypeError, OSError) as error:
        print('OA_2_REFIT_BLOCKED:' + str(error), file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
