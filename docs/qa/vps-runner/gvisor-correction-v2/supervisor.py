"""Supervised offline probe only; no identity store, shell, Cloudflare or workshop access."""
import argparse,json,os,re,subprocess,time
from pathlib import Path

DOCKER=['/usr/bin/docker','--config','/var/lib/hampton-qa/docker-config','--host','unix:///var/run/docker.sock']
STATE=Path('/var/lib/hampton-qa-gvisor-v2')
CHECKS={'non_root','no_caps','no_new_privileges','oci_seccomp','namespace_sandbox','pid_namespace','network_namespace','seccomp_bpf','seccomp_tsync','renderer','worker','browser_closed','no_network_requests'}

def call(args,timeout=30):return subprocess.run(DOCKER+args,capture_output=True,timeout=timeout,check=False)

def inspect(identifier,approved):
    p=call(['inspect',identifier,'--format','{"id":{{json .Id}},"name":{{json .Name}},"approval":{{json (index .Config.Labels "hampton.qa.gvisor-probe")}},"runtime":{{json .HostConfig.Runtime}},"running":{{json .State.Running}},"pid":{{json .State.Pid}}}'])
    if p.returncode:raise ValueError('probe-inspection')
    value=json.loads(p.stdout)
    if value['id']!=identifier or value['name']!='/hampton-app-qa-chromium-probe-v2' or value['approval']!=approved or value['runtime']!='io.containerd.runsc.v1':raise ValueError('probe-target')
    return value

def stop(identifier,approved):
    value=inspect(identifier,approved)
    if value['running']:
        call(['stop','--time','10',identifier])
        value=inspect(identifier,approved)
    if value['running'] or value['pid']!=0:raise ValueError('probe-stop-unconfirmed')
    return True

def validate_report(data):
    value=json.loads(data)
    if set(value)!={'kind','checks','passed','credentials_loaded','published_requests','failure_phase'} or value['kind']!='offline-gvisor-Chromium-sandbox-probe-v2' or value['credentials_loaded'] is not False or type(value['published_requests'])is not int or value['published_requests']!=0 or type(value['passed'])is not bool:raise ValueError('probe-report')
    if value['failure_phase'] not in [None,'gate','sdk-import','process-boundary','browser-launch','browser-context','sandbox-page','renderer','worker','teardown']:raise ValueError('probe-failure-phase')
    if not isinstance(value['checks'],dict) or set(value['checks'])-CHECKS-{'diagnostic_completed'} or any(type(x)is not bool for x in value['checks'].values()):raise ValueError('probe-checks')
    if value['passed'] and (set(value['checks'])!=CHECKS or not all(value['checks'].values()) or value['failure_phase'] is not None):raise ValueError('probe-incomplete-pass')
    return value

def host_limits(identifier,pid,proc=Path('/proc'),cgroups=Path('/sys/fs/cgroup')):
    if type(pid)is not int or pid<=0:raise ValueError('probe-host-pid')
    expected='/system.slice/docker-'+identifier+'.scope'
    lines=(proc/str(pid)/'cgroup').read_text().splitlines()
    if lines!=['0::'+expected]:raise ValueError('probe-host-cgroup')
    binaries=['/opt/hampton-qa-gvisor-probe/release-20261102.0/dist/runsc','/opt/hampton-qa-gvisor-probe/release-20261102.0/dist/gvisor-bin/gvisor_sentry']
    if not any(os.path.samefile(proc/str(pid)/'exe',p) for p in binaries):raise ValueError('probe-host-runtime')
    root=cgroups/expected.lstrip('/')
    cpu=(root/'cpu.max').read_text().split()
    if len(cpu)!=2 or not all(n.isdecimal() for n in cpu) or int(cpu[1])<=0 or int(cpu[0])!=2*int(cpu[1]):raise ValueError('probe-host-cpu-limit')
    values={k:(root/k).read_text().strip() for k in ['memory.max','memory.swap.max','pids.max']}
    if values!={'memory.max':'2147483648','memory.swap.max':'0','pids.max':'256'}:raise ValueError('probe-host-resource-limits')
    return {'verified':True,'sandbox_pid':pid,'cpu_quota':int(cpu[0]),'cpu_period':int(cpu[1]),'memory_max':2147483648,'memory_swap_max':0,'pids_max':256}

def save_document(name,value):
    fd=os.open(STATE/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f:json.dump(value,f);f.flush();os.fsync(f.fileno())

def safe_failure(error):
    fixed={'probe-already-running','probe-inspection','probe-target','probe-host-pid','probe-host-cgroup','probe-host-runtime','probe-host-cpu-limit','probe-host-resource-limits','probe-start-failed','probe-start-timeout','probe-pid-changed','probe-report-size','probe-report','probe-checks','probe-incomplete-pass','probe-failure-phase','probe-stop-unconfirmed'}
    if type(error)is ValueError and str(error) in fixed:return str(error)
    if isinstance(error,json.JSONDecodeError):return 'invalid-json'
    if isinstance(error,subprocess.TimeoutExpired):return 'process-timeout'
    if isinstance(error,PermissionError):return 'permission-denied'
    if isinstance(error,FileNotFoundError):return 'missing-file'
    return 'unexpected-error'

def stderr_classes(raw):
    # Raw bytes stay in memory and never enter a receipt, log, chat or screenshot.
    if len(raw)>65536:return ['diagnostic-output-oversize']
    text=raw.decode('utf8',errors='replace').lower()
    patterns={'permission-denied':['permission denied'],'operation-not-permitted':['operation not permitted'],'missing-module':['cannot find module','err_module_not_found'],'thread-start-failure':['pthread_create','uv_thread_create'],'memory-failure':['heap out of memory','failed to reserve'],'no-usable-sandbox':['no usable sandbox'],'unsupported-runtime-flag':['flag provided but not defined']}
    return sorted(key for key,items in patterns.items() if any(item in text for item in items))

def run(identifier,approved):
    value=None;attach=None;proof=None;failure=None;stdout=b'';stderr=b'';stopped=False;phase='initial-inspection'
    def checkpoint(label):
        save_document('phase-'+label+'.json',{'manifest_sha256':approved,'container_id':identifier,'phase':label})
    checkpoint(phase)
    try:
        initial=inspect(identifier,approved)
        if initial['running']:raise ValueError('probe-already-running')
        phase='start-attach';checkpoint(phase)
        attach=subprocess.Popen(DOCKER+['start','--attach','--interactive',identifier],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        phase='wait-running';checkpoint(phase)
        current=None
        for _ in range(45):
            current=inspect(identifier,approved)
            if current['running'] and current['pid']>0:break
            if attach.poll() is not None:raise ValueError('probe-start-failed')
            time.sleep(1)
        else:raise ValueError('probe-start-timeout')
        phase='host-limits';checkpoint(phase);proof=host_limits(identifier,current['pid'])
        again=inspect(identifier,approved)
        if not again['running'] or again['pid']!=current['pid']:raise ValueError('probe-pid-changed')
        # Chromium is still waiting for this exact stdin token. Release only after host limits.
        phase='release-GO';checkpoint(phase)
        stdout,stderr=attach.communicate(input=b'GO\n',timeout=90)
        phase='parse-report';checkpoint(phase)
        if len(stdout)>16384:raise ValueError('probe-report-size')
        value=validate_report(stdout)
        if attach.returncode:value['passed']=False
    except Exception as error:failure={'phase':phase,'case':safe_failure(error)}
    finally:
        try:stopped=stop(identifier,approved)
        except Exception as error:failure={'phase':'stop','case':safe_failure(error)}
        finally:
            if attach is not None:
                try:
                    if attach.poll() is None:attach.kill()
                    tail_out,tail_err=attach.communicate(timeout=5)
                    stdout=tail_out or stdout;stderr=tail_err or stderr
                except Exception:
                    if failure is None:failure={'phase':'attach-drain','case':'diagnostic-drain-failed'}
    passed=failure is None and stopped and proof is not None and value is not None and value['passed'] is True
    report={'manifest_sha256':approved,'container_id':identifier,'stopped_verified':stopped,'host_cgroup':proof,'probe':value,'failure':failure,'stderr_classes':stderr_classes(stderr),'stdout_bytes':len(stdout),'stderr_bytes':len(stderr),'passed':passed}
    save_document('result.json',report)
    return passed

def main():
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['run','stop']);p.add_argument('--container-id',required=True);p.add_argument('--approved-manifest-sha256',required=True);a=p.parse_args()
    try:
        if os.geteuid()!=0 or not re.fullmatch('[a-f0-9]{64}',a.container_id) or not re.fullmatch('[a-f0-9]{64}',a.approved_manifest_sha256):raise ValueError('probe-input')
        return 0 if (run(a.container_id,a.approved_manifest_sha256) if a.operation=='run' else stop(a.container_id,a.approved_manifest_sha256)) else 1
    except Exception:return 2

if __name__=='__main__':raise SystemExit(main())
