import {spawnSync} from 'node:child_process';
import {mkdirSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const check=spawnSync(process.execPath,[join(root,'scripts/plan-packages.mjs'),'--check'],{cwd:root,stdio:'pipe'});
if(check.status!==0)throw Error('Public package metadata does not match the catalog; run npm run check:packages.');
const output=join(root,'coordination/public-board');mkdirSync(output,{recursive:true});
for(const [from,to] of [['tablero-publico.html','index.html'],['tablero-publico.js','tablero-publico.js'],['equipo.css','equipo.css'],['tablero-publico.css','tablero-publico.css'],['paquetes.json','paquetes.json']])copyFileSync(join(root,'docs/roadmap',from),join(output,to));
console.log('Public board assets built: HTML, JavaScript, CSS and public package metadata only.');

if(process.argv.includes('--dry-run')) {
  const result=spawnSync(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'deploy','--config',join(root,'coordination/wrangler.public.toml'),'--dry-run','--outdir',join(root,'coordination/build-public')],{cwd:root,stdio:'inherit'});
  process.exitCode=result.status??1;
}
