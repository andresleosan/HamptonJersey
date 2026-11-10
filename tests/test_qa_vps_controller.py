import importlib.util
from pathlib import Path
import sys
import unittest
from unittest import mock
import subprocess
import json

ROOT=Path(__file__).resolve().parents[1]


class ControllerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder=ROOT/'docs/qa/vps-runner'
        s=importlib.util.spec_from_file_location('qa_vps_controller',folder/'controller.py');cls.c=importlib.util.module_from_spec(s);s.loader.exec_module(cls.c)

    def test_wrong_source_blocks_before_identity(self):
        with mock.patch.object(self.c,'preflight'),mock.patch.object(self.c.rt,'load_identity') as values:
            result=self.c.execute_job({'source_sha':'b'*40},'hermes1',{'source_sha':'a'*40},{})
            self.assertEqual(result['status'],'blocked');values.assert_not_called()

    def test_timeout_stops_only_pinned_QA_runner_and_latches_uncertainty(self):
        job={'id':'a'*32,'source_sha':'b'*40,'suite':'smoke','task':'SPR-02'}
        receipt={'container_ids':{'runner':'c'*64}}
        credentials={'accessClientId':'x'*20,'accessClientSecret':'y'*20,'sessionSecret':'d'*64}
        with mock.patch.object(self.c,'preflight'),mock.patch.object(self.c.rt,'load_identity',return_value=credentials),mock.patch.object(self.c.subprocess,'run',side_effect=subprocess.TimeoutExpired('docker',1800)),mock.patch.object(self.c,'stop_runner') as stop:
            with self.assertRaises(self.c.contract.ExecutionUncertain):self.c.execute_job(job,'hermes1',{'source_sha':'b'*40,'build_id':'e'*64},receipt)
            stop.assert_called_once_with(receipt)
        self.assertEqual(credentials,{})

    def test_public_evidence_omits_raw_browser_text_and_values(self):
        raw={'credentials_removed':True,'passed':False,'runId':'run-hermes1-'+('a'*32),'build_id':'b'*64,'suite':'smoke',
             'api':{'checks':[{'case':'api-case','passed':True,'mode':'qa-app','data':'PRIVATE-MUST-NOT-COPY'}],'cleanup':{'errors':[]}},
             'ui':{'checks':[{'case':'ui-case','passed':False,'failure':'browser-error','console':'PRIVATE-MUST-NOT-COPY'}]},
             'network':{'off_origin_attempts':0,'redirects':0,'transport_failures':1},'token':'PRIVATE-MUST-NOT-COPY'}
        result=self.c.safe_evidence(raw,{'suite':'smoke','task':'SPR-02'},'hermes1',{})
        self.assertNotIn('PRIVATE',json.dumps(result));self.assertEqual(result['ui'][0]['passed'],False)

    def test_work_requires_real_service_cgroup_and_invocation(self):
        self.c.require_supervisor('0::/system.slice/hampton-qa-queue.service','a'*32)
        for cgroup,identifier in [('0::/user.slice/session.scope','a'*32),('0::/system.slice/hampton-qa-queue.service',None),('0::/system.slice/hampton-qa-queue.service','invalid')]:
            with self.subTest(cgroup=cgroup,identifier=identifier):
                with self.assertRaises(self.c.rt.CheckError):self.c.require_supervisor(cgroup,identifier)


if __name__=='__main__':unittest.main()
