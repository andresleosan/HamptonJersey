import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectOperationPolicySnapshot,proposeOperationPolicyCAS,getOperationPolicy,setOperationPolicy} from '../../server/operation-policy-store.js';
import {inspectOperationGate} from '../../server/operation-policy.js';
import {listAutomationDefinitions} from '../../server/automation-contracts.js';

const ID='listing_text',OP='prepare_draft',GEN='00000000-0000-4000-8000-000000000001';
const row=(over={})=>JSON.stringify({schema:1,automation_id:ID,operation:OP,definition_version:1,mode:'Draft',revision:1,generation:GEN,params:{},...over});
const invalid={state:'invalid',allowed:false};

test('a canonical snapshot is only a candidate and cannot authorize an operation',()=>{
  assert.deepEqual(inspectOperationPolicySnapshot(ID,OP,row()),{state:'candidate',allowed:false,automation_id:ID,operation:OP,
    mode:'Draft',revision:1,generation:GEN,definition_version:1});
  assert.equal(inspectOperationGate(ID,OP,'Auto','perform_operation').allowed,false);
});

test('unknown operations, modes, parameters and malformed or noncanonical JSON fail closed',()=>{
  const cases=[null,'', '{','null','[]','{}',row({mode:'auto'}),row({mode:'Unknown'}),row({revision:0}),
    row({revision:1.5}),row({revision:Number.MAX_SAFE_INTEGER+1}),row({generation:'wrong'}),
    row({definition_version:2}),row({params:{force:true}}),row({params:[]}),row({actor:'fixture'}),
    row({automation_id:'unknown'}),row({operation:'publish'}),` ${row()}`,
    row().replace('"mode":"Draft"','"mode":"Auto","mode":"Draft"')];
  for(const raw of cases)assert.deepEqual(inspectOperationPolicySnapshot(ID,OP,raw),invalid);
  for(const [id,operation] of [['unknown',OP],[ID,'publish'],['__proto__',OP]])
    assert.deepEqual(inspectOperationPolicySnapshot(id,operation,row()),invalid);
});

test('CAS proposals reject stale revisions, keep no-ops inert and never issue authority',()=>{
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Auto',2,GEN,row()),{state:'stale',allowed:false});
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Draft',1,GEN,row()),{state:'no_change',allowed:false});
  const candidate=proposeOperationPolicyCAS(ID,OP,'Approve',1,GEN,row());
  assert.equal(candidate.state,'candidate');assert.equal(candidate.allowed,false);
  assert.equal(candidate.key,'aut10:operation:listing_text:prepare_draft');
  assert.equal(candidate.expected_value,row());
  const next=JSON.parse(candidate.next_value);
  assert.equal(next.revision,2);assert.equal(next.generation,GEN);assert.equal(next.mode,'Approve');
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Unknown',1,GEN,row()),invalid);
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Auto',0,GEN,row()),invalid);
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Auto',1,'invalid',row()),invalid);
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Auto',Number.MAX_SAFE_INTEGER,GEN,row({revision:Number.MAX_SAFE_INTEGER})),invalid);
});

test('actual reads and writes fail closed without touching the supplied environment or actor',async()=>{
  let touched=false;
  const hostile=new Proxy({}, {get(){touched=true;throw Error('fixture');},ownKeys(){touched=true;throw Error('fixture');}});
  await assert.rejects(getOperationPolicy(hostile,ID,OP,hostile),error=>error.status===503);
  await assert.rejects(setOperationPolicy(hostile,{automation_id:ID,operation:OP,mode:'Auto',revision:1,params:{},approved:true},hostile),error=>error.status===503);
  assert.equal(touched,false);
});

test('only registered operations and their reviewed definition versions yield candidates',()=>{
  for(const definition of listAutomationDefinitions())for(const operation of definition.operations){
    const snapshot=JSON.stringify({schema:1,automation_id:definition.id,operation,definition_version:definition.version,
      mode:'Draft',revision:1,generation:GEN,params:{}});
    const candidate=proposeOperationPolicyCAS(definition.id,operation,'Auto',1,GEN,snapshot);
    assert.equal(candidate.state,'candidate');assert.equal(candidate.allowed,false);
    assert.deepEqual(inspectOperationPolicySnapshot(definition.id,operation,
      snapshot.replace(`"definition_version":${definition.version}`,`"definition_version":${definition.version+1}`)),invalid);
  }
});

test('nonprimitive identifiers and row inputs are rejected without consulting their properties',()=>{
  let touched=false;
  const hostile=new Proxy({}, {get(){touched=true;throw Error('fixture');},ownKeys(){touched=true;throw Error('fixture');}});
  assert.deepEqual(inspectOperationPolicySnapshot(hostile,OP,row()),invalid);
  assert.deepEqual(inspectOperationPolicySnapshot(ID,OP,hostile),invalid);
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,hostile,1,GEN,row()),invalid);
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Auto',hostile,GEN,row()),invalid);
  assert.equal(touched,false);
});

test('mutating one candidate cannot change later proposals',()=>{
  const first=proposeOperationPolicyCAS(ID,OP,'Auto',1,GEN,row());
  const original=first.next_value;first.next_value='{}';first.allowed=true;
  const next=proposeOperationPolicyCAS(ID,OP,'Auto',1,GEN,row());
  assert.equal(next.next_value,original);assert.equal(next.allowed,false);
});

test('an expected generation from an earlier incarnation cannot propose a write for the same revision',()=>{
  const other='00000000-0000-4000-8000-000000000002';
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Auto',1,other,row()),{state:'stale',allowed:false});
});

test('extra caller arguments cannot claim authorization or extend the candidate contract',()=>{
  assert.deepEqual(inspectOperationPolicySnapshot(ID,OP,row(),{approved:true}),invalid);
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Auto',1,GEN,row(),{actor:'fixture',approved:true}),invalid);
});
