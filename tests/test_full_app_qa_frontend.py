"""Offline checks for artifact-only frontend transformation; no providers or builds."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[1]
MODULE = REPO / "docs/qa/full-app/publish/overlay_frontend.py"
ORIGIN = "https://hamptonjersey-qa.pages.dev"


class FrontendOverlayTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MODULE.is_file(), "Artifact-only frontend overlay is not implemented")
        spec = importlib.util.spec_from_file_location("qa_frontend", MODULE)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "source"
        for folder in ("site", "admin", "server", "shared"):
            shutil.copytree(REPO / folder, self.root / folder,
                            ignore=shutil.ignore_patterns("node_modules", "__pycache__", "admin")
                            if folder == "site" else shutil.ignore_patterns("node_modules", "__pycache__"))

    def apply(self):
        return self.module.apply_frontend(self.root)

    def test_overlay_never_changes_original_sources_or_accepts_repository_root(self):
        watched = [REPO / p for p in ("site/index.html", "site/data/team.json", "admin/src/firebase.js", "admin/src/App.jsx")]
        before = [hashlib.sha256(p.read_bytes()).hexdigest() for p in watched]
        self.apply()
        self.assertEqual(before, [hashlib.sha256(p.read_bytes()).hexdigest() for p in watched])
        with self.assertRaises(ValueError):
            self.module.apply_frontend(REPO)

    def test_public_metadata_and_assets_are_fictional_and_same_origin(self):
        self.apply()
        page = (self.root / "site/index.html").read_text(encoding="utf-8")
        self.assertIn(f'content="{ORIGIN}"', page)
        self.assertIn('name="robots" content="noindex, nofollow"', page)
        self.assertIn('src="/qa-runtime.js"', page)
        self.assertNotIn('application/ld+json', page)
        self.assertNotIn('fonts.googleapis.com', page)
        self.assertNotIn('challenges.cloudflare.com', page)
        self.assertNotIn('fetch("/api/stats"', page)
        self.assertIn('id="qa-environment"', page)
        teams = json.loads((self.root / "site/data/team.json").read_text())
        self.assertEqual([t['name'] for t in teams], ['QA Negotiator 01', 'QA Negotiator 02'])
        for member in teams:
            self.assertIsNone(member['phone'])
            self.assertIsNone(member['office'])
            self.assertTrue((self.root / 'site' / member['photo'].lstrip('/')).is_file())
        for original in ('og-image.jpg', 'favicon.ico', 'apple-touch-icon.png'):
            self.assertFalse((self.root / 'site' / original).exists(), original)
        allowed = {(REPO / f'docs/qa/full-app/media/qa-pattern-{n:02}.png').read_bytes() for n in range(1, 4)}
        for image in (self.root / 'site').rglob('*.png'):
            self.assertIn(image.read_bytes(), allowed)

    def test_original_team_values_do_not_survive_in_frontend_text(self):
        self.apply()
        text = '\n'.join(p.read_text(encoding='utf-8') for folder in ('site', 'admin')
                         for p in (self.root / folder).rglob('*')
                         if p.is_file() and p.suffix in ('.js', '.jsx', '.html', '.json', '.txt'))
        original_team = json.loads((REPO / 'site/data/team.json').read_text())
        for member in original_team:
            for key in ('name', 'phone', 'office', 'photo'):
                value = member.get(key)
                if value:
                    self.assertNotIn(value, text)
        self.assertNotRegex(text, r'[A-Za-z0-9._%+-]+@(?!example\.test)[A-Za-z0-9.-]+\.[A-Za-z]{2,}')

    def test_auth_provider_removed_and_actual_full_app_kept(self):
        self.apply()
        firebase = (self.root / 'admin/src/firebase.js').read_text()
        login = (self.root / 'admin/src/Login.jsx').read_text()
        main = (self.root / 'admin/src/main.jsx').read_text()
        self.assertNotIn('firebase/', firebase)
        self.assertNotIn('apiKey', firebase)
        self.assertNotIn('googleIdToken()', login)
        self.assertNotIn('Sign in with Google', login)
        self.assertNotIn('QaHistoryApp', main)
        self.assertFalse((self.root / 'admin/src/QaHistoryApp.jsx').exists())
        self.assertIn('import("./App.jsx")', main)
        self.assertIn('ListingEditor', (self.root / 'admin/src/App.jsx').read_text())
        self.assertIn('History', (self.root / 'admin/src/ListingHistory.jsx').read_text())

    def test_generated_classic_and_module_scripts_remain_parseable(self):
        self.apply()
        import re
        page = (self.root / 'site/index.html').read_text()
        scripts = re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', page, re.S)
        sources = [(f'inline script {i}', code) for i, code in enumerate(scripts) if code.strip()]
        sources += [(str(path.relative_to(self.root)), path.read_text())
                    for folder in ('site', 'admin') for path in (self.root / folder).rglob('*')
                    if path.suffix in ('.js', '.mjs')]
        for name, code in sources:
            result = subprocess.run(['node', '--input-type=module', '--check'], input=code, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, f'{name}: {result.stderr}')

    def test_home_copy_makes_no_real_team_or_business_history_claims(self):
        self.apply()
        page = (self.root / 'site/index.html').read_text()
        for phrase in ('since 1982', 'in 1982', 'Founded ', 'generations of Jersey families', 'Discreet, personal advice'):
            self.assertTrue(phrase not in page, f'Original business claim retained: {phrase}')

    def test_dynamic_seo_stays_fictional_noindex_and_uses_existing_png(self):
        self.apply()
        script = r'''
const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
(async()=>{
  const seo=await import(pathToFileURL(process.argv[1]));
  const origin='https://hamptonjersey-qa.pages.dev';
  const request=new Request(origin+'/properties');
  const page=seo.propertiesPage(request,{SITE_URL:origin});
  assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
  assert.ok(page.head.includes('name="robots" content="noindex, nofollow"'));
  assert.ok(page.title.includes('Fictional QA Estates'));
  assert.ok(page.head.includes(origin+'/qa-assets/qa-pattern-03.png'));
  assert.ok(!page.head.includes('/og-image.jpg'));
  assert.ok(!page.head.includes('since 1982'));
  assert.ok(!page.head.includes('country house'));
  const p={id:'HE-Q001',title:'QA Fictional Property',place:'QA fixture',region:'jersey',operation:'sale',currency:'GBP',salePrice:500000,
    summary:[],description:['Synthetic fixture.'],thumb:'/media/QAM00001?thumb',image:'/media/QAM00001',photos:[{src:'/media/QAM00001',alt:'QA pattern'}]};
  const m=seo.listingMeta(p,origin);
  assert.ok(m.title.endsWith('Fictional QA Estates'));
  assert.equal(m.canonical,origin+'/p/HE-Q001');
  assert.equal(JSON.parse(m.jsonLd).name,'QA Fictional Property');
  assert.ok(seo.robotsTxt(origin).includes('Disallow: /\n'));
})().catch(e=>{console.error(e);process.exitCode=1});
'''
        result = subprocess.run(['node', '-e', script, str(self.root / 'server/seo.js')], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_csp_blocks_external_connections_and_frames(self):
        self.apply()
        headers = (self.root / 'site/_headers').read_text()
        for rule in ("connect-src 'self'", "frame-src 'none'", "object-src 'none'", "form-action 'self'", "base-uri 'self'", "font-src 'self'"):
            self.assertIn(rule, headers)
        self.assertIn('X-Robots-Tag: noindex, nofollow', headers)
        self.assertNotIn('HE-C', (self.root / 'site/_redirects').read_text())

    def test_simulator_renders_resets_removes_and_rejects_other_hosts(self):
        self.apply()
        runtime = self.root / 'site/qa-runtime.js'
        script = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[1],'utf8');
function run(origin){
  const events={}, nodes=[];
  const document={addEventListener:(name,fn)=>events[name]=fn,querySelectorAll:()=>[],
    createElement:tag=>({tag,children:[],append(...xs){this.children.push(...xs)},remove(){this.removed=true}})};
  const window={open(){throw Error('native open should not be reached')}};
  const ctx={window,document,location:new URL(origin),URL,Map,queueMicrotask,MutationObserver:class{observe(){}},console};
  vm.runInNewContext(source,ctx);
  return {window,events,document};
}
const env=run('https://hamptonjersey-qa.pages.dev/');
const container={children:[],append(...xs){this.children.push(...xs)}};
let token=null;const id=env.window.turnstile.render(container,{callback:t=>token=t});
assert.equal(env.window.turnstile.getResponse(id),'qa-simulated-antispam');
assert.equal(container.children.find(n=>n.name==='cf-turnstile-response').value,'qa-simulated-antispam');
assert.ok(container.children.some(n=>String(n.textContent).includes('QA simulator')));
env.window.turnstile.reset(id);assert.equal(env.window.turnstile.getResponse(id),'qa-simulated-antispam');
env.window.turnstile.remove(id);assert.equal(env.window.turnstile.getResponse(id),'');
const blocked=run('https://unapproved.pages.dev/');
assert.equal(blocked.window.turnstile,undefined);
for(const href of ['https://external.example.test/','tel:123','mailto:person@example.test','javascript:alert(1)','//external.example.test/']){
  let prevented=false;const a={href,getAttribute:()=>href,setAttribute(){},removeAttribute(){}};
  env.events.click({target:{closest:()=>a},preventDefault(){prevented=true},stopImmediatePropagation(){}});
  assert.equal(prevented,true,href);
}
let prevented=false;env.events.click({target:{closest:()=>({href:'/properties',getAttribute:()=>'/properties'})},preventDefault(){prevented=true},stopImmediatePropagation(){}});
assert.equal(prevented,false);
assert.equal(env.window.open('https://external.example.test/'),null);
setImmediate(()=>assert.equal(token,'qa-simulated-antispam'));
'''
        result = subprocess.run(['node', '-e', script, str(runtime)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_unknown_source_drift_stops_instead_of_silently_missing_overlay(self):
        path = self.root / 'site/index.html'
        path.write_text(path.read_text().replace('const track = (id, metric) => {', 'const track = function(id, metric) {'))
        with self.assertRaisesRegex(ValueError, 'track'):
            self.apply()


if __name__ == '__main__':
    unittest.main()
