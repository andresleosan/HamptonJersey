"""Restore ignored public QA inputs, without copying profiles, secrets or deployments."""
from pathlib import Path
import argparse,hashlib,json,re,subprocess

ROOT=Path(__file__).resolve().parents[1]

def digest(raw):return hashlib.sha256(raw).hexdigest()

def inputs():
    metadata=json.loads((ROOT/'docs/qa/publication/reconstruction.json').read_text())
    source=subprocess.check_output(['git','show',metadata['source_commit']+':'+metadata['source_file']],cwd=ROOT)
    assert digest(source)==metadata['source_sha256'],'QA baseline differs'
    emails=sorted(set(re.findall(rb'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',source)))
    raw=(ROOT/metadata['template_file']).read_bytes();assert digest(raw)==metadata['template_sha256']
    for row in metadata['references']:
        token=row['token'].encode();assert token in raw
        raw=raw.replace(token,emails[row['source_email_ordinal']])
    assert digest(raw)==metadata['generated_sha256'],'Reconstructed QA overlay differs'
    result=[(metadata['generated_file'],raw)]
    for row in metadata['metadata_files']:
        raw=(ROOT/row['source']).read_bytes();assert digest(raw)==row['sha256']
        if row.get('restore',True):result.append((row['destination'],raw))
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');args=p.parse_args()
    try:
        rows=inputs()
        for name,raw in rows:
            target=ROOT/name
            assert not any(v.is_symlink() or v.is_junction() for v in [target,*target.parents]),'QA destination link'
            if target.exists():assert target.is_file() and target.read_bytes()==raw,'Existing QA input differs; preserve it'
        created=0
        if not args.check:
            for name,raw in rows:
                target=ROOT/name
                if target.exists():continue
                target.parent.mkdir(parents=True,exist_ok=True)
                with target.open('xb') as f:f.write(raw)
                created+=1
        print(json.dumps({'status':'verified' if args.check else 'ready','files':len(rows),'created':created,'remote_operations':False,'identity_values_read':False}));return 0
    except Exception:
        print('{"status":"blocked","case":"preserve-existing-QA-inputs"}');return 1

if __name__=='__main__':raise SystemExit(main())
