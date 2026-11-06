"""V2 contract regression with fictional identities, never historical inputs."""
from copy import deepcopy
import unittest
import real_adapter as legacy
import real_adapter_v2 as repaired
from artificial_legacy import fixture
from shared_week_fixtures import projected,shared_week_bundle

COUNTS={2022:3,2023:3,2024:3}
TEAMS={2022:2,2023:2,2024:2}


def build(data):return repaired.normalize(data,COUNTS,TEAMS)


class SharedProviderWeekTests(unittest.TestCase):
    def test_ordinary_population_exactly_matches_original(self):
        data=projected(fixture());before=deepcopy(data)
        self.assertEqual(build(data),legacy.normalize(data,COUNTS,TEAMS))
        self.assertEqual(data,before)

    def test_distinct_same_week_games_retained_and_excluded_from_each_other(self):
        data=projected(shared_week_bundle());before=deepcopy(data)
        with self.assertRaisesRegex(legacy.AdapterStop,'DUPLICATE_TEAM_WEEK'):
            legacy.normalize(data,COUNTS,TEAMS)
        raw,summary=build(data)
        self.assertEqual(len(raw),9);self.assertEqual(len({g['gameId'] for g in raw}),9)
        source={g['gameId']:g for alias in ('development_frames','exploratory_legacy_predictive') for g in data[alias]}
        for g in raw:
            self.assertEqual({key:g[key] for key in repaired.CONTEXT},{key:source[g['gameId']][key] for key in repaired.CONTEXT})
            self.assertIs(type(g['gameId']),int)
            for side in ('home','away'):
                f=g[side]['features'];audit=g[side]['formAudit']
                self.assertEqual(tuple(f),repaired.F14)
                if g['week']==1:
                    self.assertEqual(f['priorFbsGames']['value'],0)
                    for key in repaired.F14[8:]:
                        self.assertIsNone(f[key]['value']);self.assertEqual(f[key]['state'],'NO_PRIOR_FBS_GAMES');self.assertEqual(f[key]['n'],0);self.assertEqual(f[key]['sources'],[])
                else:
                    self.assertEqual(g['week'],3);self.assertEqual(f['priorFbsGames']['value'],2)
                    self.assertEqual(audit['complete'],2);self.assertEqual(f['ppaOffMean']['value'],3);self.assertEqual(f['ppaDefMean']['value'],2)
                    self.assertAlmostEqual(f['successOffMean']['value'],.7);self.assertAlmostEqual(f['successDefMean']['value'],.3)
                    self.assertEqual(f['ppaNet']['value'],1);self.assertAlmostEqual(f['successNet']['value'],.4)
                    self.assertEqual(len(f['ppaNet']['sources']),2)
        self.assertEqual(summary['fits'],0);self.assertEqual(data,before)

    def test_duplicate_canonical_id_still_rejected(self):
        data=projected(shared_week_bundle());data['development_frames'].append(deepcopy(data['development_frames'][0]))
        with self.assertRaisesRegex(repaired.AdapterStop,'DUPLICATE_CANONICAL_GAME'):build(data)

    def test_conflicting_control_context_still_rejected(self):
        data=projected(shared_week_bundle());data['development_legacy_features'][0]['homeTeam']='Conflicting Academy'
        with self.assertRaisesRegex(repaired.AdapterStop,'CONTROL_IDENTITY_MISMATCH'):build(data)

    def test_same_week_reference_still_rejected_even_with_earlier_kickoff(self):
        data=projected(shared_week_bundle());data['development_eligibility'][1]['homeAdvancedRowIds']=['fictional:2022:1:home']
        with self.assertRaisesRegex(repaired.AdapterStop,'ELIGIBILITY_FUTURE_OR_TEAM_REF'):build(data)

    def test_lower_week_nonprior_kickoff_still_rejected(self):
        data=projected(shared_week_bundle())
        for alias in ('development_frames','development_legacy_features'):data[alias][0]['startDate']='2022-10-01T18:00:00Z'
        with self.assertRaisesRegex(repaired.AdapterStop,'LOWER_WEEK_KICKOFF_NOT_PRIOR'):build(data)

    def test_duplicate_advanced_row_still_rejected(self):
        data=projected(shared_week_bundle());data['development_advanced'].append(deepcopy(data['development_advanced'][0]))
        with self.assertRaisesRegex(repaired.AdapterStop,'ADVANCED_ROW_REF_DUPLICATE'):build(data)

    def test_2025_context_still_rejected(self):
        data=projected(shared_week_bundle());data['development_frames'][0]['season']=2025
        with self.assertRaisesRegex(repaired.AdapterStop,'SEASON_NOT_ALLOWED'):build(data)


if __name__=='__main__':unittest.main(verbosity=2)
