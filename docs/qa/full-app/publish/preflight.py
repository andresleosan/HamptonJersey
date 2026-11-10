"""Cloudflare metadata and SELECT-only preflight. No secret values or remote writes."""
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import tomllib
import urllib.request
import urllib.error

ROOT=Path(__file__).resolve().parents[4]
QA_ID='53bc4af9-7250-44fe-8f90-6e415fda1034'
PROJECT='hamptonjersey-qa'


def main():
    scratch=Path(tempfile.mkdtemp(prefix='hampton-F-readonly-'))
    cli=ROOT/'build/qa-full-app-F/source/node_modules/wrangler/bin/wrangler.js'
    env={**os.environ,'WRANGLER_SEND_METRICS':'false','NO_COLOR':'1'}
    def call(args):
        result=subprocess.run(['node',str(cli),'--cwd',str(scratch),*args],capture_output=True,text=True,env=env)
        if result.returncode:raise RuntimeError('Read-only CLI operation failed: '+args[0]+' '+args[1])
        return result.stdout
    def js(args):
        raw=call(args)
        return json.loads(raw)
    databases=js(['d1','list','--json'])
    ids={r['name']:r['uuid'] for r in databases}
    assert ids['hampton-app-qa']==QA_ID
    assert ids['hampton']=='1da41b63-c61f-4491-9f8d-3a9afde6e0fb' and ids['hampton']!=QA_ID
    assert ids['hampton-qa-history']=='9e17c73a-050c-4855-85ea-5b42236a0015'
    deployments=js(['pages','deployment','list','--project-name',PROJECT,'--environment','production','--json'])
    assert len(deployments)==1 and deployments[0]['Branch']=='main' and deployments[0]['Id']=='868e44b9-a426-4613-afe0-137dc36ad475'
    call(['pages','download','config',PROJECT])
    config=tomllib.loads((scratch/'wrangler.toml').read_text())
    prod=config['env']['production'];preview=config.get('env',{}).get('preview',{})
    assert prod['d1_databases']==[{'database_id':QA_ID,'binding':'DB','database_name':'DB'}]
    assert prod['r2_buckets']==[{'bucket_name':'hampton-app-qa-media','binding':'MEDIA'}]
    assert not preview.get('d1_databases') and not preview.get('r2_buckets')
    for name,expected in [('production',['SESSION_SECRET']),('preview',[])]:
        output=call(['pages','secret','list','--project-name',PROJECT,'--env',name])
        names=re.findall(r'^\s+- ([A-Z0-9_]+): Value Encrypted\s*$',output,re.M)
        assert names==expected
    # Explicit config is not an authorization boundary; resolve by name and compare ID first.
    info=js(['d1','info','APP_QA_DB','--config',str(ROOT/'docs/qa/full-app/import-wrangler.toml'),'--json'])
    assert info['uuid']==QA_ID
    query="SELECT (SELECT COUNT(*) FROM qa_app_guard WHERE id=1 AND marker='hampton-app-qa-v1' AND database_id='"+QA_ID+"' AND fixture_version=1) AS guard_ok,(SELECT COUNT(*) FROM admins) AS admins,(SELECT COUNT(*) FROM admins WHERE email='qa-agent@example.test') AS qa_user,(SELECT COUNT(*) FROM notification_cursor WHERE key='queues') AS queues_cursor;"
    data=js(['d1','execute','APP_QA_DB','--config',str(ROOT/'docs/qa/full-app/import-wrangler.toml'),'--remote','--command',query,'--json'])
    state=data[0]['results'][0]
    assert state['guard_ok']==1 and state['admins']==1 and state['qa_user']==1 and state['queues_cursor'] in [0,1]
    dev=call(['r2','bucket','dev-url','get','hampton-app-qa-media'])
    assert 'disabled' in dev.lower()
    domains=call(['r2','bucket','domain','list','hampton-app-qa-media'])
    assert 'there are no custom domains connected to this bucket.' in domains.lower()
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args):return None
    opener=urllib.request.build_opener(NoRedirect)
    checks=[]
    for host in [PROJECT+'.pages.dev','868e44b9.'+PROJECT+'.pages.dev','6323fc32.'+PROJECT+'.pages.dev','qa-access-bootstrap.'+PROJECT+'.pages.dev']:
        for invalid in [False,True]:
            headers={'User-Agent':'Hampton-QA-Access-verification'}
            if invalid:headers.update({'CF-Access-Client-Id':'invalid-qa-preflight','CF-Access-Client-Secret':'invalid-qa-preflight'})
            try:
                with opener.open(urllib.request.Request('https://'+host+'/access-check.txt',headers=headers),timeout=20) as response:status=response.status
            except urllib.error.HTTPError as error:status=error.code
            assert status==403
            checks.append({'host':host,'invalid_identity':invalid,'status':status})
    output={'verified_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'metadata-and-SELECT-only',
        'project':PROJECT,'production_branch':'main','current_QA_deployment':deployments[0]['Id'],
        'database_name':'hampton-app-qa','database_id':QA_ID,'enterprise_D1_is_distinct':True,
        'production_bindings_verified':True,'production_secret_names':['SESSION_SECRET'],'preview_D1_R2_secrets':0,
        'guard_and_sole_synthetic_admin':True,'queues_cursor_rows':state['queues_cursor'],'R2_public_access_disabled':True,
        'Access_negative_checks':checks,'secret_values_read':False,'remote_mutations':False}
    (ROOT/'test-results/qa-F-cloudflare-preflight.json').write_text(json.dumps(output,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'preflight':'PASS','negative_Access_checks':len(checks),'queues_cursor_rows':state['queues_cursor'],'remote_mutations':False}))


if __name__=='__main__':main()
