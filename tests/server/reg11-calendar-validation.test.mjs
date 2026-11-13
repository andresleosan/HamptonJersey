import test from 'node:test';
import assert from 'node:assert/strict';
import { validateApplicant } from '../../server/applicants.js';
import { makeEnv, call, adminCookie, T0 } from './helpers.mjs';

const form = extra => ({name:'Synthetic applicant',email:'synthetic@example.test',source:'phone',
  operation:'rent',budget_max:2000,...extra});

test('impossible calendar dates return field errors through the panel and public APIs without writes', async () => {
  const env=makeEnv(), cookie=await adminCookie();
  for (const date of ['2026-99-99','2026-13-01','2026-00-01','2026-02-30','2027-02-29']) {
    const panel=await call(env,'POST','/admin/applicants',{cookie,body:form({move_in_date:date})});
    assert.equal(panel.status,400,date); assert.ok(panel.data.fields.move_in_date,date);
    const publicResponse=await call(env,'POST','/applicants',{body:form({move_in_date:date,privacy:true,turnstile:'synthetic'})});
    assert.equal(publicResponse.status,400,date); assert.ok(publicResponse.data.fields.move_in_date,date);
  }
  for(const table of ['contacts','applicants','events'])
    assert.equal(env.DB.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0,table);
});

test('valid dates and leap days pass while impossible dates fail calendar validation', () => {
  const now='2027-01-15T12:00:00.000Z';
  for(const date of ['2027-01-15','2027-12-31','2028-02-29']) {
    const result=validateApplicant(form({move_in_date:date}),{publicForm:false},now);
    assert.equal(result.errors,undefined,date);
    assert.equal(result.value.applicant.move_in_date,date);
  }
  for(const date of ['2027-02-29','2028-02-30','2027-04-31','2027-13-01']) {
    const result=validateApplicant(form({move_in_date:date}),{publicForm:false},now);
    assert.ok(result.errors?.move_in_date,date);
  }
});

test('the panel accepts and saves a valid date within its current window', async () => {
  const env=makeEnv(),cookie=await adminCookie();
  const date=new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10);
  const result=await call(env,'POST','/admin/applicants',{cookie,body:form({move_in_date:date})});
  assert.equal(result.status,201);
  assert.equal(env.DB.raw.prepare('SELECT move_in_date FROM applicants WHERE id=?').get(result.data.id).move_in_date,date);
});

test('the panel preserves a valid past date on unrelated edits but rejects a new past date', async () => {
  const env=makeEnv(),cookie=await adminCookie();
  const created=await call(env,'POST','/admin/applicants',{cookie,body:form({})});
  assert.equal(created.status,201);
  const id=created.data.id;
  env.DB.raw.prepare('UPDATE applicants SET move_in_date=?,updated_at=? WHERE id=?').run('2020-02-29',T0,id);
  const saved=await call(env,'PUT',`/admin/applicants/${id}`,{cookie,body:{updated_at:T0,requirements:'Fixture change',criteria_confirmation:{confirmed:true}}});
  assert.equal(saved.status,200);
  assert.equal(saved.data.applicant.move_in_date,'2020-02-29');
  const invalid=await call(env,'PUT',`/admin/applicants/${id}`,{cookie,body:{updated_at:saved.data.applicant.updated_at,move_in_date:'2026-99-99'}});
  assert.equal(invalid.status,400); assert.ok(invalid.data.fields.move_in_date);
  const rejected=await call(env,'PUT',`/admin/applicants/${id}`,{cookie,body:{updated_at:saved.data.applicant.updated_at,move_in_date:'2019-02-28'}});
  assert.equal(rejected.status,400); assert.ok(rejected.data.fields.move_in_date);
  assert.equal(env.DB.raw.prepare('SELECT move_in_date FROM applicants WHERE id=?').get(id).move_in_date,'2020-02-29');
});
