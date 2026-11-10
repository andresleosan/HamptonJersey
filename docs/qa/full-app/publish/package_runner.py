"""Prepare a sealed local F bundle; never stage into the active runner or read credentials."""
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
WORK = ROOT / 'build/qa-full-app-F'


def inventory(directory):
    rows=[]
    for path in sorted(directory.rglob('*'),key=lambda item:item.relative_to(directory).as_posix()):
        assert not path.is_symlink() and not path.is_junction()
        if not path.is_file(): continue
        data=path.read_bytes()
        rows.append({'file':path.relative_to(directory).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    return rows


def tree_hash(rows):
    return hashlib.sha256(''.join(r['file']+'\0'+str(r['bytes'])+'\0'+r['sha256']+'\n' for r in rows).encode()).hexdigest()


def main():
    target=WORK/'runner-package'
    assert not target.exists(), 'Refuse to overwrite an existing sealed bundle'
    manifest=json.loads((WORK/'build-manifest.json').read_text())
    assert tree_hash(inventory(WORK/'artifact'))==manifest['artifact_sha256']
    target.mkdir()
    for name in ['cases.mjs','ui-cases.mjs','input.mjs','transport.mjs','live.mjs']:
        shutil.copyfile(HERE/'runner'/name,target/name)
    auth=(WORK/'source/server/auth.js').read_bytes()
    assert auth.startswith(b'export async function verifyFirebaseToken(){throw new Error("Provider sign-in disabled in QA");}')
    (target/'auth.mjs').write_bytes(auth)
    shutil.copyfile(HERE.parent/'media/qa-pattern-01.png',target/'qa-pattern-01.png')
    sdk=ROOT/'test-results/qa-agent-runtime/runner-package/node_modules/playwright-core'
    assert json.loads((sdk/'package.json').read_text())['version']=='1.65.0'
    shutil.copytree(sdk,target/'node_modules/playwright-core',symlinks=False)
    rows=inventory(target)
    output={'source_sha':manifest['source_sha'],'build_id':manifest['build_id'],
        'runner_sha256':tree_hash(rows),'files':rows,'canonical_tree_format':manifest['canonical_tree_format'],
        'staged_into_active_runner':False,'real_QA_credentials_read':False}
    (WORK/'runner-manifest.json').write_text(json.dumps(output,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps({'runner_sha256':output['runner_sha256'],'files':len(rows),'bytes':sum(r['bytes'] for r in rows)}))


if __name__=='__main__':main()
