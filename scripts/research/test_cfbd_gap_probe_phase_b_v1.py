import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import urllib.parse
import cfbd_gap_probe_phase_b_v1 as probe

SHA='a'*40
KEY='fixture-key-never-a-real-secret'

class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.out=Path(self.temp.name)/'new'
        self.calls=[]

    def response(self,url,key):
        self.calls.append(url)
        spec=next(s for s in probe.REQUESTS if probe.request_url(s)==url)
        rows=[{'year':2025,'team':t,spec['field']:0} for t in spec['targets']]
        return 200,json.dumps(rows).encode(),'application/json'

    def run_fetch(self,fetch=None,**overrides):
        opts=dict(mode='FETCH',out=self.out,source_sha=SHA,expected_plan=probe.plan_sha(),confirmation=probe.CONFIRMATION,key=KEY,fetch=fetch or self.response)
        opts.update(overrides)
        return probe.execute(**opts)

    def test_plan_has_zero_network_and_no_key(self):
        result=probe.execute('PLAN',self.out,SHA,fetch=lambda *_:self.fail('network'))
        self.assertEqual(result['providerCallsAttempted'],0)
        self.assertEqual(result['outcome'],'PLAN_ONLY')
        self.assertEqual(len(json.loads((self.out/'request-plan.json').read_text())['requests']),2)
        self.assertFalse((self.out/'raw').exists())

    def test_exact_query_population(self):
        got=[(s['path'],s['query']) for s in probe.REQUESTS]
        expected=[('/talent',{'year':2025}),('/ratings/elo',{'year':2025,'seasonType':'regular','preseason':True})]
        self.assertEqual(got,expected)
        self.assertEqual(probe.request_url(probe.REQUESTS[1]),probe.BASE+'/ratings/elo?preseason=true&seasonType=regular&year=2025')
        self.assertNotIn('week',probe.REQUESTS[1]['query'])

    def test_fetch_all_two_and_exact_raw_evidence(self):
        result=self.run_fetch()
        self.assertEqual(result['outcome'],'COMPLETE_ALL_TARGETS_AVAILABLE')
        self.assertEqual(len(self.calls),2)
        self.assertEqual(result['providerResponsesReceived'],2)
        self.assertEqual(len(list((self.out/'raw').glob('*.body'))),2)
        for item in result['requests']:
            body=(self.out/item['rawFile']).read_bytes()
            self.assertEqual(hashlib.sha256(body).hexdigest(),item['rawSha256'])
            self.assertEqual(len(body),item['rawBytes'])
            self.assertNotIn(KEY,item['url'])
            self.assertLessEqual(item['requestStartedAt'],item['responseReceivedAt'])
        self.assertNotIn(KEY,(self.out/'report.json').read_text())
        self.assertEqual(len((self.out/'progress.jsonl').read_text().splitlines()),4)
        self.assertEqual(result['notAttemptedRequestIds'],[])

    def test_fetch_guards_reject_before_network_or_output(self):
        for overrides in [{'expected_plan':'0'*64},{'confirmation':'wrong'},{'key':''},{'source_sha':'bad'}]:
            with self.subTest(overrides=overrides),self.assertRaises(ValueError):
                self.run_fetch(**overrides)
            self.assertFalse(self.out.exists())
        self.assertEqual(self.calls,[])

    def test_existing_output_is_not_overwritten(self):
        self.out.mkdir();(self.out/'sentinel').write_text('immutable')
        with self.assertRaises(FileExistsError):self.run_fetch()
        self.assertEqual((self.out/'sentinel').read_text(),'immutable')
        self.assertEqual(self.calls,[])

    def test_http_failure_stops_without_retry_and_preserves_body(self):
        result=self.run_fetch(fetch=lambda *_:(429,b'{"error":"rate limit"}','application/json'))
        self.assertEqual(result['outcome'],'FETCH_FAILED')
        self.assertEqual(result['providerCallsAttempted'],1)
        self.assertEqual(len(result['notAttemptedRequestIds']),1)
        self.assertEqual((self.out/result['requests'][0]['rawFile']).read_bytes(),b'{"error":"rate limit"}')
        self.assertEqual(len((self.out/'progress.jsonl').read_text().splitlines()),2)

    def test_transport_failure_is_sanitized_and_fail_fast(self):
        def fail(*_):raise RuntimeError(KEY+' arbitrary transport error')
        result=self.run_fetch(fetch=fail)
        self.assertEqual(result['providerCallsAttempted'],1)
        self.assertEqual(result['requests'][0]['error'],'TRANSPORT_OR_RESPONSE_PARSE_FAILURE')
        self.assertNotIn(KEY,(self.out/'report.json').read_text())

    def test_secret_reflection_is_not_persisted(self):
        result=self.run_fetch(fetch=lambda *_:(401,KEY.encode(),'text/plain'))
        self.assertEqual(result['requests'][0]['error'],'SECRET_REFLECTION_REJECTED')
        self.assertEqual(list((self.out/'raw').iterdir()),[])

    def test_missing_records_remain_missing(self):
        result=self.run_fetch(fetch=lambda *_:(200,b'[]','application/json'))
        self.assertEqual(result['outcome'],'COMPLETE_WITH_GAPS')
        self.assertTrue(all(t['status']=='NOT_FOUND' and t['rows']==[] for r in result['requests'] for t in r['targets']))

    def test_duplicate_and_nonfinite_are_not_available(self):
        for spec in probe.REQUESTS:
            for value in [None,True,float('inf'),float('nan'),'10']:
                rows=[{'year':2025,'team':spec['targets'][0],spec['field']:value}]
                self.assertEqual(probe.inspect_response(spec,rows)['targets'][0]['status'],'INVALID_OR_INCOMPLETE')
            rows=[{'year':2025,'team':spec['targets'][0],spec['field']:12}]*2
            self.assertEqual(probe.inspect_response(spec,rows)['targets'][0]['status'],'INVALID_OR_INCOMPLETE')

    def test_wrong_year_and_nonarray_are_response_failures(self):
        spec=probe.REQUESTS[-1]
        for bad in [[{'year':2024,'team':'UNLV','elo':1500}],{'rows':[]}]:
            with self.assertRaises(ValueError):probe.inspect_response(spec,bad)

    def test_elo_explicit_wrong_timing_is_rejected(self):
        spec=probe.REQUESTS[-1]
        for extra in [{'week':1},{'preseason':False},{'seasonType':'postseason'}]:
            with self.assertRaises(ValueError):probe.inspect_response(spec,[{'year':2025,'team':'UNLV','elo':1500,**extra}])

    def test_json_nonfinite_fails_and_preserves_raw(self):
        result=self.run_fetch(fetch=lambda *_:(200,b'[NaN]','application/json'))
        self.assertEqual(result['requests'][0]['error'],'NONFINITE_JSON')
        self.assertEqual(result['providerCallsAttempted'],1)
        self.assertEqual((self.out/result['requests'][0]['rawFile']).read_bytes(),b'[NaN]')

    def test_redirects_are_disabled(self):
        self.assertIsNone(probe.NoRedirect().redirect_request(None,None,302,'redirect',{},'https://other.invalid'))

    def test_source_guard_rejects_wrong_ref_repo_event_and_sha(self):
        good={'GITHUB_REPOSITORY':'firemansghost/Gridiron-Edge-V1','GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch'}
        with mock.patch.dict(probe.os.environ,good,clear=True),mock.patch.object(probe.subprocess,'check_output',return_value=SHA+'\n'):
            self.assertEqual(probe.source_guard(SHA),SHA)
            with self.assertRaises(ValueError):probe.source_guard('b'*40)
        for key,value in [('GITHUB_REF','refs/heads/other'),('GITHUB_REPOSITORY','other/repo'),('GITHUB_EVENT_NAME','pull_request')]:
            with mock.patch.dict(probe.os.environ,{**good,key:value},clear=True),mock.patch.object(probe.subprocess,'check_output') as git:
                with self.assertRaises(ValueError):probe.source_guard(SHA)
                git.assert_not_called()

if __name__=='__main__':unittest.main()
