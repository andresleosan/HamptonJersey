import {createHash} from 'node:crypto';

const ORIGIN='https://hamptonjersey-qa.pages.dev';
const SOURCE='80ad03df7e095750f455aa4aa668573e9aac5db4';
// SHA-256 of the synthetic bank CSV header Date,Amount,Description.
const CSV_HEADER='f5f01146b6876adf6da560da78823561f9b2707e51567bfdd3f4fe0d08633b2d';
const reads=[
 ['config','/api/config'],['public-listings','/api/listings'],['applicant-options','/api/applicants/options'],
 ['public-tours','/api/tours'],['public-availability','/api/availability'],
 ['listings','/api/admin/listings'],['users','/api/admin/users'],['applicants','/api/admin/applicants'],
 ['viewings','/api/admin/viewings?tab=requests'],['negotiators','/api/admin/negotiators'],['availability','/api/admin/availability'],
 ['notifications','/api/admin/notifications?box=feed'],['notification-counts','/api/admin/notifications/counts'],
 ['notification-preferences','/api/admin/notification-preferences'],['notification-alerts','/api/admin/notification-alerts'],
 ['matches-review','/api/admin/review'],['automations','/api/admin/automations'],['jobs','/api/admin/jobs'],
 ['queue','/api/admin/queue'],['chats','/api/admin/chats?status=all'],['advertisers','/api/admin/advertisers'],
 ['tours','/api/admin/tours'],['sales','/api/admin/sales'],['landlords','/api/admin/landlords'],
 ['rentals','/api/admin/rentals'],['tenancies','/api/admin/tenancies'],['insights','/api/admin/insights'],
 ['email-settings','/api/admin/email/settings'],['email-preview','/api/admin/email/preview'],
 ['inbound-email','/api/admin/email?box=inbound'],['outbound-email','/api/admin/email?box=outbound'],
 ['rpi-setting','/api/admin/settings/rpi'],['gst-setting','/api/admin/settings/gst'],['csv-setting',`/api/admin/settings/csv-map?header=${CSV_HEADER}`],
];
const failure=label=>Object.assign(new Error(`QA_CASE_FAILED:${label}`),{qaCase:label});
const requireCase=(condition,label)=>{if(!condition)throw failure(label);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// All transport and identity remain with the caller. Only fixed relative QA paths are requested.
export async function runApiSmoke(client,{runId,buildId,pattern}) {
 requireCase(typeof runId==='string'&&/^run-[A-Za-z0-9_-]{1,64}$/.test(runId),'input-run');
 requireCase(typeof buildId==='string'&&/^[a-f0-9]{64}$/.test(buildId),'input-build');
 requireCase((Buffer.isBuffer(pattern)||pattern instanceof Uint8Array)&&pattern.length>0,'input-pattern');
 const checks=[],retained=[{type:'scope',reason:'Hermes draft simulation skipped: initial smoke has no normal draft cleanup permission.'}];
 const marker=`QA ${runId}`,email=`${runId.toLowerCase()}@example.test`,mediaLabel=`${marker} media`;
 const cleanup={attempted:false,listing:{created:false,ownershipVerified:false,deleted:false},
   media:{created:false,ownershipVerified:false,deleted:false},user:{created:false,ownershipVerified:false,deleted:false},errors:[]};
 let listingId=null,mediaId=null,userCreated=false,ownedListing=false,ownedMedia=false,primary=null;
 const record=(name,mode='qa-app')=>checks.push({case:name,passed:true,mode});
 const call=async(name,path,options,expected=200,mode='qa-app')=>{
  let response;try{response=await client.request(path,options);}catch{throw failure(name);}
  requireCase(response?.status===expected,name);record(name,mode);return response;
 };
 const freshListing=async name=>{
  const response=await call(name,`/api/admin/listings/${listingId}`);
  requireCase(response.data?.listing?.id===listingId&&[marker,`${marker} edited`].includes(response.data.listing.title),name);
  requireCase(Array.isArray(response.data.media),name);
  return response.data;
 };
 const cleanupStep=async(name,action)=>{try{await action();}catch{cleanup.errors.push(name);}};
 try {
  const state=(await call('state-build','/api/qa-app/state')).data;
  requireCase(state?.source_sha===SOURCE&&state.build_id===buildId&&state.origin===ORIGIN&&state.project==='hamptonjersey-qa'
    &&state.guard==='verified'&&state.email==='qa-agent@example.test','state-build');
  await call('anonymous-session','/api/me',{anonymous:true},401,'security');
  await call('provider-login-disabled','/api/session',{method:'POST',json:{}},403,'security');
  await call('csrf-missing-origin','/api/admin/users',{method:'POST',json:{},csrf:false},403,'security');
  await call('old-qa-hidden','/api/qa/production-check',{},404,'security');
  await call('hermes-door-hidden','/api/hermes/status',{},404,'security');
  await call('csv-header-required','/api/admin/settings/csv-map',{},400,'security');
  const pages=new Map();
  for(const [name,path] of reads)pages.set(name,(await call(`read-${name}`,path)).data);
  const users=pages.get('users')?.users,listings=pages.get('listings')?.listings;
  requireCase(Array.isArray(users)&&Array.isArray(listings),'run-preflight');
  requireCase(!users.some(user=>user.email?.toLowerCase()===email.toLowerCase())&&!listings.some(listing=>listing.title?.includes(marker)),'run-collision');
  requireCase(users.some(user=>user.email==='qa-agent@example.test'),'base-user-present');
  const existingIds=new Set(listings.map(listing=>listing.id));
  const created=await call('listing-create','/api/admin/listings',{method:'POST',json:{title:marker,use:'residential',operation:'sale',availability:'for_sale',country:'Jersey',currency:'GBP',sale_price:123456,description:`Synthetic property for ${runId}`}},201);
  requireCase(typeof created.data?.id==='string'&&/^HE-[A-Z]\d{3,}$/.test(created.data.id)&&!existingIds.has(created.data.id),'listing-create-ownership');
  listingId=created.data.id;cleanup.listing.created=true;
  const detail=await freshListing('listing-create-ownership');
  requireCase(detail.media.length===0&&typeof detail.listing.updated_at==='string','listing-create-ownership');
  ownedListing=true;cleanup.listing.ownershipVerified=true;
  const initialVersion=detail.listing.updated_at;
  const updated=await call('listing-update',`/api/admin/listings/${listingId}`,{method:'PUT',json:{title:`${marker} edited`,updated_at:initialVersion}});
  requireCase(updated.data?.listing?.title===`${marker} edited`,'listing-update');
  await call('listing-stale-update',`/api/admin/listings/${listingId}`,{method:'PUT',json:{title:marker,updated_at:initialVersion}},409);
  const history=await call('listing-history',`/api/admin/listings/${listingId}/history`);
  requireCase(Array.isArray(history.data?.items)&&history.data.items.some(item=>item.type==='listing.created')&&history.data.items.some(item=>item.type==='listing.updated'),'listing-history');
  await call('listing-offers',`/api/admin/listings/${listingId}/offers`);
  await call('listing-interest',`/api/admin/listings/${listingId}/interest`);
  await call('listing-report',`/api/admin/listings/${listingId}/report`);
  const file={name:'qa-pattern.png',mimeType:'image/png',buffer:pattern};
  const uploaded=await call('media-upload',`/api/admin/listings/${listingId}/media`,{method:'POST',multipart:{file,thumb:{...file,name:'qa-thumb.png'},width:600,height:400,label:mediaLabel}},201);
  const media=uploaded.data?.media;
  requireCase(typeof media?.id==='string'&&/^U[A-Za-z0-9]{16}$/.test(media.id)&&media.listing_id===listingId&&media.label===mediaLabel&&media.origin==='upload','media-upload-ownership');
  mediaId=media.id;ownedMedia=true;cleanup.media.created=true;
  const stored=(await freshListing('media-upload-ownership')).media.find(item=>item.id===mediaId);
  requireCase(stored?.listing_id===listingId&&stored.label===mediaLabel&&stored.origin==='upload','media-upload-ownership');
  cleanup.media.ownershipVerified=true;
  const downloaded=await call('media-read-hash',`/media/${mediaId}`);
  requireCase(downloaded.body instanceof Uint8Array&&hash(downloaded.body)===hash(pattern),'media-read-hash');
  const thumb=await call('media-thumb-hash',`/media/${mediaId}?thumb`);
  requireCase(thumb.body instanceof Uint8Array&&hash(thumb.body)===hash(pattern),'media-thumb-hash');
  const userPath=`/api/admin/users/${encodeURIComponent(email)}`;
  await call('user-create','/api/admin/users',{method:'POST',json:{email,name:marker}},201);
  userCreated=true;cleanup.user.created=true;
  const userList=(await call('user-create-ownership','/api/admin/users')).data?.users;
  requireCase(Array.isArray(userList)&&userList.some(user=>user.email===email&&user.name===marker),'user-create-ownership');
  cleanup.user.ownershipVerified=true;
  await call('user-update',userPath,{method:'PUT',json:{name:`${marker} renamed`}});
  const renamed=(await call('user-update-read','/api/admin/users')).data?.users;
  requireCase(Array.isArray(renamed)&&renamed.some(user=>user.email===email&&user.name===`${marker} renamed`),'user-update-read');
  for(const simulation of ['drive','email','jobs']){
   const result=await call(`simulate-${simulation}`,'/api/qa-app/simulate',{method:'POST',json:{simulation,...(simulation==='email'?{recipient:email}:{})}},200,'simulated');
   requireCase(result.data?.simulated===true&&result.data.simulation===simulation,`simulate-${simulation}`);
   if(simulation==='email')retained.push({type:'simulation-email',runId,reason:'Synthetic inbound message and QA-prefixed receipt remain for inspection; no provider delivery.'});
   if(simulation==='jobs')retained.push({type:'simulation-jobs',runId,reason:'Clock, retention, notification reconciliation and weekly insights use fixture data; their operational/audit rows remain.'});
  }
 }catch(error){primary=error?.qaCase??'unexpected';}
 finally {
  cleanup.attempted=Boolean(ownedListing||ownedMedia||userCreated);
  if(ownedMedia&&!cleanup.media.deleted)await cleanupStep('cleanup-media',async()=>{
   const detail=await freshListing('cleanup-media-ownership'),media=detail.media.find(item=>item.id===mediaId);
   requireCase(media?.listing_id===listingId&&media.label===mediaLabel&&media.origin==='upload','cleanup-media-ownership');
   await call('cleanup-media-delete',`/api/admin/media/${mediaId}`,{method:'DELETE'});
   await call('cleanup-media-absent',`/media/${mediaId}`,{},404);
   cleanup.media.deleted=true;
  });
  if(userCreated)await cleanupStep('cleanup-user',async()=>{
   const users=(await call('cleanup-user-ownership','/api/admin/users')).data?.users;
   requireCase(Array.isArray(users)&&users.some(user=>user.email===email&&[marker,`${marker} renamed`].includes(user.name))&&email!=='qa-agent@example.test','cleanup-user-ownership');
   await call('cleanup-user-delete',`/api/admin/users/${encodeURIComponent(email)}`,{method:'DELETE'});
   const remaining=(await call('cleanup-user-absent','/api/admin/users')).data?.users;
   requireCase(Array.isArray(remaining)&&!remaining.some(user=>user.email===email)&&remaining.some(user=>user.email==='qa-agent@example.test'),'cleanup-user-absent');
   cleanup.user.deleted=true;
  });
  if(ownedListing)await cleanupStep('cleanup-listing',async()=>{
   const detail=await freshListing('cleanup-listing-ownership');
   // Refuse cascading deletion if another actor attached media during this run.
   requireCase(detail.media.length===0,'cleanup-listing-media-empty');
   if(!detail.listing.archived_at)await call('cleanup-listing-archive',`/api/admin/listings/${listingId}/archive`,{method:'POST',json:{updated_at:detail.listing.updated_at}});
   const finalDetail=await freshListing('cleanup-listing-delete-ownership');
   requireCase(finalDetail.media.length===0,'cleanup-listing-media-empty');
   await call('cleanup-listing-delete',`/api/admin/listings/${listingId}`,{method:'DELETE',json:{confirm:listingId}});
   await call('cleanup-listing-absent',`/api/admin/listings/${listingId}`,{},404);
   cleanup.listing.deleted=true;
   retained.push({type:'listing-audit',runId,reason:'Normal listing deletion retains History events and a deleted-listing tombstone.'});
  });
 }
 if(primary||cleanup.errors.length){
  const error=failure([primary,...cleanup.errors].filter(Boolean).join('+'));
  error.qaReport={checks,cleanup,retained,owned:{listingId:ownedListing?listingId:null,mediaId:ownedMedia?mediaId:null,userEmail:userCreated?email:null}};
  throw error;
 }
 return {checks,cleanup,retained};
}
