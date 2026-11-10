import importlib.util
import json
from pathlib import Path
import unittest
import copy

ROOT=Path(__file__).resolve().parents[1]


class RuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        s=importlib.util.spec_from_file_location('qa_vps_runtime',ROOT/'docs/qa/vps-runner/runtime.py')
        cls.runtime=importlib.util.module_from_spec(s);s.loader.exec_module(cls.runtime)

    def test_wrong_daemon_fails_before_container_inspection(self):
        with self.assertRaises(self.runtime.CheckError):self.runtime.validate_runtime({'endpoint':'tcp://outside.invalid:2375'}, {}, {}, {})

    def test_private_input_rejects_extra_fields_or_bad_formats(self):
        v={'accessClientId':'x'*20,'accessClientSecret':'y'*20,'sessionSecret':'a'*64}
        self.assertEqual(self.runtime.validate_credentials(v),v)
        for change in [{'url':'https://other.invalid'},{'sessionSecret':'short'},{'accessClientSecret':'newline\n'+('z'*20)}]:
            with self.subTest(change=list(change)):
                with self.assertRaises(self.runtime.CheckError):self.runtime.validate_credentials({**v,**change})

    def test_wrong_manifest_hash_rejected_before_files(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'manifest.json';p.write_text('{}')
            with self.assertRaises(self.runtime.CheckError):self.runtime.load_manifest(Path(d),'a'*64)

    def fixture(self):
        # Reuse the independent E1 snapshot fixture, then substitute only Linux deployment paths.
        s=importlib.util.spec_from_file_location('original_host_tests',ROOT/'tests/test_full_app_qa_runner_host.py')
        m=importlib.util.module_from_spec(s);s.loader.exec_module(m);fixture=m.HostLauncherTests();fixture.setUp()
        snapshot,old,correction,receipt,seccomp=fixture.runtime_fixture(ROOT)
        compose=json.loads((ROOT/'docs/qa/vps-runner/compose.json').read_text())
        expected={'container_ids':receipt['container_ids_after_E1'],'image_ids':{k:v['Image'] for k,v in snapshot['containers'].items()},'network_ids':correction['existing_networks'],'manifest_sha256':'f'*64}
        snapshot['endpoint']=self.runtime.ENDPOINT
        for role,item in snapshot['containers'].items():
            item['Config']['Approval']='f'*64
            item['HostConfig']['Ulimits']=[{'Name':'core','Soft':0,'Hard':0}]
            item['Networks']=item.pop('NetworkSettings')['Networks']
            for mount in item['Mounts']:
                suffix={'/work':'runner-package','/results':'results','/policy':'egress-package'}[mount['Destination']]
                mount['Source']='/var/lib/hampton-qa/runtime/'+suffix
        return snapshot,compose,expected,seccomp

    def test_exact_Linux_runtime_and_image_config_digest(self):
        data,compose,receipt,seccomp=self.fixture()
        data['containers']['runner']['Image']='sha256:'+'a'*64;receipt['image_ids']['runner']='sha256:'+'a'*64
        self.runtime.validate_runtime(data,compose,receipt,seccomp)

    def test_unsafe_runtime_variants_fail_closed(self):
        data,compose,receipt,seccomp=self.fixture()
        changes=[lambda d:d['containers']['runner']['HostConfig'].update(Privileged=True),
            lambda d:d['containers']['runner']['HostConfig'].update(ReadonlyRootfs=False),
            lambda d:d['containers']['runner']['Config'].update(User='0:0'),
            lambda d:d['containers']['runner']['HostConfig'].update(CapAdd=['SYS_ADMIN']),
            lambda d:d['containers']['runner']['Mounts'][0].update(Source='/root'),
            lambda d:d['containers']['runner']['Mounts'][0].update(RW=True),
            lambda d:d['containers']['runner']['Networks'].update(extra={}),
            lambda d:d['networks']['hampton-app-qa-internal'].update(Internal=False),
            lambda d:d['networks']['hampton-app-qa-internal']['Containers'].update(extra={}),
            lambda d:d['networks']['hampton-app-qa-internal'].update(Options={}),
            lambda d:d['containers']['egress']['State']['Health'].update(Status='unhealthy')]
        for i,change in enumerate(changes):
            with self.subTest(case=i):
                altered=copy.deepcopy(data);change(altered)
                with self.assertRaises(self.runtime.CheckError):self.runtime.validate_runtime(altered,compose,receipt,seccomp)


if __name__=='__main__':unittest.main()
