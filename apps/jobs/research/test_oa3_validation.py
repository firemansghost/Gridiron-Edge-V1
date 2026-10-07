import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import oa3_validation as v
import oa2_margin_study as s


def games():
    bundle={section:{m:dict(n=2,value=0.2,status='AVAILABLE') for m in s.METRICS} |
            {m:dict(value=0.0,status='AVAILABLE') for m in ('ppaNet','successNet')}
            for section in ('raw','opponentAdjusted')}
    return [dict(season=2024,providerGameId=str(i+1),providerWeek=3,neutralSite=False,
                 home=copy.deepcopy(bundle),away=copy.deepcopy(bundle)) for i in range(752)]


class Tests(unittest.TestCase):
    def test_partial_baseline_excluded_from_both_models(self):
        rows=games(); rows[0]['home']['opponentAdjusted']['ppaOff'].update(status='PARTIAL_OPPONENT_BASELINE',n=1)
        ledger,included=v.cohort(rows)
        self.assertEqual(len(included),751)
        self.assertFalse(next(x for x in ledger if x['providerGameId']=='1')['eligible'])

    def test_available_count_inconsistency_blocks(self):
        rows=games();rows[0]['home']['opponentAdjusted']['ppaOff']['n']=1
        with self.assertRaisesRegex(s.Blocked,'available_component'):v.cohort(rows)

    def test_duplicate_target_blocks(self):
        rows=games();rows[-1]=rows[0]
        with self.assertRaisesRegex(s.Blocked,'duplicate_game'):v.cohort(rows)

    def test_2025_is_not_decoded(self):
        class Archive:
            def read(self,name):return b'[{"contractVersion":"x","season":2025,"secret":NaN},{"contractVersion":"oa_data_1_canonical_historical_team_game_archive_v1","season":2024}]'
        with patch.object(s,'digest',return_value=v.CANONICAL_MEMBER_SHA):
            rows=v.selected_rows(Archive())
        self.assertEqual([r['season'] for r in rows],[2024])

    def test_receipt_hash_blocks_before_any_outcome(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp,'manifest.json').write_text('{}')
            with patch.object(v,'read_outcomes') as labels:
                with self.assertRaisesRegex(s.Blocked,'receipt_manifest_hash'):
                    v.verify_stage(tmp,'0'*64,'PRESCORE',{})
                labels.assert_not_called()

    def test_unknown_neutral_site_excluded(self):
        rows=games();rows[0]['neutralSite']=None
        _,included=v.cohort(rows);self.assertEqual(len(included),751)

    def test_outcome_duplicate_blocks(self):
        r=dict(season=2024,seasonType='regular',completed=True,homeClassification='fbs',awayClassification='fbs',id=1,homeTeam='A',awayTeam='B',homePoints=3,awayPoints=0)
        class Archive:
            def read(self,name):return json.dumps([r,r]).encode()
        with patch.object(s,'digest',return_value=v.OUTCOME_MEMBER_SHA):
            with self.assertRaisesRegex(s.Blocked,'outcome_identity'):v.read_outcomes(Archive(),[])

    def test_wrong_confirmation_blocks_before_sources_or_labels(self):
        import os
        args=SimpleNamespace(expected_repo_sha='a'*40,mode='SCORE',confirm='wrong')
        with patch.dict(os.environ,GITHUB_SHA='a'*40,GITHUB_REF='refs/heads/main'),patch.object(v,'Archive') as source:
            with self.assertRaisesRegex(s.Blocked,'confirmation_guard'):v.run(args)
            source.assert_not_called()


if __name__=='__main__':unittest.main()
