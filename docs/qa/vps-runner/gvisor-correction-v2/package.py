"""Seal local V2 preparation only. No SSH, runtime execution or identity reads."""
from pathlib import Path
import hashlib,json,shutil,tarfile,tempfile

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[3]
OLD_SHA='7bd6db6fcaec7a7ba8ec63a9f680f4668645b66f46675a48f505e9f6e817e17a'

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    old=REPO/'build/qa-vps-gvisor-probe'/OLD_SHA
    assert digest(old/'manifest.json')==OLD_SHA
    previous=json.loads((old/'manifest.json').read_text())
    args=json.loads((old/'container-create.json').read_text())
    args=[x.replace('hampton-app-qa-chromium-probe','hampton-app-qa-chromium-probe-v2').replace('/opt/hampton-qa-gvisor-probe/probe.mjs','/opt/hampton-qa-gvisor-v2/probe.mjs') for x in args]
    (HERE/'container-create.json').write_text(json.dumps(args,indent=2)+'\n',encoding='utf8',newline='\n')
    store=REPO/'build/qa-vps-gvisor-v2';store.mkdir(exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='preparing-',dir=store))
    for name in ['README.md','container-create.json','probe.mjs','supervisor.py','shim-launcher.py','runsc-launcher.py']:shutil.copyfile(HERE/name,stage/name)
    rows=[{'file':p.name,'bytes':p.stat().st_size,'sha256':digest(p)} for p in sorted(stage.iterdir())]
    manifest={'operation':'one-offline-gvisor-pilot-with-stdin-and-diagnostic-correction-v2','host':previous['host'],'predecessor_manifest_sha256':OLD_SHA,'preserve_previous_probe_id':'74a8197f2f739c5d7a86b46289a67cfba45ecde9e190711e5b89ea313262fec2','historical_failure_cause_conclusive':False,'confirmed_fixes':['Readable.iterator destroyOnReturn=false','durable phase checkpoints and sanitized failure report','private runtime creation/lifecycle CPU policies 1x','explicit guest OCI seccomp and Node Seccomp2 gate'],'image':previous['image'],'runtime':'io.containerd.runsc.v1','platform':'systrap','code_directory':'/opt/hampton-qa-gvisor-v2','state_directory':'/var/lib/hampton-qa-gvisor-v2','temporary_PATH_launcher':'/usr/local/bin/containerd-shim-runsc-v1','reused_official_directory_read_only':'/opt/hampton-qa-gvisor-probe/release-20261102.0/dist','reused_release_members':previous['release_members'],'release':previous['release'],'container_name':'hampton-app-qa-chromium-probe-v2','transient_unit':{'name':'hampton-qa-chromium-probe-v2.service','Type':'exec','RuntimeMaxSec':180,'TimeoutStopSec':45,'KillMode':'control-group','UMask':'0077','LimitCORE':0,'CPUQuota':'200%','MemoryMax':'128M','TasksMax':32,'StandardOutput':'null','StandardError':'null','ExecStart':'/usr/bin/python3 /opt/hampton-qa-gvisor-v2/supervisor.py run --container-id @ID@ --approved-manifest-sha256 @SHA@','ExecStopPost':'/usr/bin/python3 /opt/hampton-qa-gvisor-v2/supervisor.py stop --container-id @ID@ --approved-manifest-sha256 @SHA@'},'watchdog_seconds':120,'mounts':{'/work':{'source':'/var/lib/hampton-qa/runtime/runner-package','read_only':True},'/probe.mjs':{'source':'/opt/hampton-qa-gvisor-v2/probe.mjs','read_only':True}},'runner_package_sha256':previous['runner_package_sha256'],'seccomp_sha256':previous['seccomp_sha256'],'network':'none','ports':[],'requested_container_limits':previous['requested_limits'],'OCI_seccomp_enabled_in_guest':True,'sandbox_creation_cpu_policy':'1x','sandbox_lifecycle_cpu_policy':'1x','host_sysctl_changes':False,'AppArmor_policy_changes':False,'default_runtime_changes':False,'daemon_configuration_changes':False,'existing_service_restart_or_reload':False,'identity_transfer':False,'PC_runner_stop':False,'published_requests':False,'SQL_R2_Access_Cloudflare_changes':False,'push':False,'shared_queue_activation':False,'attempts_authorized_by_future_yes':1,'cleanup':'stop and verify only new ID; preserve old probes and all evidence; remove own launcher after hash check and confirmation only known stopped probes use runsc; unload only own transient unit; no retry','files':rows}
    (stage/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8',newline='\n')
    sha=digest(stage/'manifest.json');target=store/sha;assert not target.exists();stage.rename(target)
    archive=store/(sha+'.tar')
    with tarfile.open(archive,'w') as tar:
        for p in sorted(target.iterdir()):
            info=tar.gettarinfo(str(p),arcname=p.name);info.uid=info.gid=0;info.uname=info.gname='';info.mtime=0;info.mode=0o644
            with p.open('rb') as f:tar.addfile(info,f)
    proposal={'manifest_sha256':sha,'archive_sha256':digest(archive),'manifest_file':(target/'manifest.json').relative_to(REPO).as_posix(),'archive_file':archive.relative_to(REPO).as_posix(),'authorized':False,'installed':False,'pilot_repeated':False,'identity_values_read':False}
    (HERE/'proposal.json').write_text(json.dumps(proposal,indent=2)+'\n',encoding='utf8',newline='\n');print(json.dumps(proposal))

if __name__=='__main__':main()
