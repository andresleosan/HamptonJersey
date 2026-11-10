"""Freeze reviewed local F files for a later, explicit authorization. No execution."""
import hashlib
import json
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
WORK=ROOT/'build/qa-full-app-F'
SHA='80ad03df7e095750f455aa4aa668573e9aac5db4'


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==SHA
    assert not subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=ROOT,text=True).strip()
    proposal_file=HERE.parent/'publish-proposal.json'
    assert not proposal_file.exists(), 'Refuse to replace an approval proposal'
    build=json.loads((WORK/'build-manifest.json').read_text())
    runner=json.loads((WORK/'runner-manifest.json').read_text())
    receipt=json.loads((HERE.parent/'runner-correction-e1-execution.json').read_text())
    assert runner['source_sha']==build['source_sha']==SHA and runner['build_id']==build['build_id']
    # Full verification before sealing; functions perform no credential or remote reads.
    import runner_host
    runner_host.verify_tree(WORK/'artifact',build['files'],build['artifact_sha256'])
    runner_host.verify_tree(WORK/'runner-package',runner['files'],runner['runner_sha256'])
    names={p.relative_to(ROOT).as_posix() for p in HERE.rglob('*') if p.is_file() and p.suffix in ['.py','.mjs','.sql','.json','.md']}
    names|=set(runner_host.REQUIRED_REVIEWED)
    names|={'build/qa-full-app-F/build-manifest.json','build/qa-full-app-F/runner-manifest.json',
        'docs/qa/full-app/import-wrangler.toml','docs/qa/full-app/manifest.json','docs/qa/full-app/setup.sql',
        'docs/qa/full-app/import-readback.json','docs/qa/full-app/media-upload-receipt.json',
        'docs/superpowers/specs/2026-11-09-full-app-qa-design.md','docs/superpowers/plans/2026-11-10-full-app-qa-step-f.md'}
    names|={p.relative_to(ROOT).as_posix() for p in (ROOT/'tests').glob('*full*app*qa*') if p.is_file()}
    rows=[{'file':name,'bytes':(ROOT/name).stat().st_size,'sha256':sha(ROOT/name)} for name in sorted(names)]
    prerequisite='docs/qa/full-app/publish/prerequisite.sql'
    output={'operation':'F-publish-exact-QA-artifact-and-run-isolated-synthetic-smoke',
        'source_sha':SHA,'build_id':build['build_id'],'artifact_sha256':build['artifact_sha256'],'runner_sha256':runner['runner_sha256'],
        'destination':{'pages_project':'hamptonjersey-qa','pages_environment':'Production','branch':'main',
            'origin':'https://hamptonjersey-qa.pages.dev','D1':'hampton-app-qa','D1_id':'53bc4af9-7250-44fe-8f90-6e415fda1034',
            'R2':'hampton-app-qa-media','test_identity':'qa-agent@example.test'},
        'artifact_manifest':{'file':'build/qa-full-app-F/build-manifest.json','sha256':sha(WORK/'build-manifest.json')},
        'runner_manifest':{'file':'build/qa-full-app-F/runner-manifest.json','sha256':sha(WORK/'runner-manifest.json')},
        'prerequisite_sql':{'file':prerequisite,'sha256':sha(ROOT/prerequisite),'database_name':'hampton-app-qa',
            'database_id':'53bc4af9-7250-44fe-8f90-6e415fda1034','operation':'insert queues cursor if absent; guard-gated; no overwrite or reset'},
        'runner':{'docker_context':'desktop-linux','container':'hampton-app-qa-runner','reuse_E1_images_networks_mounts':True,
            'stage_only':'/work/qa-f','credentials':'existing QA-only files; private ACL check; stdin to owned tmpfs file 0600',
            'cleanup':'supported APIs; only owned run listing/media/temporary user; retain synthetic audit/email/maintenance rows'},
        'failure_stop_runner':{'container_id':receipt['container_ids_after_E1']['runner'],'timeout_seconds':10},
        'failure_policy':'stop only the sealed runner on uncertain execution; verify stopped; keep sentinel; no automatic retry/recreate/reset',
        'coverage':{'local_API':71,'local_UI':66,'published_smoke_executed':False,'provider_integrations':'simulated or disabled',
            'limits':['UI render/layout rather than all workflows','Drive descriptor only in initial smoke','Hermes initial smoke skipped',
                'scheduled invocation does not prove each swallowed subjob succeeded','large catalog branch not covered','native Pages ASSETS router pending published smoke']},
        'requires_written_authorization':['exact SQL hash and D1 UUID','exact artifact/proposal hashes to named QA Pages plus isolated test and failure-stop scope'],
        'authorized':False,'deployed':False,'real_QA_credential_values_read':False,'production_mutations':False,'git_push':False,
        'files':rows}
    proposal_file.write_text(json.dumps(output,indent=2)+'\n',encoding='utf8',newline='\n')
    runner_host.load_approved(ROOT,sha(proposal_file))
    print(json.dumps({'proposal_sha256':sha(proposal_file),'sealed_files':len(rows),'artifact_sha256':build['artifact_sha256'],'runner_sha256':runner['runner_sha256'],'sql_sha256':sha(ROOT/prerequisite)}))


if __name__=='__main__':main()
