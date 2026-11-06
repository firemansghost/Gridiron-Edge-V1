"""Fit-free integration and leakage tests; all inputs fictional."""
from copy import deepcopy
from dataclasses import replace
import math
import unittest
import fold_kernel as k
import artificial_inputs as fixture
import rmm1_builder as reference


class Integration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows,cls.original,cls.ids=fixture.make()
        cls.expected=tuple(r['gameId'] for r in cls.rows)
        cls.counts={y:sum(r['season']==y for r in cls.rows) for y in (2022,2023,2024)}

    def ingest(self,rows=None):
        return k.ingest(self.rows if rows is None else rows,'fictional-integration-v1',self.expected,self.counts)

    def test_full_population_seven_folds_and_no_predictions(self):
        out=k.prepare_experiment(self.ingest())
        self.assertEqual(len(out['ledger']),180)
        self.assertEqual(len(out['foldPlan'].warmup_ids),100)
        self.assertEqual(len(out['views']),7)
        self.assertEqual(out['pooledOofSupport']['denominator'],70)
        self.assertEqual(out['exploratorySupport']['denominator'],10)
        self.assertFalse(out['targetsRead']);self.assertEqual(out['estimatorFits'],0)
        self.assertTrue(all(x['predictionStatus']=='NOT_RUN' for x in out['ledger']))

    def test_reference_parity_all_seven_folds_all_families(self):
        frames=self.ingest();dev=tuple(f for f in frames if f.game.season<2024)
        old=tuple(f for f in self.original if f.game.season<2024)
        for fold,prior in zip(k.fold_plan(dev).folds,reference.fold_plan(old).folds):
            self.assertEqual(fold.training_ids,tuple(self.ids[x] for x in prior.training_ids))
            self.assertEqual(fold.validation_ids,tuple(self.ids[x] for x in prior.validation_ids))
            for family,learner in (('F14','ridge'),('F14','tree'),('F10','ridge'),('F10','tree'),('B2','ridge')):
                params,train,val=k.prepare_fold(dev,fold,family,learner)
                op,ot,ov=reference.prepare_fold(old,prior,family,learner)
                self.assertEqual([(x.median,x.mean,x.scale,x.observed_states) for x in params.columns],[(x.median,x.mean,x.scale,x.observed_states) for x in op.columns])
                self.assertEqual([(x.values,x.status,x.unseen_states,x.novel_joint_profile) for x in train+val],[(x.values,x.status,x.unseen_states,x.novel_joint_profile) for x in ot+ov])

    def test_validation_extremes_never_change_training_statistics(self):
        before=self.ingest();fold=k.fold_plan(tuple(f for f in before if f.game.season<2024)).folds[0]
        rows=deepcopy(self.rows)
        for r in rows:
            if r['gameId'] in fold.validation_ids:
                for side in ('home','away'):r[side]['features']['talent']['value']=1e9
        after=self.ingest(rows)
        p,train,_=k.prepare_fold(tuple(f for f in before if f.game.season<2024),fold)
        q,other,_=k.prepare_fold(tuple(f for f in after if f.game.season<2024),fold)
        self.assertEqual(p,q);self.assertEqual(train,other)

    def test_exploratory_values_never_change_development(self):
        rows=deepcopy(self.rows)
        for r in rows:
            if r['season']==2024:r['home']['features']['elo']['value']=-999999
        a=k.prepare_experiment(self.ingest());b=k.prepare_experiment(self.ingest(rows))
        self.assertEqual(a['views'],b['views'])
        self.assertEqual(a['finalInputPreview']['preprocessor'],b['finalInputPreview']['preprocessor'])

    def test_unseen_state_f14_f10_common_mask_and_b2_independent(self):
        rows=fixture.missing(self.rows,100,'talent')
        out=k.prepare_experiment(self.ingest(rows));view=out['views'][0][1]
        for name in ('F14_ridge','F14_tree','F10_ridge','F10_tree'):
            self.assertEqual(view['matrices'][name]['evaluation'][0].status,'HFA_FALLBACK_UNSEEN_STATE')
        self.assertEqual(view['matrices']['B2_ridge']['evaluation'][0].status,'MODEL')
        self.assertEqual(view['matrices']['F14_ridge']['support']['denominator'],10)

    def test_component_only_unseen_gap_still_routes_f10(self):
        rows=deepcopy(self.rows);s=rows[100]['home'];a=s['formAudit']
        a['complete']-=1;a['incompleteGameIds']=[1];a['finiteComponentCounts']=[a['complete']]*4
        for key in k.FORM:s['features'][key].update(value=None,state='SOURCE_HISTORY_INCOMPLETE',n=a['complete'])
        out=k.prepare_experiment(self.ingest(rows));m=out['views'][0][1]['matrices']
        self.assertEqual(m['F10_ridge']['evaluation'][0].status,'HFA_FALLBACK_UNSEEN_STATE')
        self.assertEqual(m['B2_ridge']['evaluation'][0].status,'MODEL')

    def test_observed_individual_states_support_novel_joint_profile(self):
        rows=fixture.missing(self.rows,0,'talent')
        rows=fixture.missing(rows,1,'returningPercentPPA')
        rows=fixture.missing(rows,100,'talent')
        rows=fixture.missing(rows,100,'returningPercentPPA')
        m=k.prepare_experiment(self.ingest(rows))['views'][0][1]['matrices']['F14_ridge']['evaluation'][0]
        self.assertEqual(m.status,'MODEL');self.assertTrue(m.novel_joint_profile)

    def test_medians_side_pool_imputation_scaling_and_zero_variance(self):
        rows=deepcopy(self.rows)
        for r in rows:
            for side in ('home','away'):r[side]['features']['talent']['value']=0
        rows=fixture.missing(rows,0,'talent')
        frames=self.ingest(rows);p=k.fit_preprocessor(frames[:100])
        self.assertEqual((p.columns[1].median,p.columns[1].mean,p.columns[1].scale),(0,0,1))
        r=k.encode(frames[0],p);self.assertEqual(r.values[1],0)
        names=k.column_names('F14');self.assertEqual(r.values[names.index('home.talent.SOURCE_ROW_UNAVAILABLE')],1)
        self.assertEqual(frames[0].home.features[1].value,None)
        self.assertEqual(frames[1].home.features[1].value,0)

    def test_no_available_training_column_blocks(self):
        rows=deepcopy(self.rows)
        for i in range(100):
            for side in ('home','away'):rows[i][side]['features']['talent'].update(value=None,state='SOURCE_ROW_UNAVAILABLE')
        with self.assertRaisesRegex(k.IntegrityStop,'NO_AVAILABLE_TRAINING_VALUES:talent'):k.prepare_experiment(self.ingest(rows))

    def test_fixed_width_and_column_order(self):
        frames=self.ingest();p=k.fit_preprocessor(frames[:100])
        for family,width in (('F14',141),('F10',101),('B2',11)):
            vector=k.encode(frames[100],p,family)
            self.assertEqual(len(vector.values),width);self.assertEqual(len(k.column_names(family)),width)
            self.assertTrue(all(math.isfinite(v) for v in vector.values))
            self.assertEqual(k.column_names(family)[-1],'homeVenue')

    def test_90_percent_threshold_is_inclusive_no_deletion(self):
        rows=fixture.missing(self.rows,100,'talent')
        first=k.prepare_experiment(self.ingest(rows))['views'][0][1]['matrices']['F14_ridge']['support']
        self.assertEqual(first['native'],9);self.assertEqual(first['supportStatus'],'NATIVE_SUPPORT_AT_LEAST_90_PERCENT')
        rows=fixture.missing(rows,101,'talent')
        second=k.prepare_experiment(self.ingest(rows))['views'][0][1]['matrices']['F14_ridge']['support']
        self.assertEqual(second['denominator'],10);self.assertEqual(second['supportStatus'],'COVERAGE_LIMITED')

    def test_shared_week_games_retained_and_empty_history(self):
        rows,_,_=fixture.make(shared=True)
        frames=k.ingest(rows,'fictional-shared',tuple(r['gameId'] for r in rows),{y:sum(r['season']==y for r in rows) for y in (2022,2023,2024)})
        self.assertEqual(len(frames),181)
        pair=[f for f in frames if f.game.season==2022 and f.game.week==1 and f.game.home=='SYNTEAM-000']
        self.assertEqual(len(pair),2)
        self.assertNotEqual(pair[0].game.kickoff_utc,pair[1].game.kickoff_utc)
        for frame in pair:self.assertEqual(frame.home.features[8].state,'NO_PRIOR_FBS_GAMES')
        later=next(f for f in frames if f.game.season==2022 and f.game.week==2 and f.game.home=='SYNTEAM-000')
        self.assertEqual(later.home.audit.expected,2)

    def test_integrity_negatives(self):
        cases=[]
        x=deepcopy(self.rows);x[0]['gameId']=x[1]['gameId'];cases.append(x)
        x=deepcopy(self.rows);x[0]['season']=2025;cases.append(x)
        x=deepcopy(self.rows);x[0]['home']['features'].pop('elo');cases.append(x)
        x=deepcopy(self.rows);x[0]['home']['features']['elo']['value']=True;cases.append(x)
        x=deepcopy(self.rows);x[0]['home']['features']['elo']['value']=float('nan');cases.append(x)
        x=deepcopy(self.rows);x[0]['home']['features']['elo']['state']='SOURCE_ROW_UNAVAILABLE';cases.append(x)
        x=deepcopy(self.rows);x[0]['home']['team']='Wrong';cases.append(x)
        x=deepcopy(self.rows);x[0]['neutralSite']=1;cases.append(x)
        x=deepcopy(self.rows);x[100]['home']['formAudit']['expected']+=1;cases.append(x)
        x=deepcopy(self.rows);x[100]['home']['features']['ppaNet']['value']+=1;cases.append(x)
        x=deepcopy(self.rows);x[0]['target']=42;cases.append(x)
        for rows in cases:
            with self.subTest(case=cases.index(rows)):
                with self.assertRaises(k.IntegrityStop):self.ingest(rows)

    def test_exact_manifest_and_future_training_refused(self):
        with self.assertRaises(k.IntegrityStop):k.ingest(self.rows,'fictional',self.expected[:-1],self.counts)
        with self.assertRaises(k.IntegrityStop):k.ingest(self.rows,'fictional',self.expected,{2022:1,2023:1,2024:1})
        frames=self.ingest()
        with self.assertRaises(k.IntegrityStop):k.fit_preprocessor(frames)
        with self.assertRaises(k.IntegrityStop):k.prepare_view(frames[:100],frames[:10])

    def test_bad_fold_size_and_chronology_block_globally(self):
        frames=self.ingest();dev=tuple(f for f in frames if f.game.season<2024)
        with self.assertRaises(k.IntegrityStop):k.fold_plan(dev[1:])
        changed=list(dev);changed[0]=replace(changed[0],game=replace(changed[0].game,kickoff_utc='2022-12-31T00:00:00Z'))
        with self.assertRaises(k.IntegrityStop):k.fold_plan(changed)

    def test_legacy_controls_opaque_and_input_unchanged(self):
        rows=deepcopy(self.rows);before=deepcopy(rows)
        first=k.prepare_experiment(self.ingest(rows));self.assertEqual(rows,before)
        for r in rows:
            for side in ('home','away'):r[side]['legacyControls']={'poisonedIgnored':'never a predictor'}
        self.assertEqual(first,k.prepare_experiment(self.ingest(rows)))
