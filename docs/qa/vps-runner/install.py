"""Explicit approved Linux QA bootstrap. Never deploys Cloudflare or changes production."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time

HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('qa_install_runtime',HERE/'runtime.py');rt=importlib.util.module_from_spec(s);s.loader.exec_module(rt)
s=importlib.util.spec_from_file_location('qa_install_queue',HERE/'queue.py');contract=importlib.util.module_from_spec(s);s.loader.exec_module(contract)
ACTORS={'hermes1':Path('/var/lib/docker/volumes/hermes_taller-home/_data/encargos/hampton-qa'),
        'hermes2':Path('/var/lib/docker/volumes/hermes_taller2-home/_data/encargos/hampton-qa'),
        'codex':rt.BASE/'actors/codex'}
PC_RUNNER='a22cfa82aff4423614f95097d12d56ca57629edb4e99a008b685234eb799408d'


def save(path,value):
    data=(json.dumps(value,indent=2)+'\n').encode()
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())


def installed(approved):
    manifest=rt.load_manifest(rt.ROOT,approved)
    receipt=json.loads(rt.regular(rt.BASE/'control/install-receipt.json'))
    rt.require(receipt['manifest_sha256']==approved,'receipt-manifest')
    return manifest,receipt


def checked_directory(path,mode=0o700,owner=0):
    for parent in path.parents:
        if parent.exists():rt.require(parent.is_dir() and not parent.is_symlink(),'install-parent')
    path.mkdir(mode=mode,parents=False);os.chown(path,owner,owner);os.chmod(path,mode)


def create_actor(path,owner):
    # Workshop ancestors are writable by the actor: pin their descriptors before creating anything.
    with contract.Directory(path.parent) as parent:
        os.mkdir(path.name,0o755,dir_fd=parent.fd)
        fd=os.open(path.name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent.fd)
        try:
            os.fchmod(fd,0o755)
            for name,mode,uid in [('incoming',0o700,owner),('processing',0o700,0),('results',0o755,0)]:
                os.mkdir(name,mode,dir_fd=fd);os.chown(name,uid,uid,dir_fd=fd,follow_symlinks=False);os.chmod(name,mode,dir_fd=fd,follow_symlinks=False)
        finally:os.close(fd)


def copy_public(source,destination,manifest):
    destination.mkdir(mode=0o755)
    for row in manifest['files']:
        target=destination/row['file'];target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(source/row['file'],target);os.chmod(target,0o644)
    shutil.copyfile(source/'manifest.json',destination/'manifest.json');os.chmod(destination/'manifest.json',0o644)
    for p in [destination,*[p for p in destination.rglob('*') if p.is_dir()]]:os.chmod(p,0o755)


def bootstrap(approved):
    manifest=rt.load_manifest(HERE,approved)
    rt.require(os.name=='posix' and os.geteuid()==0 and platform.machine() in ['x86_64','amd64'],'Linux-root-x64-required')
    rt.require(not any(p.exists() for p in [rt.ROOT,rt.BASE,rt.IDENTITY.parent]),'install-destination-exists')
    rt.require(manifest['actor_roots']=={k:v.as_posix() for k,v in ACTORS.items()},'actor-roots')
    for actor,path in ACTORS.items():
        if actor=='codex':continue
        rt.require(not path.exists() and path.parent.is_dir() and not path.parent.is_symlink(),'actor-destination')
    mem={a.split(':',1)[0]:int(a.split()[1])*1024 for a in Path('/proc/meminfo').read_text().splitlines() if ':' in a and len(a.split())>=2 and a.split()[1].isdigit()}
    rt.require(mem.get('MemAvailable',0)>3*1024**3 and shutil.disk_usage('/var/lib').free>6*1024**3,'host-headroom')
    # A fresh, dedicated installation only. No overwrite/retry or existing stack adoption.
    copy_public(HERE,rt.ROOT,manifest)
    checked_directory(rt.BASE);checked_directory(rt.BASE/'docker-config');checked_directory(rt.BASE/'control')
    checked_directory(rt.BASE/'control/evidence');checked_directory(rt.BASE/'runtime');checked_directory(rt.IDENTITY.parent)
    # Inspect only the local daemon, with an empty QA-specific CLI config.
    info=rt.docker_json(['info','--format','{"version":{{json .ServerVersion}},"os":{{json .OSType}},"security":{{json .SecurityOptions}}}'])
    rt.require(info['os']=='linux' and int(info['version'].split('.')[0])>=29 and any('seccomp' in s for s in info['security']),'daemon-requirements')
    rt.require(not rt.docker(['ps','-aq','--filter','name=^/hampton-app-qa-(runner|egress)$']).strip(),'QA-container-collision')
    for name in ['hampton-app-qa-internal','hampton-app-qa-outbound']:
        rt.require(not rt.docker(['network','ls','--filter','name=^'+name+'$','--format','{{.Name}}']).strip(),'QA-network-collision')
    import ipaddress
    for identifier in rt.docker(['network','ls','-q']).decode().splitlines():
        configs=rt.docker_json(['network','inspect',identifier,'--format','{{json .IPAM.Config}}'])
        for cfg in configs or []:
            subnet=cfg.get('Subnet','')
            if subnet and ':' not in subnet:
                rt.require(not any(ipaddress.ip_network(subnet).overlaps(ipaddress.ip_network(n)) for n in ['172.30.230.0/28','172.30.231.0/28']),'QA-subnet-collision')
    image_ids={}
    for role,image in rt.IMAGES.items():
        rt.docker(['pull','--platform','linux/amd64',image],timeout=1200)
        data=rt.docker_json(['image','inspect',image,'--format','{"id":{{json .Id}},"digests":{{json .RepoDigests}},"arch":{{json .Architecture}}}'])
        rt.require(image in data['digests'] and data['arch']=='amd64','pinned-image')
        image_ids[role]=data['id']
    for kind in ['runner-package','egress-package']:
        shutil.copytree(rt.ROOT/'payload'/kind,rt.BASE/'runtime'/kind)
        rt.verify_payload(rt.ROOT,manifest,kind,rt.BASE/'runtime'/kind)
    checked_directory(rt.BASE/'runtime/results',owner=1000)
    compose=json.loads(rt.regular(rt.ROOT/'compose.json'))
    for value in list(compose['services'].values())+list(compose['networks'].values()):value['labels']['hampton.qa.manifest']=approved
    save(rt.BASE/'control/compose.json',compose)
    return start_runtime(approved,image_ids,compose,json.loads(rt.regular(rt.ROOT/'policy/seccomp_profile.json')))


def stop_owned(approved):
    result={}
    for role in ['runner','egress']:
        try:
            data=rt.docker_json(['inspect','hampton-app-qa-'+role,'--format','{"id":{{json .Id}},"approval":{{json (index .Config.Labels "hampton.qa.manifest")}}}'])
            rt.require(data.get('approval')==approved,'refuse-unowned-container')
            rt.docker(['stop','--time','10',data['id']])
            state=rt.docker_json(['inspect',data['id'],'--format','{"running":{{json .State.Running}},"pid":{{json .State.Pid}}}'])
            result[role]=state=={'running':False,'pid':0}
        except Exception:result[role]=False
    return result


def start_runtime(approved,image_ids,compose,seccomp):
    receipt={'manifest_sha256':approved,'image_ids':image_ids,'container_ids':{},'network_ids':{},'isolation_passed':False}
    try:
        rt.docker(['compose','--project-name','hampton-app-qa','--file',str(rt.BASE/'control/compose.json'),'up','-d'],timeout=180)
        for _ in range(30):
            snap=rt.snapshot()
            if snap['containers']['egress']['State'].get('Health',{}).get('Status')=='healthy':break
            time.sleep(1)
        receipt['container_ids']={k:v['Id'] for k,v in snap['containers'].items()}
        receipt['network_ids']={k:v['Id'] for k,v in snap['networks'].items()}
        rt.validate_runtime(snap,compose,receipt,seccomp)
        proof=json.loads(rt.docker(['exec','--user','1000:1000',receipt['container_ids']['runner'],'node','/work/isolation.mjs'],timeout=180))
        rt.require(proof.get('passed') is True and proof.get('checks',0)>=22,'isolation-failed')
        text=rt.docker(['exec','--user','1000:1000',receipt['container_ids']['egress'],'python','/policy/proxy_selftest.py']).decode()
        rt.require('PROXY_API_AND_POLICY_SELFTEST=PASS; REAL_NETWORK_REQUESTS=0' in text,'proxy-selftest-failed')
        receipt.update(isolation_passed=True,isolation_checks=proof['checks'],proxy_selftest_passed=True)
    finally:
        if not receipt['isolation_passed']:receipt['failure_stop_verified']=stop_owned(approved)
        save(rt.BASE/'control/install-receipt.json',receipt)
    return {'status':'bootstrapped','isolation_passed':True,'credentials_loaded':False}


def store_identity(approved,values):
    manifest,receipt=installed(approved)
    values=rt.validate_credentials(values)
    rt.require(receipt.get('isolation_passed') is True,'identity-before-isolation')
    s=importlib.util.spec_from_file_location('qa_identity_preflight',rt.ROOT/'controller.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
    m.preflight(manifest,receipt)
    rt.require(not rt.IDENTITY.exists(),'identity-store-exists')
    checked_directory(rt.IDENTITY)
    # Values arrive only through SSH stdin after explicit destination approval.
    for key,name in [('accessClientId','client-id.txt'),('accessClientSecret','client-secret.txt'),('sessionSecret','session-secret.txt')]:
        fd=os.open(rt.IDENTITY/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w',encoding='utf8') as f:f.write(values[key]);f.flush();os.fsync(f.fileno())
    values.clear()
    return {'status':'identity-stored','values_disclosed':False}


def service_text(approved):
    writes=' '.join([str(rt.BASE),*[str(p) for k,p in ACTORS.items() if k!='codex']])
    return '[Unit]\nDescription=Hampton QA queue only\nAfter=docker.service\nRequires=docker.service\n[Service]\nType=oneshot\nUser=root\nUMask=0077\nTimeoutStartSec=0\nNoNewPrivileges=yes\nProtectSystem=strict\nProtectHome=yes\nPrivateTmp=yes\nCPUQuota=100%\nMemoryMax=512M\nMemorySwapMax=0\nTasksMax=64\nLimitCORE=0\nStandardOutput=null\nStandardError=null\nRestrictAddressFamilies=AF_UNIX\nCapabilityBoundingSet=CAP_DAC_OVERRIDE\nReadWritePaths='+writes+'\nExecStart=/usr/bin/python3 /opt/hampton-qa/controller.py work --approved-manifest-sha256 '+approved+'\nExecStopPost=/usr/bin/python3 /opt/hampton-qa/controller.py emergency-stop --approved-manifest-sha256 '+approved+'\n'


def enable_queue(approved):
    manifest,receipt=installed(approved)
    rt.require(not(rt.BASE/'control/uncertain').exists(),'uncertain-run-inspection-required')
    s=importlib.util.spec_from_file_location('qa_enable_preflight',rt.ROOT/'controller.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.preflight(manifest,receipt)
    proof=json.loads(rt.regular(rt.BASE/'control/pc-runner-stop.json'))
    rt.require(proof=={'container_id':PC_RUNNER,'running':False,'pid':0},'PC-runner-still-active')
    suites=set()
    for p in (rt.BASE/'control/evidence').glob('*.json'):
        data=json.loads(rt.regular(p))
        if data.get('manifest_sha256')==approved and data.get('passed') is True and data.get('source_sha')==manifest['source_sha'] and data.get('build_id')==manifest['build_id'] and data.get('credentials_removed') is True:suites.add(data.get('suite'))
    rt.require({'smoke','history-b'}<=suites,'QA-suites-not-yet-verified')
    for actor,path in ACTORS.items():
        if actor=='codex':continue
        for name in ['client.py','queue.py']:
            with contract.Directory(path,private='readable') as directory:directory.write(name,rt.regular(rt.ROOT/name),mode=0o644)
    for args in [['systemctl','enable','--now','hampton-qa-queue.path']]:
        result=subprocess.run(args,capture_output=True,timeout=30);rt.require(result.returncode==0,'systemd-QA-enable')
    return {'status':'queue-enabled','actors':['hermes1','hermes2','codex']}


def initial_codex_queue(approved,pc_proof):
    installed(approved);rt.require(pc_proof=={'container_id':PC_RUNNER,'running':False,'pid':0},'PC-stop-proof')
    save(rt.BASE/'control/pc-runner-stop.json',pc_proof)
    checked_directory(rt.BASE/'actors')
    for actor,path in ACTORS.items():create_actor(path,0 if actor=='codex' else 10001)
    # Install the supervisor BEFORE any authenticated suite. Keep its watcher disabled.
    service=Path('/etc/systemd/system/hampton-qa-queue.service');watch=Path('/etc/systemd/system/hampton-qa-queue.path')
    rt.require(not service.exists() and not watch.exists(),'systemd-QA-unit-exists')
    service.write_text(service_text(approved));os.chmod(service,0o644)
    watch.write_text('[Unit]\nDescription=Hampton QA requests only\n[Path]\n'+''.join('PathExistsGlob='+str(p/'incoming/*.json')+'\n' for p in ACTORS.values())+'Unit=hampton-qa-queue.service\n[Install]\nWantedBy=multi-user.target\n');os.chmod(watch,0o644)
    result=subprocess.run(['systemctl','daemon-reload'],capture_output=True,timeout=30);rt.require(result.returncode==0,'QA-supervisor-registration')
    return {'status':'codex-queue-prepared'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation',choices=['bootstrap','store-identity','prepare-codex','enable-queue'])
    parser.add_argument('--approved-manifest-sha256',required=True)
    args=parser.parse_args()
    try:
        if os.name=='posix':os.umask(0o077)
        if args.operation=='bootstrap':result=bootstrap(args.approved_manifest_sha256)
        elif args.operation=='enable-queue':result=enable_queue(args.approved_manifest_sha256)
        else:
            raw=sys.stdin.buffer.read(4097);rt.require(len(raw)<=4096,'private-input-size');value=json.loads(raw);raw=b''
            result=store_identity(args.approved_manifest_sha256,value) if args.operation=='store-identity' else initial_codex_queue(args.approved_manifest_sha256,value)
        print(json.dumps(result));return 0
    except Exception:
        print('{"status":"blocked","case":"QA-installation-check-inspect-before-retry"}');return 1


if __name__=='__main__':raise SystemExit(main())
