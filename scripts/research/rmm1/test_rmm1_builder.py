import copy
from dataclasses import replace
import hashlib
import json
import math
from pathlib import Path
import tempfile
import unittest
import rmm1_builder as b
import synthetic_fixtures as fixtures

FREEZE=Path(__file__).resolve().parents[3]/'research/historical/rmm1/freeze'

def cell(frame,name,value,state=b.AVAILABLE,side_name='home'):
    side=getattr(frame,side_name);features=list(side.features);i=b.F14.index(name)
    features[i]=replace(features[i],value=value,state=state)
    return replace(frame,**{side_name:replace(side,features=tuple(features))})

class BuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle=fixtures.repeatability_fixture()
        cls.frames=b.build(cls.bundle)
        cls.train=cls.frames[:96];cls.val=cls.frames[96:]
        cls.params=b.fit_preprocessor(cls.train)
        cls.fold_frames=b.build(fixtures.fold_fixture())

    def test_frozen_contract_bound_exactly(self):
        self.assertEqual(b.bind_frozen_contract(FREEZE),'RMM1-design-freeze-20261105')

    def test_wrong_registry_rejected_before_members(self):
        with tempfile.TemporaryDirectory() as p:
            Path(p,'FROZEN_CONTRACT.json').write_text('{}')
            with self.assertRaisesRegex(b.IntegrityStop,'REGISTRY_HASH'):b.bind_frozen_contract(p)

    def test_deterministic_fixed_fixture_population(self):
        raw=json.dumps(self.bundle,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
        again=json.dumps(fixtures.repeatability_fixture(),sort_keys=True,separators=(',',':'),allow_nan=False).encode()
        self.assertEqual(hashlib.sha256(raw).digest(),hashlib.sha256(again).digest())
        self.assertEqual((len(self.frames),len(self.train),len(self.val)),(128,96,32))
        self.assertTrue(all(f.game.game_id.startswith('SYN-') for f in self.frames))

    def test_literal_form_means_nets_and_observed_zero(self):
        frames=b.build(fixtures.toy_fixture())
        self.assertEqual(frames[0].home.features[7].value,0)
        self.assertTrue(all(f.value is None and f.state=='NO_PRIOR_FBS_GAMES' and f.n==0 for f in frames[0].home.features[8:]))
        self.assertEqual(frames[1].home.features[8].value,0)
        self.assertEqual(frames[1].home.features[8].state,b.AVAILABLE)
        self.assertEqual([f.value for f in frames[2].home.features[8:10]],[1.0,.5])
        self.assertAlmostEqual(frames[2].home.features[10].value,.3)
        self.assertAlmostEqual(frames[2].home.features[13].value,.15)
        self.assertEqual(frames[2].home.features[12].value,.5)
        self.assertEqual(frames[2].home.audit.complete,2)

    def test_single_bad_component_invalidates_all_six(self):
        data=fixtures.toy_fixture();data['advancedRows'][0]['offense']['ppa']=None
        frame=b.build(data)[-1]
        self.assertEqual(frame.home.audit.expected,2)
        self.assertEqual(frame.home.audit.complete,1)
        self.assertEqual(frame.home.audit.finite_counts,(1,2,2,2))
        self.assertEqual(frame.home.audit.missing_ids,('SYN-TOY-0000',))
        self.assertTrue(all(f.value is None and f.state=='SOURCE_HISTORY_INCOMPLETE' and f.n==1 for f in frame.home.features[8:]))
        self.assertEqual(frame.away.features[8].state,b.AVAILABLE)

    def test_missing_advanced_row_is_source_gap_not_no_prior(self):
        data=fixtures.toy_fixture();data['advancedRows'].pop(0)
        frame=b.build(data)[1]
        self.assertEqual(frame.home.features[7].value,1)
        self.assertTrue(all(f.state=='SOURCE_HISTORY_INCOMPLETE' and f.n==0 for f in frame.home.features[8:]))

    def test_no_partial_means_for_bool_string_or_nonfinite(self):
        for value in (True,'0',float('nan'),float('inf')):
            data=fixtures.toy_fixture();data['advancedRows'][0]['defense']['successRate']=value
            frame=b.build(data)[1]
            self.assertTrue(all(f.state=='SOURCE_HISTORY_INCOMPLETE' for f in frame.home.features[8:]))

    def test_same_week_and_excluded_fbs_rows_do_not_enter_history(self):
        data=fixtures.toy_fixture()
        extra=copy.deepcopy(data['games'][0]);extra['gameId']='SYN-EXCLUDED-0000';extra['canonicalFbs']=False
        data['games'].append(extra)
        same=copy.deepcopy(data['games'][0]);same['gameId']='SYN-SAMEWEEK-0000';same['kickoffUtc']='2022-08-02T00:00:00Z'
        data['games'].append(same)
        data['canonicalIds'].append(same['gameId'])
        frames=b.build(data);index={f.game.game_id:f for f in frames}
        self.assertNotIn(extra['gameId'],index)
        self.assertEqual(index[same['gameId']].home.features[7].value,0)
        self.assertEqual(index['SYN-TOY-0001'].home.features[7].value,2)

    def test_earlier_week_late_kickoff_blocks(self):
        data=fixtures.toy_fixture();data['games'][0]['kickoffUtc']='2022-12-31T00:00:00Z'
        with self.assertRaisesRegex(b.IntegrityStop,'HISTORY_KICKOFF'):b.build(data)

    def test_missing_static_null_invalid_and_zero_have_distinct_states(self):
        for value,state in ((None,'SOURCE_ROW_UNAVAILABLE'),(True,'SOURCE_VALUE_INVALID'),('7','SOURCE_VALUE_INVALID'),(float('inf'),'SOURCE_VALUE_INVALID'),(0,b.AVAILABLE)):
            data=fixtures.toy_fixture();row=next(r for r in data['staticRows'] if r['family']=='talent' and r['team']=='SYNTEAM-000');row['talent']=value
            feature=b.build(data)[0].home.features[1]
            self.assertEqual(feature.state,state)
            self.assertEqual(feature.value,0 if state==b.AVAILABLE else None)
        data=fixtures.toy_fixture();data['staticRows']=[r for r in data['staticRows'] if not(r['family']=='talent' and r['team']=='SYNTEAM-000')]
        self.assertEqual(b.build(data)[0].home.features[1].state,'SOURCE_ROW_UNAVAILABLE')

    def test_static_field_omission_and_unknown_score_are_fatal(self):
        data=fixtures.toy_fixture();del data['staticRows'][0]['talent']
        with self.assertRaisesRegex(b.IntegrityStop,'SCHEMA'):b.build(data)
        for where in ('root','game','advanced'):
            data=fixtures.toy_fixture();target=data if where=='root' else data['games'][0] if where=='game' else data['advancedRows'][0]
            target['homePoints']=21
            with self.assertRaisesRegex(b.IntegrityStop,'SCHEMA'):b.build(data)

    def test_game_and_source_duplicate_identities_block(self):
        for key in ('games','staticRows','advancedRows'):
            data=fixtures.toy_fixture();data[key].append(copy.deepcopy(data[key][0]))
            with self.assertRaisesRegex(b.IntegrityStop,'DUPLICATE'):b.build(data)

    def test_canonical_manifest_prevents_silent_deletion_or_reclassification(self):
        data=fixtures.toy_fixture();data['games'][0]['canonicalFbs']=False
        with self.assertRaisesRegex(b.IntegrityStop,'CANONICAL_POPULATION'):b.build(data)
        data=fixtures.toy_fixture();data['games'].pop()
        with self.assertRaisesRegex(b.IntegrityStop,'CANONICAL_POPULATION'):b.build(data)
        data=fixtures.toy_fixture();data['canonicalIds'].append(data['canonicalIds'][0])
        with self.assertRaisesRegex(b.IntegrityStop,'DUPLICATE_CANONICAL'):b.build(data)

    def test_wrong_game_team_year_week_and_schema_block(self):
        for field,value in (('gameId','SYN-UNKNOWN-0'),('team','SYNTEAM-999'),('opponent','SYNTEAM-999'),('season',2023),('week',2)):
            data=fixtures.toy_fixture();data['advancedRows'][0][field]=value
            with self.assertRaises(b.IntegrityStop):b.build(data)
        data=fixtures.toy_fixture();data['staticRows'][0]['year']=2021
        with self.assertRaisesRegex(b.IntegrityStop,'SOURCE_YEAR'):b.build(data)

    def test_week_zero_bool_context_and_missing_utc_block(self):
        for field,value in (('week',0),('week',True),('neutral',0),('season',2025),('kickoffUtc','2022-08-01T00:00:00')):
            data=fixtures.toy_fixture();data['games'][0][field]=value
            with self.assertRaises(b.IntegrityStop):b.build(data)

    def test_date_only_or_unresolved_utc_kickoffs_are_rejected(self):
        for value in ('2022-08-01Z','2022-08-01T00:00Z','2022-08-01T00:00:00+00:00','2022-08-01T00:00:00.1234567Z'):
            data=fixtures.toy_fixture();data['games'][0]['kickoffUtc']=value
            with self.assertRaisesRegex(b.IntegrityStop,'KICKOFF_UTC_REQUIRED'):b.build(data)
        self.assertIsNotNone(b.kickoff('2022-08-01T00:00:00.123456Z').tzinfo)

    def test_artificial_namespace_and_bundle_guard(self):
        for field,value in (('synthetic',False),('fixtureId','production')):
            data=fixtures.toy_fixture();data[field]=value
            with self.assertRaises(b.IntegrityStop):b.build(data)
        data=fixtures.toy_fixture();data['games'][0]['home']='UNLV'
        with self.assertRaisesRegex(b.IntegrityStop,'ARTIFICIAL_ID'):b.build(data)

    def test_elo_uses_opening_then_exact_prior_week(self):
        frames=b.build(fixtures.toy_fixture())
        self.assertEqual([f.home.features[0].value for f in frames],[1500,1501,1502])
        self.assertIn('/preseason/',frames[0].home.features[0].sources[0])
        self.assertIn('/1/',frames[1].home.features[0].sources[0])
        for field,value in (('sourceWeek',1),('seasonType','postseason'),('preseason',1)):
            data=fixtures.toy_fixture();row=next(r for r in data['staticRows'] if r['family']=='elo' and r['preseason'] is True);row[field]=value
            with self.assertRaises(b.IntegrityStop):b.build(data)

    def test_recruiting_slots_are_season_relative(self):
        frame=b.build(fixtures.toy_fixture())[0]
        self.assertEqual([f.value for f in frame.home.features[3:7]],[16,14,12,10])
        self.assertIn('/2019/',frame.home.features[6].sources[0])

    def test_null_original_n_or_inconsistent_raw_values_never_become_zero(self):
        f=self.train[8];side=f.home;features=list(side.features);features[8]=replace(features[8],n=None)
        with self.assertRaisesRegex(b.IntegrityStop,'FORM_N'):b.check_raw(replace(f,home=replace(side,features=tuple(features))))
        bad=cell(f,'talent',None,b.AVAILABLE)
        with self.assertRaisesRegex(b.IntegrityStop,'STATUS_VALUE'):b.fit_preprocessor((bad,))

    def test_pooled_training_median_impute_then_population_scale(self):
        first=cell(cell(self.train[8],'talent',2), 'talent',4,side_name='away')
        second=cell(cell(self.train[9],'talent',6),'talent',None,'SOURCE_ROW_UNAVAILABLE','away')
        p=b.fit_preprocessor((first,second));s=p.columns[1]
        self.assertEqual((s.median,s.mean),(4,4))
        self.assertAlmostEqual(s.scale,math.sqrt(2))
        self.assertEqual(s.observed_states,frozenset(('SOURCE_ROW_UNAVAILABLE',)))
        encoded=b.encode(second,p)
        idx=b.column_names('F14').index('away.talent')
        self.assertEqual(encoded.values[idx],0)
        self.assertEqual(encoded.values[b.column_names('F14').index('away.talent.SOURCE_ROW_UNAVAILABLE')],1)
        self.assertIsNone(second.away.features[1].value)

    def test_constant_training_feature_scale_is_one(self):
        frames=tuple(cell(cell(f,'talent',5),'talent',5,side_name='away') for f in self.train)
        p=b.fit_preprocessor(frames)
        self.assertEqual((p.columns[1].median,p.columns[1].scale),(5,1))
        self.assertEqual(b.encode(frames[0],p).values[1],0)
        self.assertEqual(frames[0].home.features[1].value,5)

    def test_all_missing_training_feature_blocks_instead_of_dropping(self):
        frames=tuple(cell(cell(f,'talent',None,'SOURCE_ROW_UNAVAILABLE'),'talent',None,'SOURCE_ROW_UNAVAILABLE','away') for f in self.train)
        with self.assertRaisesRegex(b.IntegrityStop,'NO_AVAILABLE_TRAINING_VALUES:talent'):b.fit_preprocessor(frames)

    def test_matrix_names_flags_and_ablation_are_exact(self):
        self.assertEqual((len(b.column_names('F14')),len(b.column_names('F10')),len(b.column_names('B2'))),(141,101,11))
        f=self.val[0];a=b.encode(f,self.params,'F14');c=b.encode(f,self.params,'F10')
        mapping=dict(zip(b.column_names('F14'),a.values))
        self.assertEqual(c.values,tuple(mapping[n] for n in b.column_names('F10')))
        self.assertEqual((a.status,a.unseen_states),(c.status,c.unseen_states))
        self.assertTrue(all(x in (0,1) for x in a.values[28:]))

    def test_unseen_state_routes_whole_game_for_both_families(self):
        f=cell(self.val[0],'talent',None,'SOURCE_ROW_UNAVAILABLE',side_name='away')
        a=b.encode(f,self.params,'F14');c=b.encode(f,self.params,'F10')
        self.assertEqual(a.status,'HFA_FALLBACK_UNSEEN_STATE')
        self.assertEqual(a.unseen_states,(('away','talent','SOURCE_ROW_UNAVAILABLE'),))
        self.assertEqual((a.status,a.unseen_states),(c.status,c.unseen_states))
        self.assertEqual(b.encode(f,self.params,'B2').status,'MODEL')
        elo=cell(f,'elo',None,'SOURCE_ROW_UNAVAILABLE')
        self.assertEqual(b.encode(elo,self.params,'B2').status,'HFA_FALLBACK_UNSEEN_STATE')

    def test_new_joint_profile_is_diagnostic_not_a_fallback_rule(self):
        training=list(self.train)
        training[8]=cell(training[8],'talent',None,'SOURCE_ROW_UNAVAILABLE')
        training[9]=cell(training[9],'returningPercentPPA',None,'SOURCE_ROW_UNAVAILABLE')
        p=b.fit_preprocessor(training)
        val=cell(cell(self.val[0],'talent',None,'SOURCE_ROW_UNAVAILABLE'),'returningPercentPPA',None,'SOURCE_ROW_UNAVAILABLE')
        encoded=b.encode(val,p)
        self.assertTrue(encoded.novel_joint_profile)
        self.assertEqual(encoded.status,'MODEL')

    def test_validation_does_not_enter_transform_or_support_catalog(self):
        before=self.params
        future=cell(self.val[0],'talent',1e9)
        b.encode(future,before)
        missing=cell(self.val[1],'talent',None,'SOURCE_VALUE_INVALID')
        self.assertEqual(b.encode(missing,before).status,'HFA_FALLBACK_UNSEEN_STATE')
        self.assertEqual(before,b.fit_preprocessor(self.train))
        self.assertEqual(before.columns[1].median,207.5)
        self.assertNotIn(missing.game.game_id,before.training_ids)

    def test_training_on_exploratory_year_is_rejected(self):
        f=replace(self.train[8],game=replace(self.train[8].game,season=2024))
        with self.assertRaisesRegex(b.IntegrityStop,'TRAINING_SEASONS'):b.fit_preprocessor((f,))

    def test_seven_whole_week_folds_preserve_all_roles(self):
        plan=b.fold_plan(self.fold_frames)
        self.assertEqual((len(plan.folds),len(plan.warmup_ids),len(plan.population_ids)),(7,100,170))
        self.assertEqual([len(f.validation_ids) for f in plan.folds],[10]*7)
        self.assertEqual([len(f.training_ids) for f in plan.folds],[100,110,120,130,140,150,160])
        ids=[x for fold in plan.folds for x in fold.validation_ids]
        self.assertEqual(len(set(ids)),70)
        self.assertEqual(set(ids)|set(plan.warmup_ids),set(plan.population_ids))

    def test_fold_preparation_uses_only_earlier_training(self):
        fold=b.fold_plan(self.fold_frames).folds[0]
        p,train,val=b.prepare_fold(self.fold_frames,fold)
        self.assertEqual(p.training_ids,frozenset(fold.training_ids))
        self.assertEqual(len(train),100);self.assertEqual(len(val),10)
        self.assertTrue(p.training_ids.isdisjoint(x.game_id for x in val))

    def test_undeclared_overlap_empty_fold_or_late_kickoff_blocks(self):
        plan=b.fold_plan(self.fold_frames);fold=plan.folds[0]
        bad=b.Fold(fold.name,fold.training_ids,fold.validation_ids+(fold.training_ids[0],))
        with self.assertRaisesRegex(b.IntegrityStop,'OVERLAP'):b.fold_views(self.fold_frames,bad)
        forged=replace(fold,validation_ids=fold.validation_ids[:-1])
        with self.assertRaisesRegex(b.IntegrityStop,'NOT_DECLARED'):b.fold_views(self.fold_frames,forged)
        with self.assertRaisesRegex(b.IntegrityStop,'EMPTY_FOLD'):b.fold_plan(self.fold_frames[:100])
        changed=list(self.fold_frames);changed[0]=replace(changed[0],game=replace(changed[0].game,kickoff_utc='2022-12-31T00:00:00Z'))
        with self.assertRaisesRegex(b.IntegrityStop,'KICKOFF_ORDER'):b.fold_plan(changed)

    def test_fallback_uses_only_training_labels_and_group_means(self):
        labels=b.SyntheticLabels(self.train[0].fixture_id,tuple((f.game.game_id,2 if f.game.neutral else 6) for f in self.train))
        base=b.mean_baselines(self.train,labels)
        self.assertEqual((base.neutral_mean,base.nonneutral_mean),(2,6))
        with self.assertRaisesRegex(b.IntegrityStop,'LABEL_DENOMINATOR'):b.mean_baselines(self.train,fixtures.labels_for(self.frames))
        training=tuple(f for f in self.train if not f.game.neutral)
        base=b.mean_baselines(training,fixtures.labels_for(training))
        self.assertEqual(base.neutral_mean,base.global_mean)

    def routed(self):
        frames=(cell(self.val[0],'talent',None,'SOURCE_ROW_UNAVAILABLE'),self.val[1])
        encoded=tuple(b.encode(f,self.params) for f in frames)
        base=b.mean_baselines(self.train,fixtures.labels_for(self.train))
        values={x.game_id:3 for x in encoded if x.status=='MODEL'}
        return frames,encoded,values,base

    def test_full_rows_and_matching_fallback_values_are_preserved(self):
        frames,encoded,values,base=self.routed()
        pred=b.route_predictions(frames,encoded,values,base,self.params)
        e10=tuple(b.encode(f,self.params,'F10') for f in frames)
        p10=b.route_predictions(frames,e10,values,base,self.params)
        self.assertEqual(pred,p10)
        self.assertEqual(pred[0].status,'HFA_FALLBACK_UNSEEN_STATE')
        self.assertEqual(pred[0].value,base.neutral_mean if frames[0].game.neutral else base.nonneutral_mean)
        report=b.synthetic_metrics(frames,pred,fixtures.labels_for(frames))
        self.assertEqual((report['denominator'],report['native'],report['fallback']),(2,1,1))
        self.assertEqual(report['coverageStatus'],'SYNTHETIC_COVERAGE_LIMITED')

    def test_encoded_mask_tamper_or_wrong_baseline_training_ids_blocks(self):
        frames,encoded,values,base=self.routed()
        tampered=(replace(encoded[0],status='MODEL',unseen_states=()),encoded[1])
        with self.assertRaisesRegex(b.IntegrityStop,'MASK_CHANGED'):b.route_predictions(frames,tampered,values,base,self.params)
        with self.assertRaisesRegex(b.IntegrityStop,'TRAINING_SET'):b.route_predictions(frames,encoded,values,replace(base,training_ids=frozenset()),self.params)

    def test_missing_or_nonfinite_predictions_cannot_shrink_denominator(self):
        frames,encoded,values,base=self.routed()
        with self.assertRaisesRegex(b.IntegrityStop,'DENOMINATOR'):b.route_predictions(frames,encoded,{},base,self.params)
        bad={k:float('nan') for k in values}
        with self.assertRaisesRegex(b.IntegrityStop,'NONFINITE'):b.route_predictions(frames,encoded,bad,base,self.params)
        pred=b.route_predictions(frames,encoded,values,base,self.params)
        with self.assertRaisesRegex(b.IntegrityStop,'DENOMINATOR'):b.synthetic_metrics(frames,pred[:-1],fixtures.labels_for(frames))

    def test_metric_sign_and_full_population_arithmetic(self):
        frames=self.val[:2]
        pred=tuple(b.Prediction(f.game.game_id,0,'MODEL') for f in frames)
        labels=b.SyntheticLabels(frames[0].fixture_id,tuple((f.game.game_id,2) for f in frames))
        report=b.synthetic_metrics(frames,pred,labels)
        self.assertEqual((report['mae'],report['rmse'],report['biasPredictionMinusActual']),(2,2,-2))
        self.assertEqual(report['nativeCoverage'],1)

    def test_minimum_anchored_tie_rule_is_not_pairwise_sort(self):
        self.assertEqual(b.select_configuration([1+1.5e-6,1+.75e-6,1,2,3,4,5]),'RIDGE_10')
        self.assertEqual(b.select_configuration([1]*7),'RIDGE_100')
        for values in ([1]*6,[1,2,3,4,5,6,float('nan')],[True]*7):
            with self.assertRaises(b.IntegrityStop):b.select_configuration(values)

    def test_fixed_fit_budget_has_not_been_spent_by_arithmetic(self):
        self.assertEqual(sum(b.RESEARCH_FIT_PLAN),66)
        self.assertEqual(b.SYNTHETIC_FIT_CAP,4)
        source=Path(b.__file__).read_text()
        self.assertNotIn('import sklearn',source)
        self.assertNotIn('import numpy',source)
        self.assertNotIn('.fit(',source)

if __name__=='__main__':unittest.main()
