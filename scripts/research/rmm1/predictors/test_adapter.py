"""Artificial-only integration and adversarial tests; unittest uses no real paths."""
import copy
import hashlib
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
import warnings
from unittest.mock import patch
import zipfile

from selective_json import Projector, ProjectionStop, scalar, obj, array
from read_plan_spec import plan, PROJECTIONS
from archive_reader import read_archive
from real_adapter import normalize, AdapterStop, F14
from artificial_legacy import fixture


def project_fixture():
    return {k:Projector(json.dumps(v).encode()).project(PROJECTIONS[k])[0] for k,v in fixture().items()}


def build(data):
    return normalize(data, {2022:3,2023:3,2024:3}, {2022:2,2023:2,2024:2})


class ProjectionTests(unittest.TestCase):
    def test_forbidden_values_never_decoded(self):
        body = b'{"keep":7,"targets":{"score":1e99999,"text":"DO_NOT_DECODE"},"modelInputs":[false,null,9]}'
        original = json.loads
        def only_strings(s, *a, **k):
            self.assertTrue(s.startswith('"'))
            self.assertNotIn('DO_NOT_DECODE',s)
            return original(s,*a,**k)
        with patch('selective_json.json.loads',side_effect=only_strings):
            data,audit = Projector(body).project(obj({'keep':scalar()}))
        self.assertEqual(data, {'keep':7})
        self.assertEqual(audit['skippedScalarsNotMaterialized'],5)
        self.assertEqual(audit['selectedPathPatterns'],{'$.keep':1})

    def test_global_malformed_and_duplicate_rejected(self):
        for raw in (b'{"keep":1,"x":{"a":1,"a":2}}', b'{"keep":1,"x":{"a":1,"\\u0061":2}}', b'{"keep":1,"x":[1,]}', b'{"keep":1,"x":"\\x"}', b'{"keep":1,"x":NaN}', b'{"keep":1,"x":01}', b'{"keep":1} {}', b'{"keep":1,"x":"\\uZZZZ"}', b'{"keep":1,"x":"bad\n"}'):
            with self.subTest(raw=raw), self.assertRaises(ProjectionStop):
                Projector(raw).project(obj({'keep':scalar()}))

    def test_required_types_and_limits(self):
        cases = [(b'{}',obj({'x':scalar()})),(b'{"x":[]}',obj({'x':scalar()})),(b'null',array(scalar())), (b'\xff',scalar())]
        for body,spec in cases:
            with self.subTest(body=body),self.assertRaises(ProjectionStop):
                Projector(body).project(spec)
        with self.assertRaisesRegex(ProjectionStop,'COMPLEXITY'):
            Projector(b'[[[1]]]',max_depth=1).project(None)
        with self.assertRaisesRegex(ProjectionStop,'COMPLEXITY'):
            Projector(b'[1,2]',max_nodes=2).project(None)

    def test_json_scalar_and_escape_differential(self):
        for v in (None,True,False,1,-12,1e-14,1e20,'a"\\\n\u263a', ['x',-3,None]):
            body = json.dumps(v).encode()
            spec = array(scalar()) if type(v) is list else scalar()
            self.assertEqual(Projector(body).project(spec)[0],json.loads(body))


class ArchiveTests(unittest.TestCase):
    def make(self,entries):
        output=io.BytesIO()
        with warnings.catch_warnings(),zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
            warnings.filterwarnings('ignore',message="Duplicate name: 'safe.json'",category=UserWarning)
            for name,value in entries:
                z.writestr(name,value)
        return output.getvalue()

    def read(self,body,members=None,limits=None):
        members = members or [{'alias':'approved','member':'safe.json','bytes':7,'sha256':hashlib.sha256(b'{"x":3}').hexdigest(),'projection':obj({'x':scalar()})}]
        with tempfile.TemporaryDirectory(prefix='rmm1-fabricated-') as directory:
            p=Path(directory)/'artificial.zip';p.write_bytes(body)
            return read_archive(p,{'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()},members,limits or plan())

    def test_only_approved_member_decompressed(self):
        body = self.make([('safe.json',b'{"x":3}'),('targets.json',b'NOT JSON DO NOT OPEN')])
        original = zipfile.ZipFile.open
        calls=[]
        def observe(z,member,*args,**kwargs):
            calls.append(member.filename if isinstance(member,zipfile.ZipInfo) else member)
            return original(z,member,*args,**kwargs)
        with patch.object(zipfile.ZipFile,'open',observe):
            data,audit=self.read(body)
        self.assertEqual(data,{'approved':{'x':3}})
        self.assertEqual(calls,['safe.json'])
        self.assertEqual(audit['decompressedMembers'],['safe.json'])

    def test_catalog_tricks_block_before_any_decompression(self):
        link=zipfile.ZipInfo('link');link.create_system=3;link.external_attr=(stat.S_IFLNK|0o777)<<16
        cases=[('../bad',b'x'),('/abs',b'x'),('C:/bad',b'x'),('a\\b',b'x'),('a//b',b'x'),('a/./b',b'x'),(link,b'x'),('safe.json',b'OTHER')]
        for entry in cases:
            # Windows ZipInfo normalizes backslashes while writing; inject the
            # adversarial filename into both headers after making a valid ZIP.
            body=self.make([('safe.json',b'{"x":3}'),('a/b',entry[1]) if entry[0]=='a\\b' else entry])
            if entry[0]=='a\\b':body=body.replace(b'a/b',b'a\\b')
            with self.subTest(entry=entry[0]),patch.object(zipfile.ZipFile,'open',side_effect=AssertionError('unexpected decompression')),self.assertRaises(ProjectionStop):
                self.read(body)

    def test_size_and_hash_failures(self):
        body=self.make([('safe.json',b'{"x":3}')])
        for policy in ({'maxCatalogMembers':0},{'maxMemberBytes':1},{'maxTotalUncompressedBytes':1}):
            with self.subTest(policy=policy),self.assertRaises(ProjectionStop):
                self.read(body,limits={**plan(),**policy})
        bad=[{'alias':'approved','member':'safe.json','bytes':7,'sha256':'0'*64,'projection':obj({'x':scalar()})}]
        with self.assertRaisesRegex(ProjectionStop,'MEMBER_HASH'):
            self.read(body,members=bad)
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'fake.zip';p.write_bytes(body)
            with self.assertRaisesRegex(ProjectionStop,'ARCHIVE_HASH'):
                read_archive(p,{'bytes':len(body),'sha256':'0'*64},bad,plan())

    def test_all_seven_schemas_zip_to_raw_f14(self):
        raw=fixture(); entries=[];members=[]
        for alias,rows in raw.items():
            payload=json.dumps(rows).encode();name=alias+'.json'
            entries.append((name,payload))
            members.append({'alias':alias,'member':name,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'projection':PROJECTIONS[alias]})
        projected,audit=self.read(self.make(entries+[('outcomes.json',b'FORBIDDEN')]),members)
        rows,report=build(projected)
        self.assertEqual(len(rows),9)
        self.assertEqual(len(audit['decompressedMembers']),7)
        self.assertEqual(report['fits'],0)
        self.assertEqual(tuple(rows[-1]['home']['features']),F14)
        self.assertEqual(rows[-1]['home']['features']['ppaOffMean']['value'],3)
        self.assertAlmostEqual(rows[-1]['home']['features']['successNet']['value'],.4)
        self.assertEqual(rows[0]['home']['features']['ppaOffMean']['state'],'NO_PRIOR_FBS_GAMES')
        self.assertIsNone(rows[0]['home']['features']['ppaOffMean']['value'])
        self.assertIsNone(rows[0]['home']['legacyControls']['ppaNet']['n'])
        self.assertEqual(rows[-1]['home']['features']['ppaOffMean']['n'],2)
        self.assertEqual(rows[-1]['home']['team'],'Fictional Academy')
        self.assertEqual(rows[-1]['gameId'],202403)
        self.assertNotIn('standardized',projected['exploratory_legacy_predictive'][0]['home'])
        self.assertNotIn('homePpaRowIds',projected['development_eligibility'][0])


class AdapterTests(unittest.TestCase):
    def rejects(self,mutate,code):
        data=project_fixture();mutate(data)
        with self.assertRaisesRegex(AdapterStop,code):build(data)

    def test_identity_and_population_fail_closed(self):
        changes=[(lambda d:d['development_frames'][0].update(gameId=True),'ID_OR_WEEK'),
                 (lambda d:d['development_frames'][0].update(season=2025),'SEASON'),
                 (lambda d:d['development_frames'].pop(),'DENOMINATOR'),
                 (lambda d:d['development_frames'].append(copy.deepcopy(d['development_frames'][0])),'DUPLICATE'),
                 (lambda d:d['development_frames'][0].update(neutralSite=1),'VENUE'),
                 (lambda d:d['development_advanced'][0]['row'].update(team='Wrong team'),'WRAPPER'),
                 (lambda d:d['development_static'][0]['talent']['row'].update(year=2021),'STATIC_SOURCE'),
                 (lambda d:d['development_frames'][0]['homeElo'].update(sourceRequestId='elo-week-01'),'ELO_TIMING'),
                 (lambda d:d['development_frames'][0]['homeElo'].update(value=1600),'ELO_WRAPPER'),
                 (lambda d:d['development_eligibility'][1]['homeAdvancedRowIds'].append('not-a-ref'),'REF_UNRESOLVED'),
                 (lambda d:d['exploratory_legacy_predictive'][0]['home']['features']['talent'].update(value=None,status='FIELD_VALUE_UNAVAILABLE'),'RAW_REASON_UNRESOLVED'),
                 (lambda d:d['exploratory_legacy_predictive'][1]['home']['formAudit']['sourceProvenanceCounts'].update(BULK_ADVANCED_WEEK_SCOPED_RECOVERY=1),'RECOVERY'),
                 (lambda d:d['development_legacy_features'][1]['home']['ppaOffMean'].update(value=999),'PARTIAL_MEAN')]
        for mutation,code in changes:
            with self.subTest(code=code):self.rejects(mutation,code)

    def test_any_invalid_component_nulls_all_six_without_partial_means(self):
        data=project_fixture()
        data['development_advanced'][0]['row']['offense']['ppa']=None
        data['development_legacy_features'][1]['home']['ppaOffMean'].update(value=None,status='FIELD_VALUE_UNAVAILABLE',n=0)
        data['development_legacy_features'][1]['home']['ppaNet'].update(value=None,status='FIELD_VALUE_UNAVAILABLE')
        data['development_legacy_features'][2]['home']['ppaOffMean'].update(value=4,n=1)
        data['development_legacy_features'][2]['home']['ppaNet'].update(value=2)
        rows,report=build(data)
        for i in (1,2):
            features=rows[i]['home']['features']
            for key in F14[8:]:
                self.assertEqual(features[key]['state'],'SOURCE_HISTORY_INCOMPLETE')
                self.assertIsNone(features[key]['value'])
            self.assertEqual(features['priorFbsGames']['value'],i)
            self.assertEqual(features['ppaOffMean']['n'],i-1)
        self.assertEqual(rows[2]['home']['formAudit']['finiteComponentCounts'],[1,2,2,2])
        self.assertTrue(report['legacyPolicyDifferences'])

    def test_missing_bulk_row_preserves_denominator(self):
        data=project_fixture();data['exploratory_advanced'].pop(0)
        for row in data['exploratory_legacy_predictive'][1:]:
            side=row['home'];n=row['week']-1
            side['formAudit'].update(observedAdvancedGames=n-1,missingAdvancedGames=1,missingPriorGameIds=[202401])
            side['formAudit']['sourceProvenanceCounts']['BULK_ADVANCED_FULL_SEASON_PRIMARY']=n-1
            for key in ('ppaNet','successNet'):
                side['features'][key].update(value=None,status='SOURCE_HISTORY_INCOMPLETE',n=n-1)
        rows,_=build(data)
        self.assertEqual(len(rows),9)
        self.assertEqual(rows[-1]['home']['features']['ppaNet']['state'],'SOURCE_HISTORY_INCOMPLETE')
        self.assertEqual(rows[-1]['home']['formAudit']['missingRowGameIds'],[202401])

    def test_source_gap_reason_kept_and_null_not_zero(self):
        data=project_fixture()
        data['development_static'][0]['talent']['row']['talent']=None
        for row in data['development_legacy_features'][:3]:
            row['home']['talentRaw'].update(value=None,status='FIELD_VALUE_UNAVAILABLE',n=0)
        rows,_=build(data)
        self.assertEqual(rows[0]['home']['features']['talent']['state'],'SOURCE_ROW_UNAVAILABLE')
        self.assertIsNone(rows[0]['home']['features']['talent']['value'])
        self.assertEqual(rows[0]['home']['features']['priorFbsGames']['value'],0)

    def test_invalid_present_2024_row_counts_as_missing_in_legacy_audit(self):
        data=project_fixture()
        data['exploratory_advanced'][0]['offense']['ppa']=None
        for row in data['exploratory_legacy_predictive'][1:]:
            side=row['home'];n=row['week']-1
            side['formAudit'].update(observedAdvancedGames=n-1,missingAdvancedGames=1,missingPriorGameIds=[202401])
            side['formAudit']['sourceProvenanceCounts']['BULK_ADVANCED_FULL_SEASON_PRIMARY']=n-1
            for key in ('ppaNet','successNet'):
                side['features'][key].update(value=None,status='SOURCE_HISTORY_INCOMPLETE',n=n-1)
        rows,_=build(data)
        self.assertEqual(rows[-1]['home']['formAudit']['missingRowGameIds'],[])
        self.assertEqual(rows[-1]['home']['formAudit']['incompleteGameIds'],[202401])
        self.assertEqual(rows[-1]['home']['features']['successNet']['n'],1)
        data['exploratory_legacy_predictive'][1]['home']['features']['ppaNet'].update(value=999,status='AVAILABLE')
        with self.assertRaisesRegex(AdapterStop,'V3_NET_STATE'):
            build(data)

    def test_lower_week_must_also_have_earlier_kickoff(self):
        data=project_fixture()
        data['development_frames'][0]['startDate']='2022-10-01T18:00:00Z'
        data['development_legacy_features'][0]['startDate']='2022-10-01T18:00:00Z'
        with self.assertRaisesRegex(AdapterStop,'KICKOFF_NOT_PRIOR'):build(data)

    def test_no_inplace_changes_and_repeat_is_identical(self):
        data=project_fixture();before=copy.deepcopy(data)
        self.assertEqual(build(data),build(data));self.assertEqual(data,before)

    def test_control_counts_and_partial_history_cannot_hide_corruption(self):
        for alias,side,key,n in (('development_legacy_features','home','ppaOffMean',0),('development_legacy_features','home','ppaNet',1),('development_legacy_features','away','priorFbsGames',0),('development_legacy_features','away','talentRaw',0),('exploratory_legacy_predictive','home','ppaNet',0)):
            data=project_fixture();row=data[alias][1][side]
            if alias=='exploratory_legacy_predictive':row=row['features']
            row[key]['n']=n
            with self.subTest(alias=alias,key=key),self.assertRaises(AdapterStop):build(data)
        data=project_fixture();data['development_advanced'][0]['row']['offense']['ppa']=None
        with self.assertRaisesRegex(AdapterStop,'COMPONENT_COUNT_OR_STATE'):
            build(data)

    def test_invalid_numeric_source_and_noncanonical_exclusion(self):
        data=project_fixture()
        data['development_static'][0]['talent']['row']['talent']='not numeric'
        for row in data['development_legacy_features'][:3]:
            row['home']['talentRaw'].update(value=None,status='FIELD_VALUE_UNAVAILABLE',n=0)
        extra=copy.deepcopy(data['exploratory_advanced'][0]);extra.update(gameId=999999,opponent='Fictional FCS')
        data['exploratory_advanced'].append(extra)
        rows,report=build(data)
        self.assertEqual(rows[0]['home']['features']['talent']['state'],'SOURCE_VALUE_INVALID')
        self.assertEqual(report['excludedNoncanonicalAdvancedRows'],1)
        self.assertEqual(rows[-1]['home']['features']['ppaOffMean']['value'],3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
