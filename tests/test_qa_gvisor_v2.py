import importlib.util,json,os,runpy,sys,tempfile,unittest
from pathlib import Path
from unittest import mock
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'docs/qa/vps-runner/gvisor-correction-v2'
s=importlib.util.spec_from_file_location('probe_supervisor',FOLDER/'supervisor.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class ProbeTests(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        for patch in [mock.patch.object(m,'STATE',Path(temporary.name)),mock.patch.object(os,'O_NOFOLLOW',getattr(os,'O_NOFOLLOW',0),create=True)]:
            patch.start();self.addCleanup(patch.stop)

    def report(self):return {'kind':'offline-gvisor-Chromium-sandbox-probe-v2','checks':dict.fromkeys(m.CHECKS,True),'passed':True,'credentials_loaded':False,'published_requests':0,'failure_phase':None}

    def test_partial_or_ambiguous_pass_rejected(self):
        m.validate_report(json.dumps(self.report()))
        for field in m.CHECKS:
            value=self.report();value['checks'].pop(field)
            with self.subTest(field=field),self.assertRaises(ValueError):m.validate_report(json.dumps(value))
        value=self.report();value['checks']['seccomp_bpf']='Yes'
        with self.assertRaises(ValueError):m.validate_report(json.dumps(value))

    def test_host_limits_must_be_real_and_scoped_to_new_ID(self):
        with tempfile.TemporaryDirectory() as d,mock.patch.object(os.path,'samefile',return_value=True):
            base=Path(d);proc=base/'proc';cg=base/'cgroup';scope='/system.slice/docker-'+('a'*64)+'.scope'
            (proc/'123').mkdir(parents=True);(proc/'123/cgroup').write_text('0::'+scope+'\n')
            target=cg/scope.lstrip('/');target.mkdir(parents=True)
            values={'cpu.max':'200000 100000','memory.max':'2147483648','memory.swap.max':'0','pids.max':'256'}
            for name,value in values.items():(target/name).write_text(value)
            self.assertTrue(m.host_limits('a'*64,123,proc,cg)['verified'])
            for name in values:
                (target/name).write_text('max')
                with self.subTest(name=name),self.assertRaises(ValueError):m.host_limits('a'*64,123,proc,cg)
                (target/name).write_text(values[name])
            (proc/'123/cgroup').write_text('0::/system.slice/other.service\n')
            with self.assertRaises(ValueError):m.host_limits('a'*64,123,proc,cg)

    def test_stop_refuses_a_different_runtime_or_label(self):
        value={'id':'a'*64,'name':'/hampton-app-qa-chromium-probe-v2','approval':'b'*64,'runtime':'runc','running':True,'pid':1}
        with mock.patch.object(m,'call',return_value=SimpleNamespace(returncode=0,stdout=json.dumps(value))) as call:
            with self.assertRaises(ValueError):m.stop('a'*64,'b'*64)
            self.assertEqual(call.call_count,1)

    def test_invalid_browser_output_still_stops_only_the_verified_probe(self):
        child=SimpleNamespace(returncode=1,communicate=mock.Mock(return_value=(b'PRIVATE',b'')),poll=lambda:1)
        with mock.patch.object(m,'inspect',side_effect=[{'running':False},{'running':True,'pid':123},{'running':True,'pid':123}]),mock.patch.object(m,'host_limits',return_value={'verified':True}),mock.patch.object(m.subprocess,'Popen',return_value=child),mock.patch.object(m,'stop',return_value=True) as stop:
            self.assertFalse(m.run('a'*64,'b'*64))
            stop.assert_called_once_with('a'*64,'b'*64)
            result=json.loads((m.STATE/'result.json').read_text());self.assertEqual(result['failure'],{'phase':'parse-report','case':'invalid-json'});self.assertNotIn('PRIVATE',json.dumps(result))

    def test_success_requires_final_stop_and_writes_exclusive_public_evidence(self):
        child=SimpleNamespace(returncode=0,communicate=mock.Mock(return_value=(json.dumps(self.report()).encode(),b'')),poll=lambda:0)
        # Windows unit adapter only; the Linux supervisor keeps mandatory O_NOFOLLOW.
        with tempfile.TemporaryDirectory() as d,mock.patch.object(os,'O_NOFOLLOW',getattr(os,'O_NOFOLLOW',0),create=True),mock.patch.object(m,'STATE',Path(d)),mock.patch.object(m,'inspect',side_effect=[{'running':False},{'running':True,'pid':123},{'running':True,'pid':123}]*2),mock.patch.object(m,'host_limits',return_value={'verified':True}),mock.patch.object(m.subprocess,'Popen',return_value=child),mock.patch.object(m,'stop',return_value=True):
            self.assertTrue(m.run('a'*64,'b'*64))
            self.assertTrue(json.loads((Path(d)/'result.json').read_text())['stopped_verified'])
            self.assertEqual(child.communicate.call_args_list[0],mock.call(input=b'GO\n',timeout=90))
            with self.assertRaises(FileExistsError):m.run('a'*64,'b'*64)

    def test_bad_host_limits_never_release_browser(self):
        child=SimpleNamespace(returncode=0,communicate=mock.Mock(),poll=lambda:0)
        with mock.patch.object(m,'inspect',side_effect=[{'running':False},{'running':True,'pid':123}]),mock.patch.object(m,'host_limits',side_effect=ValueError('unbounded')),mock.patch.object(m.subprocess,'Popen',return_value=child),mock.patch.object(m,'stop',return_value=True) as stop:
            self.assertFalse(m.run('a'*64,'b'*64))
            self.assertFalse(any(c.kwargs.get('input')==b'GO\n' for c in child.communicate.call_args_list));stop.assert_called_once_with('a'*64,'b'*64)
            result=json.loads((m.STATE/'result.json').read_text());self.assertEqual(result['failure']['phase'],'host-limits');self.assertIsNone(result['host_cgroup']);self.assertTrue(result['stopped_verified'])

    def test_private_runsc_launcher_pins_isolation_and_rejects_override(self):
        class Executed(Exception):pass
        with mock.patch.object(sys,'argv',['runsc','create','probe']),mock.patch.object(os,'execv',side_effect=Executed) as execute:
            with self.assertRaises(Executed):runpy.run_path(str(FOLDER/'runsc-launcher.py'))
            arguments=execute.call_args.args[1]
            self.assertIn('--platform=systrap',arguments);self.assertIn('--network=none',arguments);self.assertIn('--systemd-cgroup=true',arguments)
            self.assertIn('--sandbox-creation-cpu-policy=1x',arguments);self.assertIn('--sandbox-lifecycle-cpu-policy=1x',arguments)
            self.assertIn('--oci-seccomp=true',arguments)
        for argument in ['--network=host','--platform=kvm','--strace=true','--systemd-cgroup=false','--sandbox-creation-cpu-policy=uncapped','--sandbox-lifecycle-cpu-policy=4x','--oci-seccomp=false']:
            with mock.patch.object(sys,'argv',['runsc',argument,'create','probe']),mock.patch.object(os,'execv') as execute:
                with self.assertRaises(SystemExit):runpy.run_path(str(FOLDER/'runsc-launcher.py'))
                execute.assert_not_called()

    def test_diagnostics_never_return_raw_exception_or_stderr(self):
        self.assertEqual(m.safe_failure(RuntimeError('PRIVATE-MUST-NOT-COPY')),'unexpected-error')
        self.assertEqual(m.stderr_classes(b'PRIVATE-MUST-NOT-COPY permission denied'),['permission-denied'])
        self.assertEqual(m.stderr_classes(b'X'*65537),['diagnostic-output-oversize'])

if __name__=='__main__':unittest.main()
