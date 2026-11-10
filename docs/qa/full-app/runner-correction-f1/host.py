"""F1: canonical existing QA store and owner-only inheritance; no permission changes."""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[4]
ORIGINAL='be67091b22cd5bdcab7d8dd7a91e5d5d6cd8cfbfed0e5011245049ccc6d37f96'
PRIVATE=Path.home().resolve(strict=True)/'HamptonQA/full-app-access'
PRIVATE_SCOPE='canonical-current-user-profile/HamptonQA/full-app-access'
original_host=ROOT/'docs/qa/full-app/publish/runner_host.py'
if hashlib.sha256(original_host.read_bytes()).hexdigest()!='7b272e49eb63aaabb515f16e539336716bdfdb226dc6dbb913e11d6fe829a529':
    raise RuntimeError('Original sealed host hash differs')
spec=importlib.util.spec_from_file_location('qa_f_original_host',original_host)
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)


def check_private_acl(private):
    base.require(os.name=='nt','windows-acl-required')
    base.no_reparse(private)
    for name in ['client-id.txt','client-secret.txt','session-secret.txt']:base.no_reparse(private/name)
    literal="'"+str(private).replace("'","''")+"'"
    script="""$ErrorActionPreference='Stop';try {$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
$private="""+literal+""";
foreach($p in @($private,(Join-Path $private 'client-id.txt'),(Join-Path $private 'client-secret.txt'),(Join-Path $private 'session-secret.txt'))){
$i=Get-Item -Force -LiteralPath $p;if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'invalid'};
$a=Get-Acl -LiteralPath $p;if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value-ne $sid -or $a.Access.Count-lt 1){throw 'invalid'};
if($p-eq $private -and -not $a.AreAccessRulesProtected){throw 'invalid'};
foreach($r in $a.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value-ne $sid -or $r.AccessControlType-ne 'Allow'){throw 'invalid'}}};
Write-Output '{"valid":true}'}catch{Write-Output '{"valid":false}';exit 1}"""
    encoded=base64.b64encode(script.encode('utf-16le')).decode()
    result=base.command_json(['pwsh.exe','-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],'private-acl')
    base.require(result=={'valid':True},'private-acl')


def load_private(private):
    check_private_acl(private)  # Validate all ACLs before reading any value.
    values={name:base.read_private_file(private/filename) for name,filename in [
        ('accessClientId','client-id.txt'),('accessClientSecret','client-secret.txt'),('sessionSecret','session-secret.txt')]}
    base.require(re.fullmatch('[a-f0-9]{64}',values['sessionSecret']),'private-session-format')
    for key in ['accessClientId','accessClientSecret']:
        base.require(16<=len(values[key])<=512 and all(33<=ord(c)<=126 for c in values[key]),'private-access-format')
    return values


def load_correction(root,approved):
    base.require(isinstance(approved,str) and re.fullmatch('[a-f0-9]{64}',approved),'F1-approval-required')
    raw=base.regular_bytes(root/'docs/qa/full-app/runner-correction-f1-proposal.json')
    base.require(base.digest(raw)==approved,'F1-approval-hash')
    try:correction=json.loads(raw)
    except (ValueError,UnicodeError):raise base.HostError('F1-proposal-invalid') from None
    base.require(correction.get('original_F_proposal_sha256')==ORIGINAL and correction.get('private_directory')==PRIVATE_SCOPE,'F1-target')
    rows=base.checked_rows(root,correction.get('files'))
    base.require({'docs/qa/full-app/runner-correction-f1/host.py','tests/test_full_app_qa_runner_f1.py'}<={row['file'] for row in rows},'F1-sealed-files')
    proposal=base.load_approved(root,ORIGINAL)
    return proposal


def audit_private(private=PRIVATE):
    # Resolve no aliases for value reads: only the explicit reviewed canonical directory is used.
    base.no_reparse(private)
    base.require(private==PRIVATE and os.path.samefile(Path.home()/'HamptonQA/full-app-access',private),'F1-profile-identity')
    check_private_acl(private)
    return {'status':'audited','same_existing_QA_store':True,'owner_only_effective_ACLs':True,'credential_values_read':False,'ACL_changes':False}


def execute(root,approved,run_id):
    base.require(re.fullmatch('run-[A-Za-z0-9_-]{1,64}',run_id or ''),'run-input')
    proposal=load_correction(root,approved)
    with base.exclusive_lock(root/base.RUNTIME):
        base.verify_tree(root/base.RUNTIME/'runner-package/qa-f',proposal['runner_manifest_data']['files'],proposal['runner_sha256'])
        base.verify_runtime(root)
        audit_private()
        pending=base.no_reparse(root/base.RUNTIME/'.qa-f-in-flight')
        base.require(not pending.exists(),'previous-run-uncertain')
        credentials=load_private(PRIVATE)
        try:
            with pending.open('x',encoding='utf8') as marker:
                marker.write(json.dumps({'run_id':run_id,'build_id':proposal['build_id']}));marker.flush();identity=os.fstat(marker.fileno())
            result=base.launch_runner(credentials,run_id,proposal['build_id'],proposal['failure_stop_runner']['container_id'])
            base.remove_owned_file(pending,identity,'pending-ownership-changed')
            return result
        finally:credentials.clear()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation',choices=['audit','execute'])
    parser.add_argument('--approved-correction-sha256')
    parser.add_argument('--run-id')
    args=parser.parse_args()
    try:
        if args.operation=='audit':result=audit_private()
        else:result=execute(ROOT,args.approved_correction_sha256,args.run_id)
        print(json.dumps(result,separators=(',',':')))
        return 0 if result['status'] in ['audited','passed'] else 1
    except base.HostError as error:
        print(json.dumps({'status':'blocked','case':str(error)},separators=(',',':')));return 1
    except Exception:
        print('{"status":"blocked","case":"F1-host-check"}');return 1


if __name__=='__main__':raise SystemExit(main())
