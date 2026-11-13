import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCells, isReleaseAuthorization, isPublicDemandPayload } from '../../server/demand-release-policy.js';

test('suppressed cells never enter public DTO and malformed cells fail closed',()=>{
 const cells=[{parish:'St Helier',bedroom_band:'2',count:4,contact_ids:[1,2,3,4]}, {parish:'St Peter',bedroom_band:'4+',count:5,contact_ids:[1,2,3,4,5]}];
 assert.deepEqual(publicCells(cells),[{parish:'St Peter',bedroom_band:'4+',display_count:5}]);
 assert.throws(()=>publicCells([{parish:'Invalid',bedroom_band:'2',count:5}]));
});
test('only accepted, matching, current and unrevoked authorization permits release',()=>{
 const x={id:'id',policy_version:'p1',public_sha256:'h',releases_sha256:'l',ledger_version:3,identity_checked:1,inference_review:'accepted',source_ref:'ref',approved_by_ref:'reviewer',accepted_at:'2026-01-01T00:00:00.000Z',expires_at:'2027-01-01T00:00:00.000Z',revoked_at:null};
 const expected={authorization_id:'id',policy_version:'p1',public_sha256:'h',releases_sha256:'l',ledger_version:3};
 assert.equal(isReleaseAuthorization(x,expected,'2026-11-01T00:00:00.000Z'),true);
 for(const bad of [{...x,revoked_at:'2026-02-01'}, {...x,ledger_version:2},{...x,identity_checked:0},{...x,expires_at:'2026-01-02T00:00:00.000Z'}, {...x,source_ref:''}]) assert.equal(isReleaseAuthorization(bad,expected,'2026-11-01T00:00:00.000Z'),false);
 assert.equal(isReleaseAuthorization(null,expected,'2026-11-01T00:00:00.000Z'),false);
});

test('public DTO rejects hidden fields and suppressed values',()=>{
 const base={schema_version:1,id:'b0000000-0000-4000-8000-000000000001',as_of:'2026-11-13T00:00:00.000Z',valid_until:'2026-12-14T00:00:00.000Z',definition_version:'unmet-contacts-v1',operation:'rent',cells:[{parish:'St Helier',bedroom_band:'2',display_count:5}],definition:'Registered property seekers: distinct search contacts with no eligible match, by parish and minimum bedrooms.'};
 assert.equal(isPublicDemandPayload(base),true);
 assert.equal(isPublicDemandPayload({...base,secret:'hidden'}),false);
 assert.equal(isPublicDemandPayload({...base,cells:[{...base.cells[0],display_count:4}]}),false);
 assert.equal(isPublicDemandPayload({...base,cells:[{...base.cells[0],contact_ids:[1]}]}),false);
});
