import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {signSession,readSession,currentAdmin,COOKIE} from '../build/qa-full-app-F/runner-package/auth.mjs';

test('runner uses original session implementation without provider sign-in',async()=>{
  const source=await fs.readFile(new URL('../server/auth.js',import.meta.url),'utf8');
  const bundle=await fs.readFile(new URL('../build/qa-full-app-F/runner-package/auth.mjs',import.meta.url),'utf8');
  assert.equal(bundle.split('export const COOKIE =')[1],source.replaceAll('\r\n','\n').split('export const COOKIE =')[1]);
});

test('QA session rejects another key, expiry, tampering and revoked membership',async()=>{
  const secret='a'.repeat(64),now=1000000,email='qa-agent@example.test';
  const cookie=await signSession(email,secret,now);
  assert.equal(await readSession(cookie,secret,now),email);
  assert.equal(await readSession(cookie,'b'.repeat(64),now),null);
  assert.equal(await readSession(cookie,secret,now+8*3600e3),null);
  assert.equal(await readSession(cookie+'x',secret,now),null);
  const currentCookie=await signSession(email,secret);
  const request=new Request('https://hamptonjersey-qa.pages.dev/api/me',{headers:{cookie:`${COOKIE}=${currentCookie}`}});
  let member=true;
  const env={SESSION_SECRET:secret,DB:{prepare(sql){assert.equal(sql,'SELECT 1 FROM admins WHERE email = ?');return{bind(value){assert.equal(value,email);return{first:async()=>member?{ok:1}:null}}}}}};
  assert.equal(await currentAdmin(request,env),email);member=false;
  assert.equal(await currentAdmin(request,env),null);
});
