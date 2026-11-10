"""Future approved F staging/execution only; importing this module performs no IO."""
import argparse
import base64
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess

SOURCE_SHA='80ad03df7e095750f455aa4aa668573e9aac5db4'
DATABASE_ID='53bc4af9-7250-44fe-8f90-6e415fda1034'
ROOT=Path(__file__).resolve().parents[4]
WORK='build/qa-full-app-F'
RUNTIME='test-results/qa-agent-runtime'
CONTEXT='desktop-linux'
ENDPOINT='npipe:////./pipe/dockerDesktopLinuxEngine'
REQUIRED_REVIEWED=frozenset([
 'docs/qa/full-app/publish/runner_host.py',
 'docs/qa/full-app/runner-correction-e1/compose.json',
 'docs/qa/full-app/runner-correction-e1/seccomp_profile.json',
 'docs/qa/full-app/runner-correction-e1/proxy_selftest.py',
 'docs/qa/full-app/runner-correction-e1-proposal.json',
 'docs/qa/full-app/runner-correction-e1-execution.json',
 'docs/qa/full-app/runner/policy.py','docs/qa/full-app/runner/egress_addon.py',
 'docs/qa/full-app/runner/isolation.mjs','docs/qa/full-app/runner/idle.mjs',
])

class HostError(Exception):
    """Only fixed public case labels may cross the host boundary."""

def require(condition,label):
    if not condition:raise HostError(label)

def digest(data):return hashlib.sha256(data).hexdigest()

def no_reparse(path):
    path=Path(path).absolute()
    for item in [path,*path.parents]:
        try:info=item.lstat()
        except FileNotFoundError:continue
        require(not stat.S_ISLNK(info.st_mode) and not getattr(info,'st_file_attributes',0)&getattr(stat,'FILE_ATTRIBUTE_REPARSE_POINT',1024),'path-reparse')
    return path

def safe_relative(value):
    require(isinstance(value,str) and value and '\\' not in value and ':' not in value and '\0' not in value,'manifest-path')
    path=PurePosixPath(value)
    require(not path.is_absolute() and path.as_posix()==value and not any(p in ('','.','..') for p in path.parts),'manifest-path')
    return path

def regular_bytes(path):
    no_reparse(path)
    require(path.is_file() and path.stat().st_nlink==1,'file-type')
    return path.read_bytes()

def checked_rows(directory,rows):
    require(isinstance(rows,list) and 0<len(rows)<=20000,'manifest-inventory')
    actual=[];seen=set()
    for row in rows:
        require(isinstance(row,dict) and set(row)=={'file','bytes','sha256'},'manifest-row')
        name=safe_relative(row['file']).as_posix()
        require(name not in seen and type(row['bytes']) is int and row['bytes']>=0 and re.fullmatch('[a-f0-9]{64}',row['sha256'] or ''),'manifest-row')
        seen.add(name)
        raw=regular_bytes(directory/name)
        require(len(raw)==row['bytes'] and digest(raw)==row['sha256'],'manifest-file-hash')
        actual.append({'file':name,'bytes':len(raw),'sha256':digest(raw)})
    require([row['file'] for row in actual]==sorted(seen),'manifest-order')
    return actual

def verify_tree(directory,rows,expected):
    directory=no_reparse(directory)
    require(directory.is_dir(),'tree-missing')
    actual=checked_rows(directory,rows)
    files=set()
    for path in directory.rglob('*'):
        no_reparse(path)
        require(path.is_file() or path.is_dir(),'tree-file-type')
        if path.is_file():files.add(path.relative_to(directory).as_posix())
    require(files=={row['file'] for row in actual},'tree-inventory')
    canonical=''.join(row['file']+'\0'+str(row['bytes'])+'\0'+row['sha256']+'\n' for row in actual).encode('utf-8')
    require(digest(canonical)==expected,'tree-hash')

def load_json(path):
    try:return json.loads(regular_bytes(path))
    except (ValueError,UnicodeError):raise HostError('json-invalid') from None

def load_approved(root,approved):
    root=no_reparse(root)
    require(isinstance(approved,str) and re.fullmatch('[a-f0-9]{64}',approved),'approval-required')
    raw=regular_bytes(root/'docs/qa/full-app/publish-proposal.json')
    require(digest(raw)==approved,'approval-hash')
    try:proposal=json.loads(raw)
    except (ValueError,UnicodeError):raise HostError('proposal-invalid') from None
    require(proposal.get('source_sha')==SOURCE_SHA and re.fullmatch('[a-f0-9]{64}',proposal.get('build_id','')),'proposal-source')
    for name in ['artifact_sha256','runner_sha256']:
        require(re.fullmatch('[a-f0-9]{64}',proposal.get(name,'')),'proposal-hash')
    rows=checked_rows(root,proposal.get('files'))
    sealed={row['file']:row['sha256'] for row in rows}
    require(REQUIRED_REVIEWED<=set(sealed),'proposal-review-files')
    for key,name,field,directory in [
        ('artifact_manifest',WORK+'/build-manifest.json','artifact_sha256',WORK+'/artifact'),
        ('runner_manifest',WORK+'/runner-manifest.json','runner_sha256',WORK+'/runner-package'),
    ]:
        reference=proposal.get(key,{})
        require(reference.get('file')==name and reference.get('sha256')==sealed.get(name),'proposal-manifest')
        manifest=load_json(root/name)
        require(manifest.get('source_sha')==SOURCE_SHA and manifest.get('build_id')==proposal['build_id'] and manifest.get(field)==proposal[field],'manifest-identity')
        verify_tree(root/directory,manifest.get('files'),proposal[field])
        proposal[key+'_data']=manifest
    runner_names={row['file'] for row in proposal['runner_manifest_data']['files']}
    require({'live.mjs','node_modules/playwright-core/package.json'}<=runner_names,'runner-self-contained')
    prerequisite=proposal.get('prerequisite_sql',{})
    require(prerequisite.get('database_name')=='hampton-app-qa' and prerequisite.get('database_id')==DATABASE_ID
        and prerequisite.get('sha256')==sealed.get(prerequisite.get('file')) and prerequisite.get('file') in sealed,'prerequisite-target')
    runner_id=load_json(root/'docs/qa/full-app/runner-correction-e1-execution.json')['container_ids_after_E1']['runner']
    require(proposal.get('failure_stop_runner')=={'container_id':runner_id,'timeout_seconds':10},'proposal-failure-stop')
    return proposal

def remove_owned_file(path,identity,label):
    try:current=path.lstat()
    except FileNotFoundError:raise HostError(label) from None
    require(stat.S_ISREG(current.st_mode) and not getattr(current,'st_file_attributes',0)&getattr(stat,'FILE_ATTRIBUTE_REPARSE_POINT',1024)
        and current.st_nlink==1 and identity.st_ino!=0 and (current.st_dev,current.st_ino)==(identity.st_dev,identity.st_ino),label)
    path.unlink()

@contextmanager
def exclusive_lock(directory):
    directory=no_reparse(directory);require(directory.is_dir(),'runtime-missing')
    lock=directory/'.qa-f.lock';no_reparse(lock)
    try:descriptor=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    except FileExistsError:raise HostError('runner-locked') from None
    try:
        os.write(descriptor,str(os.getpid()).encode());yield
    finally:
        identity=os.fstat(descriptor)
        os.close(descriptor)
        remove_owned_file(lock,identity,'lock-ownership-changed')

def command_json(arguments,label):
    try:
        result=subprocess.run(arguments,capture_output=True,timeout=30,check=False)
        require(result.returncode==0 and len(result.stdout)<=2_000_000,label)
        return json.loads(result.stdout)
    except HostError:raise
    except Exception:raise HostError(label) from None

def normalized_mount(value):
    value=str(value).replace('\\','/').rstrip('/')
    prefix='/run/desktop/mnt/host/'
    if value.startswith(prefix) and len(value)>len(prefix)+1:
        value=value[len(prefix)].upper()+':'+value[len(prefix)+1:]
    return value.casefold()

def tmpfs_options(value):
    out={}
    for item in value.split(','):
        key,_,val=item.partition('=')
        if key=='mode':val=str(int(val,8))
        out[key]=val
    return out

def verify_runtime_snapshot(snapshot,root,compose,correction,receipt,seccomp):
    require(snapshot.get('endpoint')==ENDPOINT and snapshot.get('os')=='linux','docker-context')
    require(receipt.get('isolation_passed') is True and receipt.get('proxy_selftest_passed') is True,'E1-isolation-receipt')
    expected_ids=receipt['container_ids_after_E1'];network_ids=correction['existing_networks']
    for role in ['runner','egress']:
        service=compose['services'][role];actual=snapshot['containers'][role];config=actual['Config'];host=actual['HostConfig']
        require(actual['Id']==expected_ids[role] and actual['Image']==correction['existing_containers']['hampton-app-qa-'+role]['image_id'] and config['Image']==service['image'],'runtime-image')
        require(actual['State']['Running'] is True and (role!='egress' or actual['State'].get('Health',{}).get('Status')=='healthy'),'runtime-state')
        require(config['User']=='1000:1000' and config['WorkingDir']==service['working_dir'] and config['Entrypoint']==service['entrypoint'] and (config.get('Cmd') or [])==service.get('command',[]),'runtime-command')
        require(host.get('ReadonlyRootfs') is True and host.get('Privileged') is False and set(host.get('CapDrop') or [])=={'ALL'} and not host.get('CapAdd'),'runtime-privileges')
        security=host.get('SecurityOpt') or []
        require('no-new-privileges:true' in security,'runtime-no-new-privileges')
        require(len(security)==(2 if role=='runner' else 1),'runtime-security-options')
        if role=='runner':
            profile=next((entry[8:] for entry in security if entry.startswith('seccomp=')),None)
            expected_path=str(root/'docs/qa/full-app/runner-correction-e1/seccomp_profile.json')
            if profile and profile.startswith('{'):
                try:require(json.loads(profile)==seccomp,'runtime-seccomp')
                except ValueError:raise HostError('runtime-seccomp') from None
            else:require(profile is not None and normalized_mount(profile)==normalized_mount(expected_path),'runtime-seccomp')
        require(host.get('NetworkMode') not in ('host','none') and not host.get('PidMode') and host.get('IpcMode','private')=='private' and not host.get('UTSMode') and not host.get('CgroupnsMode')=='host','runtime-namespaces')
        require(not host.get('PortBindings') and not host.get('PublishAllPorts') and not host.get('Devices') and not host.get('DeviceRequests') and not host.get('ExtraHosts') and not host.get('VolumesFrom') and not host.get('Links'),'runtime-host-access')
        require(host.get('LogConfig',{}).get('Type')=='none' and host.get('RestartPolicy',{}).get('Name') in ('no','') and host.get('Init') is True,'runtime-persistence')
        memory=2*1024**3 if role=='runner' else 256*1024**2
        require(host.get('Memory')==memory and host.get('MemorySwap')==memory and host.get('PidsLimit')==(256 if role=='runner' else 64) and host.get('NanoCpus')==(2_000_000_000 if role=='runner' else 500_000_000),'runtime-limits')
        expected_mounts={'/work':(root/RUNTIME/'runner-package',False),'/results':(root/RUNTIME/'results',True)} if role=='runner' else {'/policy':(root/RUNTIME/'egress-package',False)}
        mounts=actual.get('Mounts',[])
        require(len(mounts)==len(expected_mounts),'runtime-mounts')
        for mount in mounts:
            expected=expected_mounts.get(mount.get('Destination'))
            require(expected and mount.get('Type')=='bind' and mount.get('RW') is expected[1] and normalized_mount(mount.get('Source'))==normalized_mount(expected[0]),'runtime-mounts')
        expected_tmpfs={entry.split(':',1)[0]:tmpfs_options(entry.split(':',1)[1]) for entry in service['tmpfs']}
        require({name:tmpfs_options(value) for name,value in (host.get('Tmpfs') or {}).items()}==expected_tmpfs,'runtime-tmpfs')
        if role=='runner':require(host.get('Dns')==['127.0.0.1'] and host.get('ShmSize')==512*1024**2,'runtime-dns-shm')
        nets=actual['NetworkSettings']['Networks'];expected_nets={'hampton-app-qa-internal'}|({'hampton-app-qa-outbound'} if role=='egress' else set())
        require(set(nets)==expected_nets,'runtime-networks')
        for name,network in nets.items():
            address='172.30.230.3' if role=='runner' else '172.30.230.2' if name.endswith('internal') else '172.30.231.2'
            require(network.get('NetworkID')==network_ids[name] and network.get('IPAddress')==address,'runtime-network-address')
    for name in ['hampton-app-qa-internal','hampton-app-qa-outbound']:
        network=snapshot['networks'][name];internal=name.endswith('internal')
        require(network['Id']==network_ids[name] and network['Driver']=='bridge' and network['EnableIPv6'] is False and network['Internal'] is internal,'runtime-network-policy')
        subnet='172.30.230.0/28' if internal else '172.30.231.0/28'
        require([item.get('Subnet') for item in network['IPAM']['Config']]==[subnet],'runtime-network-subnet')
        require(set(network.get('Containers') or {})==({expected_ids['runner'],expected_ids['egress']} if internal else {expected_ids['egress']}),'runtime-network-peers')
        options=network.get('Options') or {}
        expected_options={'com.docker.network.enable_ipv4':'true'}
        if internal:expected_options['com.docker.network.bridge.gateway_mode_ipv4']='isolated'
        require(options==expected_options,'runtime-network-options')

def verify_runtime(root):
    compose=load_json(root/'docs/qa/full-app/runner-correction-e1/compose.json')
    correction=load_json(root/'docs/qa/full-app/runner-correction-e1-proposal.json')
    receipt=load_json(root/'docs/qa/full-app/runner-correction-e1-execution.json')
    seccomp=load_json(root/'docs/qa/full-app/runner-correction-e1/seccomp_profile.json')
    snapshot={'endpoint':command_json(['docker','context','inspect',CONTEXT,'--format','{{json .Endpoints.docker.Host}}'],'docker-context'),
        'os':command_json(['docker','--context',CONTEXT,'info','--format','{{json .OSType}}'],'docker-os'),'containers':{},'networks':{}}
    # Never collect Config.Env, process listings or container logs.
    fmt='{"Id":{{json .Id}},"Image":{{json .Image}},"State":{"Running":{{json .State.Running}},"Health":{{json (index .State "Health")}}},"Config":{"Image":{{json .Config.Image}},"User":{{json .Config.User}},"WorkingDir":{{json .Config.WorkingDir}},"Entrypoint":{{json .Config.Entrypoint}},"Cmd":{{json .Config.Cmd}}},"HostConfig":{{json .HostConfig}},"Mounts":{{json .Mounts}},"NetworkSettings":{"Networks":{{json .NetworkSettings.Networks}}}}'
    for role in ['runner','egress']:
        snapshot['containers'][role]=command_json(['docker','--context',CONTEXT,'inspect','hampton-app-qa-'+role,'--format',fmt],'docker-container')
    for name in ['hampton-app-qa-internal','hampton-app-qa-outbound']:
        snapshot['networks'][name]=command_json(['docker','--context',CONTEXT,'network','inspect',name,'--format','{{json .}}'],'docker-network')
    verify_runtime_snapshot(snapshot,root,compose,correction,receipt,seccomp)
    for mounted,reviewed in [
        ('runner-package/idle.mjs','runner/idle.mjs'),('runner-package/isolation.mjs','runner/isolation.mjs'),
        ('egress-package/policy.py','runner/policy.py'),('egress-package/egress_addon.py','runner/egress_addon.py'),
        ('egress-package/proxy_selftest.py','runner-correction-e1/proxy_selftest.py'),
    ]:
        require(digest(regular_bytes(root/RUNTIME/mounted))==digest(regular_bytes(root/'docs/qa/full-app'/reviewed)),'runtime-policy-hash')


def prepare_package(root,approved):
    proposal=load_approved(root,approved)
    with exclusive_lock(root/RUNTIME):
        target=no_reparse(root/RUNTIME/'runner-package/qa-f')
        require(not target.exists(),'stage-exists')
        verify_runtime(root)
        require(target.parent.is_dir(),'runtime-missing')
        try:shutil.copytree(root/WORK/'runner-package',target,symlinks=False)
        except Exception:raise HostError('staging-incomplete-inspect-before-retry') from None
        verify_tree(target,proposal['runner_manifest_data']['files'],proposal['runner_sha256'])
    return {'status':'prepared','build_id':proposal['build_id'],'runner_sha256':proposal['runner_sha256'],'credentials_read':False,'executed':False}


def check_windows_acl(private):
    require(os.name=='nt','windows-acl-required')
    paths=[private.parent,private,*[private/name for name in ['client-id.txt','client-secret.txt','session-secret.txt']]]
    literals=','.join("'"+str(path).replace("'","''")+"'" for path in paths)
    script="""$ErrorActionPreference='Stop';try {$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
foreach($p in @("""+literals+""")) {$i=Get-Item -Force -LiteralPath $p;if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'invalid'};
$a=Get-Acl -LiteralPath $p;$owner=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value;
if($owner-ne $sid -or -not $a.AreAccessRulesProtected -or $a.Access.Count-lt 1){throw 'invalid'};
foreach($r in $a.Access){if($r.IsInherited -or $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value-ne $sid -or $r.AccessControlType-ne 'Allow'){throw 'invalid'}}};
Write-Output '{"valid":true}'}catch{Write-Output '{"valid":false}';exit 1}"""
    encoded=base64.b64encode(script.encode('utf-16le')).decode()
    result=command_json(['powershell.exe','-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],'private-acl')
    require(result=={'valid':True},'private-acl')

def read_private_file(path):
    no_reparse(path)
    require(path.is_file() and path.stat().st_nlink==1 and 0<path.stat().st_size<=1024,'private-file')
    raw=path.read_bytes();no_reparse(path)
    try:return raw.decode('utf-8').strip()
    except UnicodeError:raise HostError('private-file-format') from None

def load_credentials(private):
    no_reparse(private);check_windows_acl(private)
    values={name:read_private_file(private/filename) for name,filename in [('accessClientId','client-id.txt'),('accessClientSecret','client-secret.txt'),('sessionSecret','session-secret.txt')]}
    require(re.fullmatch('[a-f0-9]{64}',values['sessionSecret']),'private-session-format')
    for key in ['accessClientId','accessClientSecret']:
        require(16<=len(values[key])<=512 and all(33<=ord(char)<=126 for char in values[key]),'private-access-format')
    return values

def stop_uncertain_runner(container_id):
    require(isinstance(container_id,str) and re.fullmatch('[a-f0-9]{64}',container_id),'runner-stop-unconfirmed')
    try:
        subprocess.run(['docker','--context',CONTEXT,'stop','--time','10',container_id],capture_output=True,timeout=30,check=False)
    except Exception:pass
    try:
        state=command_json(['docker','--context',CONTEXT,'inspect',container_id,'--format',
            '{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}}}'],'runner-stop-unconfirmed')
        require(state=={'id':container_id,'running':False,'pid':0},'runner-stop-unconfirmed')
    except Exception:raise HostError('runner-stop-unconfirmed') from None

def launch_runner(credentials,run_id,build_id,runner_id):
    require(re.fullmatch('run-[A-Za-z0-9_-]{1,64}',run_id or '') and re.fullmatch('[a-f0-9]{64}',build_id or '')
        and isinstance(runner_id,str) and re.fullmatch('[a-f0-9]{64}',runner_id),'run-input')
    payload=json.dumps({**credentials,'runId':run_id,'buildId':build_id}).encode()
    try:
        result=subprocess.run(['docker','--context',CONTEXT,'exec','-i','--user','1000:1000',runner_id,'node','/work/qa-f/live.mjs'],
            input=payload,capture_output=True,timeout=1800,check=False)
        require(len(result.stdout)<=8192,'runner-summary')
        try:summary=json.loads(result.stdout)
        except (ValueError,UnicodeError):raise HostError('runner-summary') from None
        require(isinstance(summary,dict) and set(summary)=={'passed','runId','api_checks','ui_checks','credentials_removed'},'runner-summary')
        require(summary['runId']==run_id and type(summary['passed']) is bool and type(summary['credentials_removed']) is bool,'runner-summary')
        require(all(type(summary[key]) is int and 0<=summary[key]<=10000 for key in ['api_checks','ui_checks']),'runner-summary')
        require(summary['credentials_removed'] is True,'runner-secret-removal')
        return {'status':'passed' if result.returncode==0 and summary['passed'] else 'failed','run_id':run_id,'build_id':build_id,
            'api_checks':summary['api_checks'],'ui_checks':summary['ui_checks'],'credentials_removed':True}
    except Exception as error:
        label=str(error) if isinstance(error,HostError) else 'runner-execution'
        stop_uncertain_runner(runner_id)
        raise HostError(label+'-runner-stopped') from None
    finally:payload=b''

def audit_runtime(root):
    verify_runtime(root)
    return {'status':'audited','runtime':'E1-configuration-verified','credentials_read':False,'staged':False,'executed':False}

def execute_package(root,approved,run_id):
    require(re.fullmatch('run-[A-Za-z0-9_-]{1,64}',run_id or ''),'run-input')
    proposal=load_approved(root,approved)
    with exclusive_lock(root/RUNTIME):
        verify_tree(root/RUNTIME/'runner-package/qa-f',proposal['runner_manifest_data']['files'],proposal['runner_sha256'])
        verify_runtime(root)
        pending=no_reparse(root/RUNTIME/'.qa-f-in-flight')
        require(not pending.exists(),'previous-run-uncertain')
        credentials=load_credentials(Path.home()/'HamptonQA/full-app-access')
        try:
            with pending.open('x',encoding='utf-8') as marker:
                marker.write(json.dumps({'run_id':run_id,'build_id':proposal['build_id']}))
                marker.flush()
                identity=os.fstat(marker.fileno())
            result=launch_runner(credentials,run_id,proposal['build_id'],proposal['failure_stop_runner']['container_id'])
            remove_owned_file(pending,identity,'pending-ownership-changed')
            return result
        finally:credentials.clear()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation',choices=['audit','prepare','execute'])
    parser.add_argument('--approved-proposal-sha256')
    parser.add_argument('--run-id')
    arguments=parser.parse_args()
    try:
        if arguments.operation=='audit':result=audit_runtime(ROOT)
        elif arguments.operation=='prepare':result=prepare_package(ROOT,arguments.approved_proposal_sha256)
        else:result=execute_package(ROOT,arguments.approved_proposal_sha256,arguments.run_id)
        print(json.dumps(result,separators=(',',':')))
        return 0 if result['status'] in ('audited','prepared','passed') else 1
    except HostError as error:
        print(json.dumps({'status':'blocked','case':str(error)},separators=(',',':')));return 1
    except Exception:
        print('{"status":"blocked","case":"host-preflight"}');return 1

if __name__=='__main__':raise SystemExit(main())
