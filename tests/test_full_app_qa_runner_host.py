from pathlib import Path
from unittest import mock
import hashlib
import copy
import importlib.util
import json
import tempfile
import unittest

REPO=Path(__file__).resolve().parents[1]
SCRIPT=REPO/'docs/qa/full-app/publish/runner_host.py'

class HostLauncherTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.is_file(), 'reviewed host launcher is missing')
        spec=importlib.util.spec_from_file_location('qa_runner_host',SCRIPT)
        self.host=importlib.util.module_from_spec(spec)
        with mock.patch('subprocess.run', side_effect=AssertionError('import executed a process')):
            spec.loader.exec_module(self.host)

    def bundle(self, root):
        artifact=root/'build/qa-full-app-F/artifact'
        runner=root/'build/qa-full-app-F/runner-package'
        artifact.mkdir(parents=True);runner.mkdir(parents=True)
        (artifact/'index.html').write_text('QA only')
        for path,data in {'live.mjs':'reviewed runner','node_modules/playwright-core/package.json':'{}'}.items():
            target=runner/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(data)
        def inventory(directory,field):
            rows=[{'file':p.relative_to(directory).as_posix(),'bytes':len(p.read_bytes()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(directory.rglob('*')) if p.is_file()]
            tree=''.join(f"{r['file']}\0{r['bytes']}\0{r['sha256']}\n" for r in rows).encode()
            return {'source_sha':self.host.SOURCE_SHA,'build_id':'a'*64,field:hashlib.sha256(tree).hexdigest(),'files':rows}
        art=inventory(artifact,'artifact_sha256');run=inventory(runner,'runner_sha256')
        (root/'build/qa-full-app-F/build-manifest.json').write_text(json.dumps(art))
        (root/'build/qa-full-app-F/runner-manifest.json').write_text(json.dumps(run))
        prerequisite='docs/qa/full-app/publish/prerequisite.sql'
        required=set(self.host.REQUIRED_REVIEWED)|{prerequisite,'build/qa-full-app-F/build-manifest.json','build/qa-full-app-F/runner-manifest.json'}
        for name in required:
            path=root/name
            if not path.exists():
                path.parent.mkdir(parents=True,exist_ok=True)
                if name=='docs/qa/full-app/runner-correction-e1-execution.json':path.write_bytes((REPO/name).read_bytes())
                else:path.write_text('reviewed '+name)
        rows=[{'file':name,'bytes':len((root/name).read_bytes()),'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest()} for name in sorted(required)]
        hashed={row['file']:row['sha256'] for row in rows}
        proposal={key:art[key] for key in ['source_sha','build_id','artifact_sha256']}
        proposal.update(runner_sha256=run['runner_sha256'],files=rows,
            failure_stop_runner={'container_id':json.loads((root/'docs/qa/full-app/runner-correction-e1-execution.json').read_text())['container_ids_after_E1']['runner'],'timeout_seconds':10},
            artifact_manifest={'file':'build/qa-full-app-F/build-manifest.json','sha256':hashed['build/qa-full-app-F/build-manifest.json']},
            runner_manifest={'file':'build/qa-full-app-F/runner-manifest.json','sha256':hashed['build/qa-full-app-F/runner-manifest.json']},
            prerequisite_sql={'file':prerequisite,'sha256':hashed[prerequisite],'database_name':'hampton-app-qa','database_id':self.host.DATABASE_ID})
        target=root/'docs/qa/full-app/publish-proposal.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(proposal))
        runtime=root/'test-results/qa-agent-runtime/runner-package';runtime.mkdir(parents=True)
        return hashlib.sha256(target.read_bytes()).hexdigest(),artifact,runner

    def test_wrong_approval_or_extra_package_file_refuses_before_process_or_staging(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);approved,artifact,runner=self.bundle(root)
            with mock.patch.object(self.host,'verify_runtime',side_effect=AssertionError('runtime read too early')):
                with self.assertRaises(self.host.HostError):self.host.prepare_package(root,'0'*64)
                (runner/'unexpected.txt').write_text('extra')
                with self.assertRaises(self.host.HostError):self.host.prepare_package(root,approved)
            self.assertFalse((root/'test-results/qa-agent-runtime/runner-package/qa-f').exists())

    def test_approved_prepare_verifies_runtime_copies_once_and_never_reads_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);approved,artifact,runner=self.bundle(root)
            with mock.patch.object(self.host,'verify_runtime',return_value=None) as runtime, mock.patch.object(self.host,'load_credentials',side_effect=AssertionError('prepare read credentials')):
                result=self.host.prepare_package(root,approved)
                self.assertEqual(result['status'],'prepared');runtime.assert_called_once()
                staged=root/'test-results/qa-agent-runtime/runner-package/qa-f'
                self.assertEqual((staged/'live.mjs').read_bytes(),(runner/'live.mjs').read_bytes())
                with self.assertRaises(self.host.HostError):self.host.prepare_package(root,approved)

    def test_manifest_traversal_and_tampered_artifact_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);approved,artifact,runner=self.bundle(root)
            (artifact/'index.html').write_text('tampered')
            with self.assertRaises(self.host.HostError):self.host.load_approved(root,approved)
            with self.assertRaises(self.host.HostError):self.host.verify_tree(root,[{'file':'../outside','bytes':1,'sha256':'a'*64}],'a'*64)

    def test_lock_refuses_concurrent_launch_without_removing_existing_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            with self.host.exclusive_lock(root):
                with self.assertRaises(self.host.HostError):
                    with self.host.exclusive_lock(root):pass
                self.assertTrue((root/'.qa-f.lock').exists())
            self.assertFalse((root/'.qa-f.lock').exists())

    def test_private_acl_failure_precedes_any_credential_file_read(self):
        with tempfile.TemporaryDirectory() as directory:
            private=Path(directory)/'HamptonQA/full-app-access';private.mkdir(parents=True)
            for name in ['client-id.txt','client-secret.txt','session-secret.txt']:(private/name).write_text('synthetic-only')
            with mock.patch.object(self.host,'check_windows_acl',side_effect=self.host.HostError('private-acl')), mock.patch.object(self.host,'read_private_file',side_effect=AssertionError('credential read too early')):
                with self.assertRaises(self.host.HostError):self.host.load_credentials(private)

    def test_exec_credentials_use_stdin_only_and_stdout_is_whitelisted(self):
        fake={'accessClientId':'synthetic-client-id','accessClientSecret':'synthetic-client-secret','sessionSecret':'b'*64}
        stdout=json.dumps({'passed':True,'runId':'run-test','api_checks':71,'ui_checks':10,'credentials_removed':True})
        completed=mock.Mock(returncode=0,stdout=stdout.encode(),stderr=b'NEVER-PRINT-RAW-SECRET')
        with mock.patch.object(self.host.subprocess,'run',return_value=completed) as process:
            result=self.host.launch_runner(fake,'run-test','a'*64,'a'*64)
        self.assertEqual(result['status'],'passed');self.assertNotIn('NEVER-PRINT',json.dumps(result))
        args,kwargs=process.call_args
        self.assertNotIn('synthetic-client-secret',' '.join(args[0]));self.assertNotIn('env',kwargs)
        self.assertEqual(args[0],['docker','--context','desktop-linux','exec','-i','--user','1000:1000','a'*64,'node','/work/qa-f/live.mjs'])
        self.assertEqual(json.loads(kwargs['input'])['accessClientSecret'],'synthetic-client-secret')
        completed.stdout=b'{"passed":true,"secret":"DO-NOT-PRINT"}'
        with mock.patch.object(self.host.subprocess,'run',return_value=completed):
            with self.assertRaises(self.host.HostError) as caught:self.host.launch_runner(fake,'run-test','a'*64,'a'*64)
        self.assertNotIn('DO-NOT-PRINT',str(caught.exception))


    def runtime_fixture(self,root):
        compose=json.loads((REPO/'docs/qa/full-app/runner-correction-e1/compose.json').read_text())
        correction=json.loads((REPO/'docs/qa/full-app/runner-correction-e1-proposal.json').read_text())
        receipt=json.loads((REPO/'docs/qa/full-app/runner-correction-e1-execution.json').read_text())
        seccomp=json.loads((REPO/'docs/qa/full-app/runner-correction-e1/seccomp_profile.json').read_text())
        snap={'endpoint':self.host.ENDPOINT,'os':'linux','containers':{},'networks':{}}
        ids=receipt['container_ids_after_E1'];netids=correction['existing_networks']
        for role in ['runner','egress']:
            service=compose['services'][role]
            config={'Image':service['image'],'User':'1000:1000','WorkingDir':service['working_dir'],'Entrypoint':service['entrypoint'],'Cmd':service.get('command',[])}
            security=['no-new-privileges:true']+(['seccomp='+json.dumps(seccomp)] if role=='runner' else [])
            memory=2*1024**3 if role=='runner' else 256*1024**2
            host={'ReadonlyRootfs':True,'Privileged':False,'CapDrop':['ALL'],'SecurityOpt':security,'IpcMode':'private','LogConfig':{'Type':'none'},'RestartPolicy':{'Name':'no'},'Init':True,'Memory':memory,'MemorySwap':memory,'PidsLimit':256 if role=='runner' else 64,'NanoCpus':2_000_000_000 if role=='runner' else 500_000_000,'Tmpfs':dict(item.split(':',1) for item in service['tmpfs'])}
            if role=='runner':host.update(Dns=['127.0.0.1'],ShmSize=512*1024**2)
            pairs=[('/work','runner-package',False),('/results','results',True)] if role=='runner' else [('/policy','egress-package',False)]
            mounts=[{'Destination':dest,'Source':str(root/self.host.RUNTIME/source),'Type':'bind','RW':rw} for dest,source,rw in pairs]
            names=['hampton-app-qa-internal']+(['hampton-app-qa-outbound'] if role=='egress' else [])
            nets={name:{'NetworkID':netids[name],'IPAddress':'172.30.230.3' if role=='runner' else '172.30.230.2' if name.endswith('internal') else '172.30.231.2'} for name in names}
            snap['containers'][role]={'Id':ids[role],'Image':service['image'].split('@')[1],'Config':config,'HostConfig':host,'Mounts':mounts,'NetworkSettings':{'Networks':nets},'State':{'Running':True,'Health':{'Status':'healthy'}}}
        for name in ['hampton-app-qa-internal','hampton-app-qa-outbound']:
            internal=name.endswith('internal')
            snap['networks'][name]={'Id':netids[name],'Driver':'bridge','EnableIPv6':False,'Internal':internal,'IPAM':{'Config':[{'Subnet':'172.30.230.0/28' if internal else '172.30.231.0/28'}]},'Containers':{key:{} for key in ([ids['runner'],ids['egress']] if internal else [ids['egress']])},'Options':({'com.docker.network.bridge.gateway_mode_ipv4':'isolated','com.docker.network.enable_ipv4':'true'} if internal else {'com.docker.network.enable_ipv4':'true'})}
        return snap,compose,correction,receipt,seccomp

    def test_runtime_snapshot_accepts_only_exact_E1_security_mounts_images_and_networks(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);snapshot,compose,correction,receipt,seccomp=self.runtime_fixture(root)
            self.host.verify_runtime_snapshot(snapshot,root,compose,correction,receipt,seccomp)
            changes=[
                lambda s:s.update(endpoint='tcp://untrusted:2375'),
                lambda s:s['containers']['runner']['HostConfig'].update(Privileged=True),
                lambda s:s['containers']['runner']['HostConfig'].update(ReadonlyRootfs=False),
                lambda s:s['containers']['runner']['HostConfig'].update(CapAdd=['SYS_ADMIN']),
                lambda s:s['containers']['runner']['Config'].update(User='0:0'),
                lambda s:s['containers']['runner'].update(Image='sha256:'+'0'*64),
                lambda s:s['containers']['runner']['HostConfig'].update(SecurityOpt=['no-new-privileges:true','seccomp=unconfined']),
                lambda s:s['containers']['runner']['Mounts'][0].update(Source=str(root)),
                lambda s:s['containers']['runner']['Mounts'][0].update(RW=True),
                lambda s:s['containers']['runner']['HostConfig'].update(NetworkMode='host'),
                lambda s:s['containers']['runner']['NetworkSettings']['Networks'].update(unapproved={}),
                lambda s:s['networks']['hampton-app-qa-internal'].update(Internal=False),
                lambda s:s['networks']['hampton-app-qa-internal']['Containers'].update(unapproved={}),
                lambda s:s['networks']['hampton-app-qa-internal'].update(Options={}),
                lambda s:s['containers']['egress']['State']['Health'].update(Status='unhealthy'),
            ]
            for index,change in enumerate(changes):
                with self.subTest(case=index):
                    altered=copy.deepcopy(snapshot);change(altered)
                    with self.assertRaises(self.host.HostError):self.host.verify_runtime_snapshot(altered,root,compose,correction,receipt,seccomp)

    def test_audit_never_reads_credentials_or_stages_files(self):
        with mock.patch.object(self.host,'verify_runtime',return_value=None) as runtime, mock.patch.object(self.host,'load_credentials',side_effect=AssertionError('audit read credentials')):
            result=self.host.audit_runtime(REPO)
            runtime.assert_called_once_with(REPO)
            self.assertEqual(result,{'status':'audited','runtime':'E1-configuration-verified','credentials_read':False,'staged':False,'executed':False})

    def test_uncertain_execution_keeps_inflight_guard_and_never_reads_identity_again(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);approved,artifact,runner=self.bundle(root)
            with mock.patch.object(self.host,'verify_runtime',return_value=None):self.host.prepare_package(root,approved)
            credentials={'accessClientId':'synthetic-client-id','accessClientSecret':'synthetic-client-secret','sessionSecret':'b'*64}
            with mock.patch.object(self.host,'verify_runtime',return_value=None),mock.patch.object(self.host,'load_credentials',return_value=credentials) as loader,mock.patch.object(self.host,'launch_runner',side_effect=self.host.HostError('runner-execution')):
                with self.assertRaises(self.host.HostError):self.host.execute_package(root,approved,'run-test')
                self.assertEqual(credentials,{})
                with self.assertRaises(self.host.HostError):self.host.execute_package(root,approved,'run-test-again')
                self.assertEqual(loader.call_count,1)
            self.assertTrue((root/self.host.RUNTIME/'.qa-f-in-flight').exists())


    def test_image_config_digest_is_compared_to_sealed_E1_image_id_not_manifest_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);snapshot,compose,correction,receipt,seccomp=self.runtime_fixture(root)
            image_id='sha256:'+'d'*64
            snapshot['containers']['runner']['Image']=image_id
            correction['existing_containers']['hampton-app-qa-runner']['image_id']=image_id
            self.host.verify_runtime_snapshot(snapshot,root,compose,correction,receipt,seccomp)

    def test_owned_unlink_preserves_replacement_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);target=root/'lock';replacement=root/'replacement'
            target.write_text('owned');identity=target.stat();replacement.write_text('foreign')
            replacement.replace(target)
            with self.assertRaises(self.host.HostError):self.host.remove_owned_file(target,identity,'lock-ownership-changed')
            self.assertEqual(target.read_text(),'foreign')

    def test_replaced_pending_marker_is_preserved_after_runner_returns(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);approved,artifact,runner=self.bundle(root)
            with mock.patch.object(self.host,'verify_runtime',return_value=None):self.host.prepare_package(root,approved)
            credentials={'accessClientId':'synthetic-client-id','accessClientSecret':'synthetic-client-secret','sessionSecret':'b'*64}
            marker=root/self.host.RUNTIME/'.qa-f-in-flight'
            def runner_result(*args):
                replacement=marker.with_name('foreign-marker');replacement.write_text('foreign');replacement.replace(marker)
                return {'status':'passed','credentials_removed':True}
            with mock.patch.object(self.host,'verify_runtime',return_value=None),mock.patch.object(self.host,'load_credentials',return_value=credentials),mock.patch.object(self.host,'launch_runner',side_effect=runner_result):
                with self.assertRaises(self.host.HostError):self.host.execute_package(root,approved,'run-test')
            self.assertEqual(marker.read_text(),'foreign')

    def test_timeout_stops_only_sealed_runner_and_requires_verified_stopped_pid(self):
        import subprocess
        container='a'*64
        credentials={'accessClientId':'synthetic-client-id','accessClientSecret':'synthetic-client-secret','sessionSecret':'b'*64}
        stopped=mock.Mock(returncode=0,stdout=b'ignored',stderr=b'NEVER-PRINT')
        inspected=mock.Mock(returncode=0,stdout=json.dumps({'id':container,'running':False,'pid':0}).encode(),stderr=b'')
        with mock.patch.object(self.host.subprocess,'run',side_effect=[subprocess.TimeoutExpired('docker',1800),stopped,inspected]) as process:
            with self.assertRaisesRegex(self.host.HostError,'runner-execution-runner-stopped'):
                self.host.launch_runner(credentials,'run-test','b'*64,container)
        calls=process.call_args_list
        self.assertEqual(calls[1].args[0],['docker','--context','desktop-linux','stop','--time','10',container])
        self.assertEqual(calls[1].kwargs['timeout'],30)
        self.assertNotIn('input',calls[1].kwargs)
        inspected.stdout=json.dumps({'id':container,'running':True,'pid':123}).encode()
        with mock.patch.object(self.host.subprocess,'run',side_effect=[subprocess.TimeoutExpired('docker',1800),stopped,inspected]):
            with self.assertRaisesRegex(self.host.HostError,'runner-stop-unconfirmed'):
                self.host.launch_runner(credentials,'run-test','b'*64,container)

if __name__=='__main__':unittest.main()
