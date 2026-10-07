"""Frozen artifact-only 2024 validation: FEATURE -> PRESCORE -> SCORE."""
import argparse
from collections import Counter
import os
from pathlib import Path
import re
import subprocess
import sys
import numpy as np
import oa2_margin_study as s

VERSION = 'oa_3_2024_validation_v1'
CONTRACT = 'research/opponent-adjustment/OA_3_2024_VALIDATION_V1_CONTRACT.md'
CONTRACT_SHA = '3b2a0728163f8056e3e3bfef137f970c44a0df0f8e6dd9dcf62b5c16bbfafdce'
CORE = Path(__file__).resolve().parents[1] / 'src/research/oa-1-opponent-adjusted-efficiency.ts'
CORE_SHA = 'c5077f7d18ad175617061c35a236d2b3f337f10a44c8a451cdd41a480ca096e5'
HELPER_SHA = 'fb9c112d62b113a5239dc33326f1a5a97f0e88dba2870b81b8715f42c9520934'
CANONICAL_SHA = '0d5371f7dda6f95a14bbd4d40d7a04c442c998daa1a0e47a3459b76364631e10'
CANONICAL_MEMBER_SHA = '6ccea22db8e74feabdc08bbe9b422703486d48fa6820a4dfa802475e04420ff2'
SNAPSHOT_SHA = 'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544'
OUTCOME_MEMBER_SHA = '942cf02ef8888c9d31676c5097ae821016fc2e7f35b25b7fd5ad890d2477cf59'
REFIT_MANIFEST_SHA = '1fb36c8c1ee695de8a62794b9370fbd82c37a4ce8a9a3ec4f6993a7b585b5f4a'
FREEZE_SHA = 'f2c8efa5cdb65d3e61e79ab660358e5c794622138d3e7c3a9f70515802c82cf2'
GAPS = {'401641034','401644689','401644780','401645328'}


class Archive(s.Archive):
    def read(self,member):
        s.require(member in ('archive/canonical_team_games.json','raw/001-games.json'), 'forbidden_member_parse')
        return self.z.read(self.root+member)


def game_key(g):
    s.require(g['season'] == 2024, 'forbidden_season')
    return '2024|' + str(g['providerGameId'])


def selected_rows(archive, season=2024):
    s.require(season in (2022,2023,2024),'forbidden_canonical_season')
    b = archive.read('archive/canonical_team_games.json')
    s.require(s.digest(b) == CANONICAL_MEMBER_SHA, 'canonical_member_identity')
    rows = []
    for text in s.object_slices(b):
        prefix = s.project_prefix(text, ('contractVersion', 'season'))
        if prefix['season'] == season:
            row = s.decode(text)
            s.require(row['contractVersion'] == 'oa_data_1_canonical_historical_team_game_archive_v1', 'canonical_version')
            rows.append(row)
    return rows


def adapt_rows(rows):
    result, seen = [], set()
    for row in rows:
        k = (row['season'], str(row['providerGameId']), row['team'])
        s.require(k not in seen, 'duplicate_natural_key')
        seen.add(k)
        s.require(s.integer(row['providerWeek']) and row['providerWeek'] >= 1 and
                  type(row['isHome']) is bool and type(row['neutralSite']) is bool, 'invalid_canonical_frame')
        s.require(row['status'] in ('AVAILABLE', 'SOURCE_UNAVAILABLE'), 'availability_status')
        for metric in s.METRICS:
            s.require(s.finite(row[metric]) if row['status']=='AVAILABLE' else row[metric] is None, 'canonical_metric')
        result.append(dict(season=row['season'], providerGameId=str(row['providerGameId']),
            providerWeek=row['providerWeek'], startDate=row['startDate'], neutralSite=row['neutralSite'],
            homeTeamNameCfbd=row['homeTeam'], awayTeamNameCfbd=row['awayTeam'],
            teamNameCfbd=row['team'], opponentNameCfbd=row['opponent'],
            teamIdInternal='CFBD_NAME:'+row['team'], opponentTeamIdInternal='CFBD_NAME:'+row['opponent'],
            isHome=row['isHome'], availabilityStatus=row['status'],
            **{m:row[m] for m in s.METRICS}))
    grouped={}
    for r in result:grouped.setdefault((r['season'],r['providerGameId']),[]).append(r)
    for pair in grouped.values():
        s.require(len(pair)==2 and pair[0]['neutralSite']==pair[1]['neutralSite'] and
                  pair[0]['startDate']==pair[1]['startDate'],'canonical_pair_frame')
    return result


def compute_features(rows):
    bridge = Path(__file__).with_name('oa3_feature_bridge.mjs')
    process = subprocess.run(['node', str(bridge)], input=s.json_bytes(adapt_rows(rows)),
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    computed = s.decode(process.stdout)
    s.require(computed['badGameFrames']==0 and not computed['blockers'], 'bad_feature_frames')
    return computed


def cohort(games):
    ledger, included, seen = [], [], set()
    for g in games:
        k = game_key(g)
        s.require(k not in seen, 'duplicate_game_key')
        seen.add(k)
        reasons=[]
        if type(g['neutralSite']) is not bool:
            reasons.append('UNKNOWN_NEUTRAL_SITE')
        for side in ('home','away'):
            for metric in s.METRICS:
                a,r=g[side]['opponentAdjusted'][metric],g[side]['raw'][metric]
                s.require(s.integer(a['n']) and s.integer(r['n']) and 0<=a['n']<=r['n'], 'invalid_metric_count')
                if a['status']!='AVAILABLE':
                    reasons.append(side+'.'+metric+':'+a['status'])
                else:
                    s.require(a['n']>0 and a['n']==r['n'] and s.finite(a['value']) and s.finite(r['value']), 'available_component_inconsistent')
            for section in ('raw','opponentAdjusted'):
                for net in ('ppaNet','successNet'):
                    if not s.finite(g[side][section][net]['value']):
                        reasons.append(side+'.'+section+'.'+net+':UNAVAILABLE')
        ledger.append(dict(key=k, season=2024, providerGameId=g['providerGameId'],
                           providerWeek=g['providerWeek'], eligible=not reasons, reasons=sorted(set(reasons))))
        if not reasons: included.append(g)
    ledger.sort(key=lambda e:e['key']); included.sort(key=game_key)
    s.require(len(ledger)==752 and len(included)>0, 'cohort_universe')
    return ledger,included


def read_outcomes(snapshot, games):
    b = snapshot.read('raw/001-games.json')
    s.require(s.digest(b)==OUTCOME_MEMBER_SHA, 'outcome_member_identity')
    labels={}
    rows=s.decode(b)
    for row in rows:
        s.require(row['season']==2024, 'forbidden_outcome_season')
        if not (row['seasonType']=='regular' and row['completed'] is True and
                row['homeClassification']=='fbs' and row['awayClassification']=='fbs'):
            continue
        k='2024|'+str(row['id'])
        s.require(s.integer(row['id']) and row['id']>0 and k not in labels, 'outcome_identity')
        s.require(s.finite(row['homePoints']) and s.finite(row['awayPoints']), 'outcome_value')
        labels[k]=dict(homeTeam=row['homeTeam'], awayTeam=row['awayTeam'],
                      homeMargin=row['homePoints']-row['awayPoints'])
    s.require(len(labels)==752 and set(labels)=={game_key(g) for g in games}, 'outcome_universe_mismatch')
    for g in games:
        r=labels[game_key(g)]
        s.require((r['homeTeam'],r['awayTeam'])==(g['homeTeamNameCfbd'],g['awayTeamNameCfbd']), 'outcome_team_mismatch')
    return labels,len(rows)


def verify_stage(directory, expected_sha, mode, context):
    root=Path(directory)
    b=(root/'manifest.json').read_bytes()
    s.require(s.digest(b)==expected_sha,'receipt_manifest_hash_mismatch')
    manifest=s.decode(b)
    s.require(manifest['version']==VERSION,'receipt_version')
    names={'manifest.json'}
    for e in manifest['artifacts']:
        s.require(Path(e['file']).name==e['file'] and e['file'] not in names,'unsafe_receipt_member')
        names.add(e['file'])
        member=(root/e['file']).read_bytes()
        s.require(len(member)==e['bytes'] and s.digest(member)==e['sha256'],'receipt_member_hash_mismatch')
    s.require({p.name for p in root.iterdir()}==names,'receipt_inventory')
    report=s.decode((Path(directory)/'report.json').read_bytes())
    s.require(manifest['context']==context and report['context']==context and
              report['mode']==mode and report['status']=='PASS', 'stage_receipt_mismatch')
    return Path(directory)


def run(args):
    s.require(re.fullmatch('[0-9a-f]{40}',args.expected_repo_sha) is not None and
              os.environ.get('GITHUB_SHA')==args.expected_repo_sha and os.environ.get('GITHUB_REF')=='refs/heads/main', 'source_sha_guard')
    s.require(args.confirm=='OA_3_2024_'+args.mode, 'confirmation_guard')
    s.require(s.digest(Path(args.contract).read_bytes())==CONTRACT_SHA and
              s.digest(CORE.read_bytes())==CORE_SHA and
              s.digest(Path(s.__file__).read_bytes())==HELPER_SHA, 'frozen_code_or_contract_drift')
    s.verify_receipt(args.refit_dir, REFIT_MANIFEST_SHA)
    frozen_bytes=(Path(args.refit_dir)/'frozen_models.json').read_bytes()
    s.require(s.digest(frozen_bytes)==FREEZE_SHA, 'coefficient_freeze_drift')
    frozen=s.decode(frozen_bytes)
    for m in frozen['models'].values():
        s.require(s.digest(np.array(m['coefficients'],dtype='<f8').tobytes())==m['coefficientFloat64LeSha256'], 'coefficient_hash')
    context=dict(version=VERSION, repoCommitSha=args.expected_repo_sha, contractSha256=CONTRACT_SHA,
                 coreSha256=CORE_SHA, helperSha256=HELPER_SHA, coefficientFreezeSha256=FREEZE_SHA,
                 canonicalZipSha256=CANONICAL_SHA, outcomeSnapshotZipSha256=SNAPSHOT_SHA)
    decoded=0
    outputs={}
    if args.mode=='FEATURE':
        canonical=Archive(args.canonical_zip,CANONICAL_SHA)
        rows=selected_rows(canonical)
        s.require(len(rows)==1504 and len({r['providerGameId'] for r in rows})==752, 'canonical_counts')
        gaps=Counter(str(r['providerGameId']) for r in rows if r['status']=='SOURCE_UNAVAILABLE')
        s.require(set(gaps)==GAPS and all(n==2 for n in gaps.values()), 'source_gap_identity')
        computed=compute_features(rows)
        games=computed['games']
        ledger,included=cohort(games)
        outputs.update(game_features=computed['games'],residual_audit=computed['residualAudit'],
                       cohort_ledger=ledger,source_coverage=dict(rows=1504,games=752,availableRows=1496,sourceUnavailableRows=8,gapGameIds=sorted(GAPS)))
    else:
        s.require(args.feature_dir and args.feature_manifest_sha, 'feature_receipt_required')
        feature=verify_stage(args.feature_dir,args.feature_manifest_sha,'FEATURE',context)
        games=s.decode((feature/'game_features.json').read_bytes())
        ledger,included=cohort(games)
        s.require(s.decode((feature/'cohort_ledger.json').read_bytes())==ledger, 'cohort_drift')
        predictions={model:s.design(included,model)@np.array(frozen['models'][model]['coefficients']) for model in ('RAW','OA','STRUCTURAL')}
        prescore_rows=[dict(key=game_key(g),providerWeek=g['providerWeek'],neutralSite=g['neutralSite'],
            homeTeam=g['homeTeamNameCfbd'],awayTeam=g['awayTeamNameCfbd'],
            **{m:float(predictions[m][i]) for m in predictions}) for i,g in enumerate(included)]
        s.require(all(np.isfinite(v).all() for v in predictions.values()), 'nonfinite_prediction')
        outputs.update(cohort_ledger=ledger,predictions=prescore_rows,frozen_models=frozen)
        if args.mode=='SCORE':
            s.require(args.prescore_dir and args.prescore_manifest_sha, 'prescore_receipt_required')
            prescore=verify_stage(args.prescore_dir,args.prescore_manifest_sha,'PRESCORE',context)
            s.require((prescore/'frozen_models.json').read_bytes()==frozen_bytes and
                      s.decode((prescore/'predictions.json').read_bytes())==prescore_rows and
                      s.decode((prescore/'cohort_ledger.json').read_bytes())==ledger, 'prescore_prediction_or_freeze_drift')
            snapshot=Archive(args.snapshot_zip,SNAPSHOT_SHA)
            labels,decoded=read_outcomes(snapshot,games)
            y=np.array([labels[game_key(g)]['homeMargin'] for g in included])
            measured={m:s.metrics(v,y) for m,v in predictions.items()}
            delta_mae=measured['OA']['mae']-measured['RAW']['mae']
            delta_rmse=measured['OA']['rmse']-measured['RAW']['rmse']
            outputs.update(metrics=dict(models=measured,deltaMAE=delta_mae,deltaRMSE=delta_rmse,
                decision='ADVANCE_TO_FINAL_FREEZE_AND_SEPARATE_2025_CONTRACT' if delta_mae<0 and delta_rmse<=0 else 'VALIDATION_FAIL_DO_NOT_OPEN_2025'),
                diagnostics=s.score_diagnostics(included,predictions,y),
                scored_predictions=[dict(r,actualHomeMargin=float(y[i])) for i,r in enumerate(prescore_rows)])
    outputs['report']=dict(version=VERSION,mode=args.mode,status='PASS',context=context,
        universeGames=752,eligibleGames=len(included),excludedGames=752-len(included),
        numeric2024OutcomeRowsDecoded=decoded,eligible2024OutcomesScored=len(included) if args.mode=='SCORE' else 0,
        modelFitting=False,providerCalls=0,databaseReads=0,databaseWrites=0,marketReads=0,
        betReads=0,existingModelPredictionReads=0,season2025PayloadsDecoded=0,season2026PayloadsDecoded=0,
        executionHost='LOCAL_ARTIFACT_ONLY' if os.environ.get('GITHUB_ACTIONS')!='true' else 'GITHUB_ACTIONS',
        workflowRunId=os.environ.get('GITHUB_RUN_ID'),runnerSha256=s.digest(Path(__file__).read_bytes()),
        featureReceiptSha256=args.feature_manifest_sha if args.mode!='FEATURE' else None,
        prescoreReceiptSha256=args.prescore_manifest_sha if args.mode=='SCORE' else None)
    evidence=s.Evidence(args.output_dir)
    for name,value in outputs.items():evidence.write(name+'.json',value)
    (evidence.root/'manifest.json').write_bytes(s.json_bytes(dict(version=VERSION,context=context,artifacts=evidence.entries)))
    print(s.json_bytes(outputs['report']).decode())


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mode',choices=('FEATURE','PRESCORE','SCORE'),required=True)
    for field in ('canonical-zip','snapshot-zip','refit-dir','expected-repo-sha','confirm','output-dir'):
        p.add_argument('--'+field,required=True)
    p.add_argument('--contract',default=CONTRACT)
    for field in ('feature-dir','feature-manifest-sha','prescore-dir','prescore-manifest-sha'):
        p.add_argument('--'+field)
    try:run(p.parse_args())
    except (s.Blocked,ValueError,KeyError,TypeError,OSError,subprocess.CalledProcessError) as e:
        print('OA_3_BLOCKED:'+str(e),file=sys.stderr);sys.exit(2)


if __name__=='__main__':main()
