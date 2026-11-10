"""Build only the separate QA artifact. Never deploy or contact Cloudflare resources."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
WORK = ROOT / 'build/qa-full-app-F'
SOURCE = WORK / 'source'
ARTIFACT = WORK / 'artifact'
SHA = '80ad03df7e095750f455aa4aa668573e9aac5db4'


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def remove_owned(path):
    resolved = path.resolve()
    if not resolved.is_relative_to(WORK.resolve()) or resolved == WORK.resolve() or path.is_symlink() or path.is_junction():
        raise ValueError('Refuse unsafe build cleanup')
    if path.exists():
        shutil.rmtree(path)


def build():
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip() == SHA
    assert not subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=ROOT,text=True).strip()
    assert SOURCE.is_dir() and (SOURCE / 'node_modules/vite/package.json').is_file(), 'Prepare exact-lock QA dependencies first'
    for name in ['package.json', 'package-lock.json']:
        assert (SOURCE / name).read_bytes() == (ROOT / name).read_bytes()
    files = subprocess.check_output(['git','ls-files','--','admin','site','server','shared','functions'],cwd=ROOT,text=True).splitlines()
    for folder in ['admin','site','server','shared','functions']:
        remove_owned(SOURCE / folder)
    for name in files:
        path = Path(name)
        assert not path.is_absolute() and '..' not in path.parts and not (ROOT / path).is_symlink()
        assert path.parts[0] in ['admin','site','server','shared','functions']
        assert path.name not in ['.dev.vars','.env','.npmrc']
        target = SOURCE / path
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes((ROOT / path).read_bytes())
    front = load('overlay_frontend').apply_frontend(SOURCE)
    back = load('overlay_backend').apply_backend(SOURCE)
    # Preserve the existing HMAC session functions byte-for-byte; omit provider verification.
    auth = (SOURCE / 'server/auth.js').read_text(encoding='utf8')
    assert auth.count('export const COOKIE =') == 1
    tail = auth.split('export const COOKIE =',1)[1]
    (SOURCE / 'server/auth.js').write_text(
        'export async function verifyFirebaseToken(){throw new Error("Provider sign-in disabled in QA");}\n'
        + 'export const COOKIE =' + tail, encoding='utf8', newline='\n')
    api = (SOURCE / 'server/api.js').read_text(encoding='utf8')
    old = 'import { qaRoute } from "./qa-history.js";'
    branch = 'if (segments[0] === "qa") return await qaRoute({request, env, path, segments});'
    assert old in api and branch in api and 'console.error(e);' in api
    api = api.replace(old,'').replace(branch,'if (segments[0] === "qa") fail(404,"Not found");').replace('console.error(e);','console.error("QA handler failed");')
    (SOURCE / 'server/api.js').write_text(api,encoding='utf8',newline='\n')
    for folder in ['server','functions']:
        for path in (SOURCE / folder).rglob('*.js'):
            text = path.read_text(encoding='utf8')
            for domain in ['https://www.hamptonestatesjersey.com','https://hamptonestatesjersey.com']:
                text = text.replace(domain,'https://hamptonjersey-qa.pages.dev')
            path.write_text(text,encoding='utf8',newline='\n')
    (SOURCE / 'qa-boundary.mjs').write_bytes((HERE / 'qa-boundary.mjs').read_bytes())
    overlay_names = ['build.py','overlay_frontend.py','overlay_backend.py','qa-boundary.mjs','qa-integrations.mjs']
    overlay_hash = hashlib.sha256(''.join(name+'\0'+hashlib.sha256((HERE/name).read_bytes()).hexdigest()+'\n' for name in overlay_names).encode()).hexdigest()
    build_id = hashlib.sha256((SHA+'\n'+overlay_hash+'\n'+hashlib.sha256((ROOT/'package-lock.json').read_bytes()).hexdigest()).encode()).hexdigest()
    remove_owned(ARTIFACT)
    shutil.copytree(SOURCE / 'site',ARTIFACT)
    (SOURCE / 'admin/qa-vite.config.mjs').write_text('''import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'/admin/',plugins:[react()],
build:{outDir:'''+json.dumps(str(ARTIFACT/'admin'))+''',emptyOutDir:true,sourcemap:false}});
''',encoding='utf8',newline='\n')
    (SOURCE / 'wrangler.toml').write_text('''name = "hamptonjersey-qa"
pages_build_output_dir = "../artifact"
compatibility_date = "2025-10-01"
[[d1_databases]]
binding = "DB"
database_name = "hampton-app-qa"
database_id = "53bc4af9-7250-44fe-8f90-6e415fda1034"
[[r2_buckets]]
binding = "MEDIA"
bucket_name = "hampton-app-qa-media"
''',encoding='utf8',newline='\n')
    env = {k:v for k,v in os.environ.items() if k.upper() in ['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA']}
    env.update(CI='true',WRANGLER_SEND_METRICS='false',WRANGLER_LOG_SANITIZE='true',PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1')
    def run(args,label):
        process = subprocess.run(args,cwd=SOURCE,env=env,capture_output=True,text=True,encoding='utf8',errors='replace')
        if process.returncode:
            (ROOT / ('test-results/qa-F-'+label+'-failure.txt')).write_text(process.stdout+'\n'+process.stderr,encoding='utf8')
            raise RuntimeError(label+' failed; sanitized-build workspace log retained')
    node = shutil.which('node')
    run([node,str(SOURCE/'node_modules/vite/bin/vite.js'),'build','--config',str(SOURCE/'admin/qa-vite.config.mjs')],'vite')
    bundle_dir = SOURCE / 'qa-functions'
    remove_owned(bundle_dir)
    run([node,str(SOURCE/'node_modules/wrangler/bin/wrangler.js'),'pages','functions','build',str(SOURCE/'functions'),'--outdir',str(bundle_dir)],'functions')
    assert (bundle_dir/'index.js').is_file()
    (SOURCE / 'qa-entry.mjs').write_text('''import app from './qa-functions/index.js';
import {createQaWorker} from './qa-boundary.mjs';
import {qaEnvironment,qaSimulation} from './server/qa-integrations.js';
import {currentAdmin} from './server/auth.js';
export default createQaWorker({app,qaEnvironment,qaSimulation,currentAdmin,buildId:'''+json.dumps(build_id)+'''});
''',encoding='utf8',newline='\n')
    (SOURCE / 'qa-bundle.mjs').write_text('''import {build} from 'esbuild';
await build({entryPoints:['qa-entry.mjs'],outfile:'''+json.dumps(str(ARTIFACT/'_worker.js'))+''',bundle:true,format:'esm',platform:'browser',target:'es2022',conditions:['workerd','worker','browser'],sourcemap:false,minify:false});
''',encoding='utf8',newline='\n')
    run([node,str(SOURCE/'qa-bundle.mjs')],'worker')
    (ARTIFACT / '_routes.json').write_text('{"version":1,"include":["/*"],"exclude":[]}\n',encoding='utf8',newline='\n')
    rows=[]
    for path in sorted(ARTIFACT.rglob('*')):
        if not path.is_file(): continue
        name=path.relative_to(ARTIFACT).as_posix()
        assert path.suffix!='.map' and not name.startswith('.') and path.name not in ['wrangler.toml','package-lock.json','.dev.vars']
        data=path.read_bytes()
        if path.suffix in ['.js','.html','.json','.css','.txt']:
            assert b'-----BEGIN PRIVATE KEY' not in data and b'AIza' not in data
            assert b'hamptonestatesjersey.com' not in data and b'hamptonestatesjersey.firebaseapp.com' not in data, 'Business URL remains in QA artifact'
        rows.append({'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    canonical=''.join(x['file']+'\0'+str(x['bytes'])+'\0'+x['sha256']+'\n' for x in rows).encode()
    manifest={'source_sha':SHA,'build_id':build_id,'overlay_sha256':overlay_hash,'dependency_lock_sha256':hashlib.sha256((ROOT/'package-lock.json').read_bytes()).hexdigest(),
              'artifact_directory':str(ARTIFACT),'canonical_tree_format':'UTF-8 sorted relative-path NUL size NUL lowercase-SHA256 LF',
              'artifact_sha256':hashlib.sha256(canonical).hexdigest(),'artifact_bytes':sum(x['bytes'] for x in rows),'files':rows,'frontend':front,'backend':back,
              'destination_project':'hamptonjersey-qa','origin':'https://hamptonjersey-qa.pages.dev','deployed':False,'real_QA_credentials_read':False}
    (WORK/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps({'QA_BUILD':'PASS','source_sha':SHA,'build_id':build_id,'artifact_sha256':manifest['artifact_sha256'],'files':len(rows),'bytes':manifest['artifact_bytes'],'deployed':False}))


if __name__=='__main__':
    build()
