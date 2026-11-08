const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('../docs/roadmap/equipo.js');
const snapshot = JSON.parse(fs.readFileSync('docs/roadmap/reparto-equipo.json', 'utf8'));
function fixture() { return {protocolVersion:1, revision:1, serverTime:'2026-11-08T10:00:00Z', catalogSha:'a'.repeat(40), slots:snapshot.slots, tasks:snapshot.items, units:snapshot.items.map(t=>({id:t.id,parentTaskId:t.id,enabled:false,reviewRequired:true,dependencies:[],resources:[]})), claims:[], evidence:[], release:null, blockers:[]}; }
test('current catalogue validates complete snapshot and rejects duplicates/unknown assignments', () => {
 const b=fixture(); assert.equal(api.validateBoard(b).tasks.length,250);
 assert.throws(()=>api.validateBoard({...b,tasks:[...b.tasks,b.tasks[0]]}));
 assert.throws(()=>api.validateBoard({...b,tasks:[{...b.tasks[0],assignedSlot:'unknown'}]}));
 assert.throws(()=>api.validateBoard({...b,protocolVersion:2}));
 assert.throws(()=>api.validateBoard({...b,revision:-1}));
});
test('readiness requires enabled reviewed units and exact dependency evidence kind', () => {
 const b=fixture(), t=b.tasks[0]; b.units=[{id:'a',parentTaskId:t.id,enabled:true,reviewRequired:false,dependencies:[{unitId:'dep',requiredEvidence:'activated'}],resources:[]}];
 b.evidence=[{unitId:'dep',kind:'integrated'}]; assert.equal(api.taskActivity(t,b).key,'blocked');
 b.evidence.push({unitId:'dep',kind:'activated'}); assert.equal(api.taskActivity(t,b).key,'ready');
 b.units[0].reviewRequired=true; assert.equal(api.taskActivity(t,b).key,'review');
});
test('paused and expired owners retain reservation and literal session information', () => {
 const b=fixture(),t=b.tasks[0]; b.units=[{id:'a',parentTaskId:t.id}]; b.claims=[{id:'claim',unitId:'a',status:'paused',actorId:'owner',sessionId:'session',expiresAt:'2026-11-08T09:00:00Z'}];
 assert.equal(api.taskActivity(t,b).key,'paused'); b.claims[0].status='active'; assert.equal(api.taskActivity(t,b).key,'stale');
 b.claims[0].expiresAt='2026-11-08T10:05:00Z'; assert.equal(api.taskActivity(t,b).key,'active');
});
test('read/write and parent paths conflict; two readers and sibling paths do not', () => {
 assert.ok(api.resourceConflict({key:'path:admin/',mode:'write'},{key:'path:admin/src/App.jsx',mode:'read'}));
 assert.ok(!api.resourceConflict({key:'path:admin/',mode:'read'},{key:'path:admin/src/App.jsx',mode:'read'}));
 assert.ok(!api.resourceConflict({key:'path:admin',mode:'write'},{key:'path:administrator/a',mode:'write'}));
 const b=fixture(),t=b.tasks[0];b.units=[{id:'a',parentTaskId:t.id,enabled:true,reviewRequired:false,dependencies:[],resources:[{key:'contract',mode:'write'}]}];b.claims=[{unitId:'other',status:'stale',resources:[{key:'contract',mode:'read'}]}];assert.equal(api.taskActivity(t,b).key,'blocked');
});
test('poll freshness uses last valid response and retry remains bounded', () => {
 assert.equal(api.isStale(1000,45999),false);assert.equal(api.isStale(1000,46000),true);
 assert.deepEqual([0,1,2,3,9].map(api.retryDelay),[15000,30000,60000,60000,60000]);
});
test('coordinator millisecond leases and design attestation match the runtime contract', () => {
 const b=fixture(),t=b.tasks[0];b.units=[{id:'a',parentTaskId:t.id,enabled:true,reviewRequired:true,dependencies:[],resources:[]}];b.evidence=[{unitId:'a',kind:'design'}];assert.equal(api.taskActivity(t,b).key,'ready');
 b.claims=[{id:'c',unitId:'a',status:'active',expiresAt:Date.parse('2026-11-08T09:00:00Z')}];assert.equal(api.taskActivity(t,b).key,'stale');
 b.claims=[];b.blockers=[{unitId:'a',reasons:[],dependencies:[],conflicts:[{unitId:'other',slot:'hermes'}]}];assert.equal(api.taskActivity(t,b).key,'blocked');assert.match(api.taskActivity(t,b).reasons.join(' '),/other/);
});

test('empty server blocker projection does not conceal an otherwise ready unit', () => {
 const b=fixture(),t=b.tasks[0];b.units=[{id:'a',parentTaskId:t.id,enabled:true,reviewRequired:false,dependencies:[],resources:[]}];b.blockers=[{unitId:'a',reasons:[],dependencies:[],conflicts:[]}];assert.equal(api.taskActivity(t,b).key,'ready');
});
test('dossier text and control contrast meet WCAG AA in both themes', () => {
 const contrast=(a,b)=>{const L=h=>{const v=h.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};const x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const [bg,fg] of [['F4F6F8','566476'],['FFFFFF','566476'],['FFFFFF','2B6CA3'],['16202B','A9B6C4'],['0F1720','A9B6C4'],['16202B','6FA8DC']])assert.ok(contrast(bg,fg)>=4.5,bg+'/'+fg);
 for(const [bg,fg] of [['FFFFFF','687889'],['16202B','8393A5']])assert.ok(contrast(bg,fg)>=3,bg+'/'+fg);
});
test('completed build units are terminal without closing sibling units or completed planning', () => {
 const b=fixture(),t=b.tasks[0];const unit={id:'research',parentTaskId:t.id,kind:'research',enabled:true,reviewRequired:false,dependencies:[],resources:[]};b.units=[unit];b.claims=[{id:'done',unitId:unit.id,mode:'build',status:'completed'}];b.evidence=[{unitId:unit.id,kind:'research_accepted'}];
 assert.equal(api.taskActivity(t,b).key,'completed');assert.doesNotMatch(api.taskActivity(t,b).label,/Lista para reservar/);
 b.units.push({...unit,id:'next'});assert.equal(api.taskActivity(t,b).key,'ready');
 b.units[1].reviewRequired=true;assert.equal(api.taskActivity(t,b).key,'review');
 b.units=[unit];b.claims[0].mode='plan';assert.equal(api.taskActivity(t,b).key,'ready');
 b.claims[0].mode='build';b.claims[0].status='abandoned';assert.equal(api.taskActivity(t,b).key,'ready');
 b.claims[0].status='completed';b.claims[0].completionCurrent=false;assert.equal(api.taskActivity(t,b).key,'ready');b.claims[0].completionCurrent=true;assert.equal(api.taskActivity(t,b).key,'completed');
 b.units=[{...unit,id:'new-catalogue-unit'}];assert.equal(api.taskActivity(t,b).key,'ready');
});

test('historical evidence does not authorize a revised unit contract', () => {
 const b=fixture(),t=b.tasks[0];b.units=[{id:'a',parentTaskId:t.id,enabled:true,reviewRequired:true,dependencies:[],resources:[]}];b.evidence=[{unitId:'a',kind:'design',evidenceCurrent:false}];assert.equal(api.taskActivity(t,b).key,'review');b.evidence[0].evidenceCurrent=true;assert.equal(api.taskActivity(t,b).key,'ready');
 b.units[0].dependencies=[{unitId:'dep',requiredEvidence:'research_accepted'}];b.evidence.push({unitId:'dep',kind:'research_accepted',evidenceCurrent:false});assert.equal(api.taskActivity(t,b).key,'blocked');b.evidence[1].evidenceCurrent=true;assert.equal(api.taskActivity(t,b).key,'ready');
});

test('board accepts legacy single capacity and rejects invalid column capacity', () => {
 const b=fixture();
 for(const capacity of [0,3,1.5,'2',null])assert.throws(()=>api.validateBoard({...b,slots:b.slots.map(s=>s.id==='hermes'?{...s,capacity}:s)}));
 for(const capacity of [undefined,1,2])assert.equal(api.validateBoard({...b,slots:b.slots.map(s=>s.id==='hermes'?{...s,capacity}:s)}).tasks.length,250);
});

test('columns have tool-independent list names and the same capacity', () => {
 assert.deepEqual(snapshot.slots.map(s=>s.name),['Lista 1','Lista 2','Lista 3','Lista 4']);
 assert.deepEqual(snapshot.slots.map(s=>s.capacity),[2,2,2,2]);
});
