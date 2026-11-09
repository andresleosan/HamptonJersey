import {activeSql,normalizePhone} from './applicants.js';
import {fail} from './http.js';
import {MILESTONES} from './sales.js';
import {COMPLIANCE} from './rentals.js';
export {TASK_CATEGORIES} from '../shared/notification-categories.js';

const positive=value=>/^[1-9]\d*$/.test(String(value))&&Number.isSafeInteger(Number(value));
const CONTEXT={sale:['milestone'],rental:['tenancy_id','repair_id','compliance_kind','deadline']};
export function taskTarget(value,manual=false) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['kind','id',...(!manual||value.kind==='rental'?['context']:[])].includes(k)))fail(400,'Choose a task target');
  const kind=value.kind,id=String(value.id??'');
  if(!(manual?['applicant','viewing','rental']:['applicant','viewing','contact','listing','offer','sale','rental','payment','collection']).includes(kind))fail(400,'Invalid task target');
  if(kind==='listing'?!/^HE-[A-Z]\d{3,}$/.test(id):kind==='collection'?id!=='unmatched-payments':!positive(id))fail(400,'Invalid task target');
  const input=value.context;let context;
  if(input!=null){
    if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!CONTEXT[kind]?.includes(k)))fail(400,'Invalid task context');
    context={};
    for(const key of CONTEXT[kind]??[])if(Object.hasOwn(input,key)){
      const item=input[key];
      if(key.endsWith('_id')){if(!positive(item))fail(400,'Invalid context ID');context[key]=Number(item);}
      else if(key==='milestone'){if(!MILESTONES.some(([k])=>k===item))fail(400,'Invalid milestone');context[key]=item;}
      else if(key==='compliance_kind'){if(!COMPLIANCE.some(([k])=>k===item))fail(400,'Invalid compliance kind');context[key]=item;}
      else {if(!['deposit','inventory_in','inventory_out'].includes(item))fail(400,'Invalid deadline');context[key]=item;}
    }
    if(context.deadline&&!context.tenancy_id)fail(400,'A deadline needs its tenancy');
  }
  // Keep the pre0033 manual request hash byte-for-byte compatible.
  return {kind,id,...(context&&Object.keys(context).length?{context}:{})};
}

export function targetExists(kind,id,context='NULL') {
  const tenancy=`json_extract(${context},'$.tenancy_id')`,repair=`json_extract(${context},'$.repair_id')`;
  return `(CASE ${kind}
    WHEN 'applicant' THEN EXISTS(SELECT 1 FROM applicants WHERE id=${id})
    WHEN 'viewing' THEN EXISTS(SELECT 1 FROM viewing_requests WHERE id=${id})
    WHEN 'contact' THEN EXISTS(SELECT 1 FROM contacts WHERE id=${id})
    WHEN 'listing' THEN EXISTS(SELECT 1 FROM listings WHERE id=${id})
    WHEN 'offer' THEN EXISTS(SELECT 1 FROM offers WHERE id=${id})
    WHEN 'sale' THEN EXISTS(SELECT 1 FROM sales WHERE id=${id}) AND (json_extract(${context},'$.milestone') IS NULL
      OR EXISTS(SELECT 1 FROM sale_milestones WHERE sale_id=${id} AND key=json_extract(${context},'$.milestone')))
    WHEN 'rental' THEN EXISTS(SELECT 1 FROM rentals WHERE id=${id})
      AND (${tenancy} IS NULL OR EXISTS(SELECT 1 FROM tenancies WHERE id=${tenancy} AND rental_id=${id}))
      AND (${repair} IS NULL OR EXISTS(SELECT 1 FROM repairs WHERE id=${repair} AND rental_id=${id}
        AND (${tenancy} IS NULL OR tenancy_id=${tenancy})))
      AND (json_extract(${context},'$.compliance_kind') IS NULL OR EXISTS(SELECT 1 FROM compliance_items
        WHERE rental_id=${id} AND kind=json_extract(${context},'$.compliance_kind')))
    WHEN 'payment' THEN EXISTS(SELECT 1 FROM payments WHERE id=${id})
    WHEN 'collection' THEN ${id}='unmatched-payments' ELSE 0 END)`;
}

export const sourceAllowsTarget=(kind,id,event='e')=>`((${event}.entity_type=${kind} AND ${event}.entity_id=${id})
  OR (${kind}='offer' AND ${event}.entity_type='applicant' AND CAST(json_extract(${event}.data,'$.offer_id') AS TEXT)=${id}
    AND EXISTS(SELECT 1 FROM offers WHERE id=${id} AND applicant_id=${event}.entity_id))
  OR (${kind}='sale' AND ${event}.entity_type='applicant' AND CAST(json_extract(${event}.data,'$.sale_id') AS TEXT)=${id}
    AND EXISTS(SELECT 1 FROM sales WHERE id=${id} AND applicant_id=${event}.entity_id)))`;
export const noticeTargetExists=(notice='n',event='e')=>`${notice}.target_deleted=0 AND ${targetExists(
  `COALESCE(${notice}.target_kind,${event}.entity_type)`,`COALESCE(${notice}.target_id,${event}.entity_id)`,`${notice}.target_context`)}`;

export const NOTICE_SELECT=`SELECT n.id,n.event_id,n.category,n.title,n.created_at,n.action_required,n.resolved_at,n.resolved_by,
  n.source_version,n.revision,n.assigned_to,n.due_at,n.task_reason,n.urgency,n.closed_by_source,
  owner.name AS assigned_name,owner.email IS NOT NULL AS assigned_available,
  CASE WHEN COALESCE(seen.read_revision,0)>=n.revision THEN 1 ELSE 0 END AS is_read,
  COALESCE(n.target_kind,e.entity_type) AS entity_type,COALESCE(n.target_id,e.entity_id) AS entity_id,
  n.target_context,n.target_deleted,COALESCE(c.phone,ac.phone,v.phone) AS raw_phone,
  ${noticeTargetExists()} AS target_exists,
  CASE WHEN n.target_kind IS NOT NULL THEN COALESCE(ol.title,sl.title,r.address,payment_rental.address,v.name,ac.name,c.name,l.title) END AS context_label,
  CASE WHEN e.entity_type='contact' THEN (SELECT s.id FROM applicants s WHERE s.contact_id=c.id
    ORDER BY (${activeSql('s')}
      AND COALESCE(s.search_operation,s.operation) IS COALESCE(json_extract(e.data,'$.search_operation'),json_extract(e.data,'$.operation'))
      AND s.search_category=COALESCE(json_extract(e.data,'$.search_category'),'residential')) DESC,s.created_at DESC,s.id DESC LIMIT 1) END AS search_id
  FROM notifications n JOIN events e ON e.id=n.event_id
  LEFT JOIN admins owner ON owner.email=n.assigned_to
  LEFT JOIN notification_reads seen ON seen.notification_id=n.id AND seen.admin=?
  LEFT JOIN applicants a ON e.entity_type='applicant' AND a.id=e.entity_id
  LEFT JOIN contacts ac ON ac.id=a.contact_id
  LEFT JOIN contacts c ON e.entity_type='contact' AND c.id=e.entity_id
  LEFT JOIN viewing_requests v ON e.entity_type='viewing' AND v.id=e.entity_id
  LEFT JOIN listings l ON e.entity_type='listing' AND l.id=e.entity_id
  LEFT JOIN offers o ON n.target_kind='offer' AND o.id=n.target_id
  LEFT JOIN listings ol ON ol.id=o.listing_id
  LEFT JOIN sales s ON n.target_kind='sale' AND s.id=n.target_id
  LEFT JOIN listings sl ON sl.id=s.listing_id
  LEFT JOIN rentals r ON n.target_kind='rental' AND r.id=n.target_id
  LEFT JOIN payments p ON n.target_kind='payment' AND p.id=n.target_id
  LEFT JOIN tenancies pt ON pt.id=p.tenancy_id
  LEFT JOIN rentals payment_rental ON payment_rental.id=pt.rental_id`;

export function noticeDto({raw_phone,search_id,target_context,target_deleted,context_label,...n}) {
  const numeric=/^[1-9]\d*$/.test(n.entity_id)&&Number.isSafeInteger(Number(n.entity_id));
  let link=null;
  if(numeric&&n.entity_type==='viewing')link=`#/viewings?viewing=${n.entity_id}`;
  else if(numeric&&n.entity_type==='applicant')link=`#/applicants/${n.entity_id}${n.category==='matched'?'/matches':''}`;
  else if(numeric&&n.entity_type==='contact')link=search_id!=null?`#/applicants/${search_id}`:`#/applicants/new?contact=${n.entity_id}`;
  else if(n.entity_type==='listing'&&/^HE-[A-Z]\d{3,}$/.test(n.entity_id))link=`#/p/${encodeURIComponent(n.entity_id)}`;
  else if(numeric&&n.entity_type==='offer')link=`#/sales?offer=${n.entity_id}`;
  else if(numeric&&n.entity_type==='sale')link=`#/sales/${n.entity_id}`;
  else if(numeric&&n.entity_type==='rental')link=`#/rentals/${n.entity_id}`;
  else if(numeric&&n.entity_type==='payment')link=`#/rentals?payment=${n.entity_id}`;
  else if(n.entity_type==='collection'&&n.entity_id==='unmatched-payments')link='#/rentals?payments=unmatched';
  const context=target_context?JSON.parse(target_context):null;
  if(link&&context){const params=new URLSearchParams();
    for(const [key,param] of [['tenancy_id','tenancy'],['repair_id','repair'],['compliance_kind','check'],['deadline','deadline'],['milestone','milestone']])
      if(context[key]!=null)params.set(param,String(context[key]));
    if(params.size)link+=(link.includes('?')?'&':'?')+params;
  }
  const exists=Boolean(n.target_exists&&!target_deleted);
  return {...n,...(context?{context}:{}),...(context_label&&exists?{context_label}:{}),phone:exists?normalizePhone(raw_phone):null,link:exists?link:null,target_exists:exists,
    can_reopen:Boolean(n.action_required&&n.resolved_at&&!n.closed_by_source&&n.target_exists)};
}
