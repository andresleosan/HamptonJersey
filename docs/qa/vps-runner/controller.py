"""Fixed QA suites for the central Linux runner; no caller-supplied commands."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess

HERE=Path(__file__).resolve().parent


def module(name,file):
    s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


rt=module('hampton_qa_runtime','runtime.py')
contract=module('hampton_qa_queue','queue.py')


def blocked():
    return dict(status='blocked',run_id=None,build_id=None,api_checks=0,ui_checks=0,credentials_removed=False,evidence_sha256=None)


def require_supervisor(cgroup,invocation):
    rt.require(isinstance(invocation,str) and re.fullmatch('[a-f0-9]{32}',invocation) and any(line.split(':',2)[-1].strip().endswith('/hampton-qa-queue.service') for line in cgroup.splitlines()),'systemd-supervisor-required')


def preflight(manifest,receipt):
    rt.require(os.name=='posix' and os.geteuid()==0,'controller-UID')
    rt.require(receipt.get('isolation_passed') is True and receipt.get('manifest_sha256')==rt.digest(rt.regular(HERE/'manifest.json')),'isolation-receipt')
    proof=json.loads(rt.regular(rt.BASE/'control/pc-runner-stop.json'))
    rt.require(proof=={'container_id':'a22cfa82aff4423614f95097d12d56ca57629edb4e99a008b685234eb799408d','running':False,'pid':0},'PC-runner-stop-proof')
    compose=json.loads(rt.regular(HERE/'compose.json'));seccomp=json.loads(rt.regular(HERE/'policy/seccomp_profile.json'))
    rt.verify_payload(HERE,manifest,'runner-package',rt.BASE/'runtime/runner-package')
    rt.verify_payload(HERE,manifest,'egress-package',rt.BASE/'runtime/egress-package')
    rt.validate_runtime(rt.snapshot(),compose,receipt,seccomp)


def stop_runner(receipt):
    identifier=receipt['container_ids']['runner'];rt.require(re.fullmatch('[a-f0-9]{64}',identifier),'stop-ID')
    try:rt.docker(['stop','--time','10',identifier],timeout=30)
    except Exception:pass
    state=rt.docker_json(['inspect',identifier,'--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}}}'])
    rt.require(state=={'id':identifier,'running':False,'pid':0},'stop-unconfirmed')


def safe_evidence(raw,job,actor,manifest):
    def checks(group):
        result=[]
        for c in raw.get(group,{}).get('checks',[]):
            name=c.get('case','');rt.require(isinstance(name,str) and re.fullmatch('[A-Za-z0-9_:+./-]{1,240}',name),'case-label')
            row={'case':name,'passed':c.get('passed') is True}
            failure=c.get('failure')
            if isinstance(failure,str) and re.fullmatch('[A-Za-z0-9_-]{1,64}',failure):row['failure']=failure
            result.append(row)
        return result
    network=raw.get('network',{})
    rt.require(set(network)=={'off_origin_attempts','redirects','transport_failures'} and all(type(n) is int and 0<=n<=100000 for n in network.values()),'network-evidence')
    cleanup=raw.get('api',{}).get('cleanup',{})
    cleaned=not cleanup.get('errors') and all(not cleanup.get(k,{}).get('created') or cleanup[k].get('deleted') is True for k in ['listing','media','user'])
    return {'v':1,'actor':actor,'suite':job['suite'],'task':job['task'],'source_sha':manifest.get('source_sha'),'manifest_sha256':manifest.get('_manifest_sha256'),
        'build_id':raw.get('build_id'),'run_id':raw.get('runId'),'runner_package_sha256':manifest.get('runner_package_sha256'),
        'api':checks('api'),'ui':checks('ui'),'network':network,'credentials_removed':raw.get('credentials_removed') is True,
        'owned_entity_cleanup_verified':cleaned,'provider_integrations':'simulated-or-disabled',
        'scope':'general-baseline' if job['suite']=='smoke' else 'SPR-02-B-existing-fixture-readonly',
        'limits':['Not proof of all workflows','No production verification','Synthetic audit and maintenance rows may remain']}


def execute_job(job,actor,manifest,receipt):
    if job.get('source_sha')!=manifest['source_sha']:return blocked()
    rt.require(actor in ['hermes1','hermes2','codex'] and re.fullmatch('[a-f0-9]{32}',job.get('id','')) and job.get('suite') in ['smoke','history-b'],'job-target')
    rt.require(job['suite']!='history-b' or job.get('task')=='SPR-02','history-task-target')
    try:preflight(manifest,receipt)
    except Exception:return blocked()  # No identity was read and no application process started.
    credentials=rt.load_identity();payload=b''
    run_id='run-'+actor+'-'+job['id']
    try:
        payload=json.dumps({**credentials,'runId':run_id,'buildId':manifest['build_id']}).encode()
        command=['docker','--config',str(rt.BASE/'docker-config'),'--host',rt.ENDPOINT,'exec','-i','--user','1000:1000',receipt['container_ids']['runner'],'node','/work/vps-live.mjs',job['suite']]
        result=subprocess.run(command,input=payload,capture_output=True,timeout=1800,check=False)
        rt.require(len(result.stdout)<=8192,'runner-summary')
        summary=json.loads(result.stdout)
        rt.require(set(summary)=={'passed','runId','api_checks','ui_checks','credentials_removed'} and type(summary['passed']) is bool and summary['runId']==run_id and summary['credentials_removed'] is True,'runner-summary')
        rt.require(all(type(summary[k]) is int and 0<=summary[k]<=100000 for k in ['api_checks','ui_checks']),'runner-counts')
        raw=json.loads(rt.regular(rt.BASE/'runtime/results'/('full-app-'+run_id+'.json'),2*1024*1024))
        rt.require(raw.get('runId')==run_id and raw.get('build_id')==manifest['build_id'] and raw.get('suite')==job['suite'] and raw.get('credentials_removed') is True,'runner-evidence')
        evidence=safe_evidence(raw,job,actor,manifest)
        rt.require(evidence['owned_entity_cleanup_verified'],'cleanup-unconfirmed')
        rt.require(len(evidence['api'])==summary['api_checks'] and len(evidence['ui'])==summary['ui_checks'],'runner-counts')
        passed=result.returncode==0 and summary['passed'] and raw.get('passed') is True and all(c['passed'] for c in evidence['api']+evidence['ui']) and not any(evidence['network'].values())
        evidence['passed']=passed
        data=(json.dumps(evidence,sort_keys=True,separators=(',',':'))+'\n').encode();folder=rt.BASE/'control/evidence'
        folder.mkdir(mode=0o700,exist_ok=True)
        target=folder/(actor+'-'+job['id']+'.json')
        with target.open('xb') as output:os.chmod(target,0o600);output.write(data)
        # Share only this filtered evidence; never the raw browser/transport output.
        with contract.Directory(Path(manifest['actor_roots'][actor])/'results',private='readable') as directory:
            directory.write(job['id']+'.evidence.json',data,mode=0o644)
        return dict(status='passed' if passed else 'failed',run_id=run_id,build_id=manifest['build_id'],api_checks=len(evidence['api']),ui_checks=len(evidence['ui']),credentials_removed=True,evidence_sha256=rt.digest(data))
    except Exception:
        try:stop_runner(receipt)
        finally:raise contract.ExecutionUncertain('QA execution requires inspection') from None
    finally:credentials.clear();payload=b''


def emergency_stop(receipt):
    """systemd ExecStopPost: a killed host CLI must not leave docker exec running."""
    database=rt.BASE/'control/journal.sqlite3'
    if not database.exists():return
    with sqlite3.connect(database) as db:active=db.execute("SELECT 1 FROM jobs WHERE phase IN ('running','uncertain') LIMIT 1").fetchone()
    active=active or (rt.BASE/'control/uncertain').exists()
    if active:
        marker=rt.BASE/'control/uncertain'
        if not marker.exists():
            with marker.open('xb') as f:os.chmod(marker,0o600);f.write(b'Controller interrupted; inspect before any further run.\n')
        stop_runner(receipt)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation',choices=['work','emergency-stop'])
    parser.add_argument('--approved-manifest-sha256',required=True)
    args=parser.parse_args()
    try:
        manifest=rt.load_manifest(HERE,args.approved_manifest_sha256)
        receipt=json.loads(rt.regular(rt.BASE/'control/install-receipt.json'))
        if args.operation=='emergency-stop':emergency_stop(receipt);result={'emergency_check':'complete'}
        else:
            require_supervisor(Path('/proc/self/cgroup').read_text(),os.environ.get('INVOCATION_ID'))
            roots={k:Path(v) for k,v in manifest['actor_roots'].items()}
            result=contract.run_pending(roots,rt.BASE/'control',lambda job,actor:execute_job(job,actor,manifest,receipt))
        print(json.dumps(result));return 0
    except Exception:
        print('{"status":"blocked","case":"QA-controller-check"}');return 1


if __name__=='__main__':raise SystemExit(main())
