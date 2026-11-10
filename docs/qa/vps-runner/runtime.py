"""Pinned Linux QA runtime checks. No authentication values are logged."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess

ORIGIN='https://hamptonjersey-qa.pages.dev'
BASE=Path('/var/lib/hampton-qa')
ROOT=Path('/opt/hampton-qa')
IDENTITY=Path('/etc/hampton-qa/identity')
ENDPOINT='unix:///var/run/docker.sock'
IMAGES={'runner':'mcr.microsoft.com/playwright@sha256:bc4fbb329a25287ed23e9216c97063646abdd1bf2da669a9895fa3e2078b2302',
        'egress':'mitmproxy/mitmproxy@sha256:e2f810b6e618258dd4980716da143c4a8de0edcb3243264baea398e2185bbbfb'}


class CheckError(Exception):pass


def require(value,label):
    if not value:raise CheckError(label)


def digest(data):return hashlib.sha256(data).hexdigest()


def regular(path,limit=32*1024*1024):
    path=Path(path)
    for part in [path,*path.parents]:
        require(not part.is_symlink() and not part.is_junction(),'path-link')
    info=path.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_size<=limit,'file-type')
    return path.read_bytes()


def load_manifest(root,approved):
    require(isinstance(approved,str) and re.fullmatch('[a-f0-9]{64}',approved),'approval-required')
    raw=regular(root/'manifest.json')
    require(digest(raw)==approved,'manifest-hash')
    data=json.loads(raw)
    require(data['origin']==ORIGIN and data['images']==IMAGES,'manifest-target')
    require(data['D1_id']=='53bc4af9-7250-44fe-8f90-6e415fda1034' and data['R2']=='hampton-app-qa-media','manifest-resource')
    require(data['actor_roots']=={'hermes1':'/var/lib/docker/volumes/hermes_taller-home/_data/encargos/hampton-qa','hermes2':'/var/lib/docker/volumes/hermes_taller2-home/_data/encargos/hampton-qa','codex':'/var/lib/hampton-qa/actors/codex'},'manifest-actors')
    require(re.fullmatch('[a-f0-9]{40}',data['source_sha']) and re.fullmatch('[a-f0-9]{64}',data['build_id']),'manifest-source')
    seen=set()
    for row in data['files']:
        name=row['file'];p=PurePosixPath(name)
        require(isinstance(name,str) and p.as_posix()==name and not p.is_absolute() and '..' not in p.parts and ':' not in name and '\\' not in name and name not in seen,'manifest-path')
        seen.add(name);raw=regular(root/name)
        require(len(raw)==row['bytes'] and digest(raw)==row['sha256'],'manifest-file')
        if os.name=='posix':
            st=(root/name).stat();require(st.st_uid==0 and not(st.st_mode&0o022),'code-owner-or-mode')
    require({'controller.py','runtime.py','queue.py','client.py','install.py','compose.json','payload/runner-package/vps-live.mjs'}<=seen,'manifest-incomplete')
    data['_manifest_sha256']=approved
    return data


def verify_payload(root,manifest,kind,target):
    prefix='payload/'+kind+'/'
    rows={r['file'][len(prefix):]:r for r in manifest['files'] if r['file'].startswith(prefix)}
    require(rows,'payload-empty')
    actual={p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}
    require(actual==set(rows),'payload-inventory')
    for name,row in rows.items():
        raw=regular(target/name)
        require(len(raw)==row['bytes'] and digest(raw)==row['sha256'],'payload-file')


def docker(args,timeout=30):
    # A dedicated empty CLI config avoids the host's registry/provisioning profile.
    result=subprocess.run(['docker','--config',str(BASE/'docker-config'),'--host',ENDPOINT,*args],capture_output=True,timeout=timeout,check=False)
    require(result.returncode==0 and len(result.stdout)<=2_000_000,'docker-read-or-operation')
    return result.stdout


def docker_json(args):return json.loads(docker(args))


def snapshot():
    out={'endpoint':ENDPOINT,'os':docker_json(['info','--format','{{json .OSType}}']),'containers':{},'networks':{}}
    fmt='{"Id":{{json .Id}},"Image":{{json .Image}},"State":{"Running":{{json .State.Running}},"Health":{{json (index .State "Health")}}},"Config":{"Image":{{json .Config.Image}},"User":{{json .Config.User}},"WorkingDir":{{json .Config.WorkingDir}},"Entrypoint":{{json .Config.Entrypoint}},"Cmd":{{json .Config.Cmd}},"Approval":{{json (index .Config.Labels "hampton.qa.manifest")}}},"HostConfig":{{json .HostConfig}},"Mounts":{{json .Mounts}},"Networks":{{json .NetworkSettings.Networks}}}'
    for role in ['runner','egress']:out['containers'][role]=docker_json(['inspect','hampton-app-qa-'+role,'--format',fmt])
    for name in ['hampton-app-qa-internal','hampton-app-qa-outbound']:out['networks'][name]=docker_json(['network','inspect',name,'--format','{{json .}}'])
    return out


def options(value):
    result={}
    for entry in value.split(','):
        k,_,v=entry.partition('=');result[k]=str(int(v,8)) if k=='mode' else v
    return result


def validate_runtime(data,compose,receipt,seccomp):
    require(data.get('endpoint')==ENDPOINT and data.get('os')=='linux','daemon-target')
    expected_ids=receipt['container_ids']
    for role in ['runner','egress']:
        service=compose['services'][role];actual=data['containers'][role];cfg=actual['Config'];host=actual['HostConfig']
        require(service['image']==IMAGES[role] and cfg['Image']==IMAGES[role] and actual['Image']==receipt['image_ids'][role] and actual['Id']==expected_ids[role],'runtime-image-or-ID')
        require(cfg.get('Approval')==receipt['manifest_sha256'],'runtime-approval-label')
        require(actual['State']['Running'] is True and (role!='egress' or actual['State'].get('Health',{}).get('Status')=='healthy'),'runtime-state')
        require(cfg['User']=='1000:1000' and cfg['WorkingDir']==service['working_dir'] and cfg['Entrypoint']==service['entrypoint'] and (cfg.get('Cmd') or [])==service.get('command',[]),'runtime-command')
        require(host.get('ReadonlyRootfs') is True and host.get('Privileged') is False and set(host.get('CapDrop') or [])=={'ALL'} and not host.get('CapAdd'),'runtime-privileges')
        security=host.get('SecurityOpt') or []
        require('no-new-privileges:true' in security and len(security)==(2 if role=='runner' else 1),'runtime-security')
        if role=='runner':
            profile=next((s[8:] for s in security if s.startswith('seccomp=')),None)
            require(profile is not None and (json.loads(profile)==seccomp if profile.startswith('{') else profile=='/opt/hampton-qa/policy/seccomp_profile.json'),'runtime-seccomp')
        require(not host.get('PidMode') and host.get('IpcMode','private')=='private' and not host.get('UTSMode') and host.get('CgroupnsMode')!='host' and host.get('NetworkMode')!='host','runtime-namespaces')
        require(not host.get('PortBindings') and not host.get('PublishAllPorts') and not host.get('Devices') and not host.get('DeviceRequests') and not host.get('ExtraHosts') and not host.get('VolumesFrom') and not host.get('Links'),'runtime-host-access')
        require(host.get('Init') is True and host.get('LogConfig',{}).get('Type')=='none' and host.get('RestartPolicy',{}).get('Name') in ['no',''],'runtime-logging-or-restart')
        require(any(v.get('Name')=='core' and v.get('Soft')==0 and v.get('Hard')==0 for v in host.get('Ulimits') or []),'runtime-core-dumps')
        mem=2*1024**3 if role=='runner' else 256*1024**2
        require(host.get('Memory')==mem and host.get('MemorySwap')==mem and host.get('NanoCpus')==(2_000_000_000 if role=='runner' else 500_000_000) and host.get('PidsLimit')==(256 if role=='runner' else 64),'runtime-limits')
        expected={'/work':((BASE/'runtime/runner-package').as_posix(),False),'/results':((BASE/'runtime/results').as_posix(),True)} if role=='runner' else {'/policy':((BASE/'runtime/egress-package').as_posix(),False)}
        require(len(actual['Mounts'])==len(expected),'runtime-mounts')
        for mount in actual['Mounts']:
            pair=expected.get(mount.get('Destination'));require(pair and mount['Type']=='bind' and mount['Source']==pair[0] and mount['RW'] is pair[1],'runtime-mounts')
        require({p:options(v) for p,v in host.get('Tmpfs',{}).items()}=={s.split(':',1)[0]:options(s.split(':',1)[1]) for s in service['tmpfs']},'runtime-tmpfs')
        if role=='runner':require(host.get('Dns')==['127.0.0.1'] and host.get('ShmSize')==512*1024**2,'runtime-DNS')
        names={'hampton-app-qa-internal'}|({'hampton-app-qa-outbound'} if role=='egress' else set())
        require(set(actual['Networks'])==names,'runtime-networks')
        for name,network in actual['Networks'].items():
            address='172.30.230.3' if role=='runner' else '172.30.230.2' if name.endswith('internal') else '172.30.231.2'
            require(network['NetworkID']==receipt['network_ids'][name] and network['IPAddress']==address,'runtime-network-address')
    for name,network in data['networks'].items():
        internal=name.endswith('internal');members={expected_ids['egress']}|({expected_ids['runner']} if internal else set())
        require(network['Id']==receipt['network_ids'][name] and network['Internal'] is internal and network['Driver']=='bridge' and network['EnableIPv6'] is False and set(network.get('Containers') or {})==members,'runtime-network-policy')
        require([c.get('Subnet') for c in network['IPAM']['Config']]==[('172.30.230.0/28' if internal else '172.30.231.0/28')],'runtime-subnet')
        flags=network.get('Options') or {};require(not(set(flags)-{'com.docker.network.enable_ipv4','com.docker.network.bridge.gateway_mode_ipv4'}) and flags.get('com.docker.network.enable_ipv4','true')=='true' and (flags.get('com.docker.network.bridge.gateway_mode_ipv4')=='isolated' if internal else not flags.get('com.docker.network.bridge.gateway_mode_ipv4')),'runtime-network-options')


def validate_credentials(value):
    require(isinstance(value,dict) and set(value)=={'accessClientId','accessClientSecret','sessionSecret'},'identity-shape')
    require(isinstance(value['sessionSecret'],str) and re.fullmatch('[a-f0-9]{64}',value['sessionSecret']),'identity-format')
    for name in ['accessClientId','accessClientSecret']:
        s=value[name];require(isinstance(s,str) and 16<=len(s)<=512 and all(33<=ord(c)<=126 for c in s),'identity-format')
    return value


def load_identity():
    require(os.name=='posix' and os.geteuid()==0,'controller-UID')
    for p in [IDENTITY,*IDENTITY.parents]:
        st=p.lstat();require(not stat.S_ISLNK(st.st_mode) and st.st_uid==0 and not(st.st_mode&0o022),'identity-directory')
    require(IDENTITY.stat().st_mode&0o777==0o700,'identity-directory-mode')
    handles=[]
    try:
        for name in ['client-id.txt','client-secret.txt','session-secret.txt']:
            fd=os.open(IDENTITY/name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK);handles.append(fd);st=os.fstat(fd)
            require(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and st.st_mode&0o777==0o600 and 0<st.st_size<=1024,'identity-file')
        values=[os.read(fd,1025).decode('utf8').strip() for fd in handles]
        return validate_credentials(dict(zip(['accessClientId','accessClientSecret','sessionSecret'],values)))
    finally:
        for fd in handles:os.close(fd)
