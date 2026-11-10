"""Prepare public fixed-version offline pilot. No SSH, installation or identity reads."""
from pathlib import Path
import hashlib,json,shutil,tarfile,tempfile

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[3]
STORE=REPO/'build/qa-vps-gvisor-probe'
IMAGE='mcr.microsoft.com/playwright@sha256:bc4fbb329a25287ed23e9216c97063646abdd1bf2da669a9895fa3e2078b2302'

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    metadata=json.loads((STORE/'release.json').read_text())
    archive=STORE/'gvisor-x86_64.tar.bz2'
    assert digest(archive)==metadata['archive_sha256']=='6f6b1a8f0f4665a403238135167d0d990bfaeaff5544abf68f5e0d822b35484a'
    members=[]
    with tarfile.open(archive,'r:bz2') as t:
        for m in t.getmembers():
            assert m.isfile() or m.isdir()
            p=Path(m.name);assert not p.is_absolute() and '..' not in p.parts
            if m.isfile():members.append({'file':m.name,'bytes':m.size,'sha256':hashlib.sha256(t.extractfile(m).read()).hexdigest()})
    assert {m['file'] for m in members}=={'containerd-shim-runsc-v1','runsc','gvisor-bin/checkpointgofer','gvisor-bin/gvisor-proc-umounter','gvisor-bin/gvisor-sentry-prewarmer','gvisor-bin/gvisor_sentry','gvisor-bin/runsc-fd-parking','gvisor-bin/runsc-metric-server'}
    args=['create','--name','hampton-app-qa-chromium-probe','--label','hampton.qa.gvisor-probe=@APPROVED_MANIFEST_SHA@','--runtime','io.containerd.runsc.v1','--platform','linux/amd64','--pull','never','--network','none','--dns','127.0.0.1','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--security-opt','seccomp=/opt/hampton-qa/policy/seccomp_profile.json','--init','--ipc','private','--pids-limit','256','--memory','2g','--memory-swap','2g','--cpus','2','--shm-size','512m','--ulimit','core=0:0','--log-driver','none','--restart','no','--env','HOME=/tmp/home','--env','DEBUG=','--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=256m,mode=1777','--tmpfs','/run/qa:rw,nosuid,nodev,noexec,size=32m,mode=0700,uid=1000,gid=1000','--mount','type=bind,src=/var/lib/hampton-qa/runtime/runner-package,dst=/work,readonly','--mount','type=bind,src=/opt/hampton-qa-gvisor-probe/probe.mjs,dst=/probe.mjs,readonly','--workdir','/work','--entrypoint','node',IMAGE,'/probe.mjs']
    args.insert(1,'--interactive')
    (HERE/'container-create.json').write_text(json.dumps(args,indent=2)+'\n',encoding='utf8',newline='\n')
    stage=Path(tempfile.mkdtemp(prefix='preparing-',dir=STORE))
    names=['README.md','container-create.json','probe.mjs','shim-launcher.py','runsc-launcher.py','supervisor.py']
    for name in names:shutil.copyfile(HERE/name,stage/name)
    shutil.copyfile(archive,stage/archive.name)
    files=[{'file':p.name,'bytes':p.stat().st_size,'sha256':digest(p)} for p in sorted(stage.iterdir())]
    previous=json.loads((REPO/'build/qa-vps-packages/2ed8614ed501ff04bfc71903f9a669f45b07754e6e3959067069eea2ea9cd232/manifest.json').read_text())
    manifest={'operation':'temporary-offline-gvisor-Chromium-sandbox-compatibility-pilot','host':'optimyze-vps-de-prod.tail29c816.ts.net','predecessor_manifest_sha256':'2ed8614ed501ff04bfc71903f9a669f45b07754e6e3959067069eea2ea9cd232','image':IMAGE,'release':metadata['release'],'runtime':'io.containerd.runsc.v1','platform':'systrap','release_url':metadata['url'],'release_members':members,'code_directory':'/opt/hampton-qa-gvisor-probe','state_directory':'/var/lib/hampton-qa-gvisor-probe','new_PATH_launcher':'/usr/local/bin/containerd-shim-runsc-v1','container_name':'hampton-app-qa-chromium-probe','transient_unit':'hampton-qa-chromium-probe.service','RuntimeMaxSec':180,'TimeoutStopSec':45,'container_watchdog_seconds':120,'supervisor_docker_attach_timeout_seconds':90,'mounts':{'/work':{'source':'/var/lib/hampton-qa/runtime/runner-package','read_only':True},'/probe.mjs':{'source':'/opt/hampton-qa-gvisor-probe/probe.mjs','read_only':True}},'runner_package_sha256':previous['runner_package_sha256'],'seccomp_sha256':digest(REPO/'docs/qa/full-app/runner-correction-e1/seccomp_profile.json'),'network':'none','ports':[],'requested_limits':{'cpus':2,'memory_bytes':2147483648,'memory_swap_bytes':2147483648,'pids':256},'host_sysctl_changes':False,'AppArmor_policy_changes':False,'daemon_configuration_changes':False,'default_runtime_changes':False,'existing_service_restart_or_reload':False,'QA_identity_transfer':False,'PC_runner_stop':False,'published_requests':False,'Cloudflare_SQL_R2_Access_changes':False,'push':False,'activation_of_shared_queue':False,'cleanup':'verify stop of only pinned new ID; retain stopped probe and evidence; remove only own PATH launcher if hash matches and no other runsc consumers; never automatic retry','files':files}
    (stage/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8',newline='\n')
    sha=digest(stage/'manifest.json');target=STORE/sha;assert not target.exists();stage.rename(target)
    bundle=STORE/(sha+'.tar')
    with tarfile.open(bundle,'w') as t:
        for p in sorted(target.iterdir()):
            info=t.gettarinfo(str(p),arcname=p.name);info.uid=info.gid=0;info.uname=info.gname='';info.mtime=0;info.mode=0o644
            with p.open('rb') as f:t.addfile(info,f)
    proposal={'manifest_sha256':sha,'archive_sha256':digest(bundle),'archive_file':bundle.relative_to(REPO).as_posix(),'manifest_file':(target/'manifest.json').relative_to(REPO).as_posix(),'authorized':False,'installed':False,'tested_on_VPS':False,'identity_values_read':False}
    (HERE/'proposal.json').write_text(json.dumps(proposal,indent=2)+'\n',encoding='utf8',newline='\n');print(json.dumps(proposal))

if __name__=='__main__':main()
