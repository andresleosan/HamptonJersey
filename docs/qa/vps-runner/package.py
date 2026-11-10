"""Build a versioned PUBLIC VPS kit. No keys, SSH writes, pulls or deployment."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tarfile
import tempfile

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]


def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(folder):
    rows=[]
    for p in sorted(folder.rglob('*'),key=lambda p:p.relative_to(folder).as_posix()):
        assert not p.is_symlink() and not p.is_junction()
        if p.is_file():rows.append({'file':p.relative_to(folder).as_posix(),'bytes':p.stat().st_size,'sha256':digest(p)})
    return rows


def main():
    f1=REPO/'docs/qa/full-app/runner-correction-f1/host.py'
    s=importlib.util.spec_from_file_location('f1_public_gate',f1);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
    original=m.load_correction(REPO,'cf8774c6c21f2d6c789c28da989704a78e030a2bfe18c2cbb84c007098ff5a9b')
    store=REPO/'build/qa-vps-packages';store.mkdir(exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='preparing-',dir=store))
    for name in ['runtime.py','controller.py','install.py','queue.py','client.py','compose.json','README.md']:
        shutil.copyfile(HERE/name,stage/name)
    shutil.copytree(REPO/'build/qa-full-app-F/runner-package',stage/'payload/runner-package')
    for name in ['vps-live.mjs','history-b.mjs']:shutil.copyfile(HERE/name,stage/'payload/runner-package'/name)
    for name in ['idle.mjs','isolation.mjs']:shutil.copyfile(REPO/'docs/qa/full-app/runner'/name,stage/'payload/runner-package'/name)
    (stage/'payload/egress-package').mkdir(parents=True);(stage/'policy').mkdir()
    for name in ['policy.py','egress_addon.py']:
        shutil.copyfile(REPO/'docs/qa/full-app/runner'/name,stage/'payload/egress-package'/name)
    shutil.copyfile(REPO/'docs/qa/full-app/runner-correction-e1/proxy_selftest.py',stage/'payload/egress-package/proxy_selftest.py')
    shutil.copyfile(REPO/'docs/qa/full-app/runner-correction-e1/seccomp_profile.json',stage/'policy/seccomp_profile.json')
    rows=inventory(stage);runner=[{**r,'file':r['file'][len('payload/runner-package/'):]} for r in rows if r['file'].startswith('payload/runner-package/')]
    tree=''.join(r['file']+'\0'+str(r['bytes'])+'\0'+r['sha256']+'\n' for r in runner).encode()
    manifest={'operation':'install-central-VPS-QA-runner-and-serialized-Hermes-queues','host':'optimyze-vps-de-prod.tail29c816.ts.net',
        'origin':'https://hamptonjersey-qa.pages.dev','project':'hamptonjersey-qa','D1_id':'53bc4af9-7250-44fe-8f90-6e415fda1034','R2':'hampton-app-qa-media',
        'source_sha':original['source_sha'],'build_id':original['build_id'],'application_artifact_sha256':original['artifact_sha256'],
        'images':{'runner':'mcr.microsoft.com/playwright@sha256:bc4fbb329a25287ed23e9216c97063646abdd1bf2da669a9895fa3e2078b2302',
            'egress':'mitmproxy/mitmproxy@sha256:e2f810b6e618258dd4980716da143c4a8de0edcb3243264baea398e2185bbbfb'},
        'actor_roots':{'hermes1':'/var/lib/docker/volumes/hermes_taller-home/_data/encargos/hampton-qa',
            'hermes2':'/var/lib/docker/volumes/hermes_taller2-home/_data/encargos/hampton-qa','codex':'/var/lib/hampton-qa/actors/codex'},
        'code_directory':'/opt/hampton-qa','state_directory':'/var/lib/hampton-qa','identity_directory':'/etc/hampton-qa/identity',
        'identity_transfer':'only existing QA accessClientId/accessClientSecret/sessionSecret; verified SSH stdin; root0700/0600; no profile transfer',
        'PC_runner_to_stop_before_central_authenticated_tests':'a22cfa82aff4423614f95097d12d56ca57629edb4e99a008b685234eb799408d',
        'runner_package_sha256':hashlib.sha256(tree).hexdigest(),'suites':{'smoke':'general baseline; not proof of an entire task','history-b':'SPR-02 B existing-fixture readonly checks plus local contract evidence'},
        'production_changes':False,'push':False,'Cloudflare_configuration_changes':False,'SQL_import':False,'files':rows}
    (stage/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8',newline='\n')
    sha=digest(stage/'manifest.json');target=store/sha
    assert not target.exists(),'Version already exists; inspect without overwriting'
    stage.rename(target)
    archive=store/(sha+'.tar.gz')
    with archive.open('xb') as stream,gzip.GzipFile(fileobj=stream,mode='wb',mtime=0,filename='') as compressed,tarfile.open(fileobj=compressed,mode='w') as tar:
        for p in sorted(target.rglob('*'),key=lambda p:p.relative_to(target).as_posix()):
            info=tar.gettarinfo(str(p),arcname=p.relative_to(target).as_posix());info.uid=info.gid=0;info.uname=info.gname='';info.mtime=0;info.mode=0o755 if p.is_dir() else 0o644
            if p.is_file():
                with p.open('rb') as f:tar.addfile(info,f)
            else:tar.addfile(info)
    proposal={'manifest_sha256':sha,'archive_sha256':digest(archive),'archive_file':archive.relative_to(REPO).as_posix(),'manifest_file':(target/'manifest.json').relative_to(REPO).as_posix(),'files':len(rows),'bytes':sum(r['bytes'] for r in rows),'authorized':False,'installed':False,'identity_values_read':False}
    (HERE/'proposal.json').write_text(json.dumps(proposal,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(proposal))


if __name__=='__main__':main()
