import {activeSql,normalizePhone} from './applicants.js';

export const TASK_CATEGORIES=['new_applicant','viewing','matched','task'];
export const NOTICE_SELECT=`SELECT n.id,n.event_id,n.category,n.title,n.created_at,n.action_required,n.resolved_at,n.resolved_by,
  n.source_version,n.revision,n.assigned_to,n.due_at,n.task_reason,n.urgency,n.closed_by_source,
  owner.name AS assigned_name,owner.email IS NOT NULL AS assigned_available,
  CASE WHEN COALESCE(seen.read_revision,0)>=n.revision THEN 1 ELSE 0 END AS is_read,
  e.entity_type,e.entity_id,COALESCE(c.phone,ac.phone,v.phone) AS raw_phone,
  CASE e.entity_type WHEN 'applicant' THEN a.id IS NOT NULL WHEN 'contact' THEN c.id IS NOT NULL
    WHEN 'viewing' THEN v.id IS NOT NULL WHEN 'listing' THEN l.id IS NOT NULL ELSE 0 END AS target_exists,
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
  LEFT JOIN listings l ON e.entity_type='listing' AND l.id=e.entity_id`;

export function noticeDto({raw_phone,search_id,...n}) {
  const numeric=/^[1-9]\d*$/.test(n.entity_id)&&Number.isSafeInteger(Number(n.entity_id));
  let link=null;
  if(numeric&&n.entity_type==='viewing')link=`#/viewings?viewing=${n.entity_id}`;
  else if(numeric&&n.entity_type==='applicant')link=`#/applicants/${n.entity_id}${n.category==='matched'?'/matches':''}`;
  else if(numeric&&n.entity_type==='contact')link=search_id!=null?`#/applicants/${search_id}`:`#/applicants/new?contact=${n.entity_id}`;
  else if(n.entity_type==='listing'&&/^HE-[A-Z]\d{3,}$/.test(n.entity_id))link=`#/p/${encodeURIComponent(n.entity_id)}`;
  return {...n,phone:normalizePhone(raw_phone),link,target_exists:Boolean(n.target_exists),
    can_reopen:Boolean(n.action_required&&n.resolved_at&&!n.closed_by_source&&n.target_exists)};
}
