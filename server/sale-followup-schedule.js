import {jerseyNow,plusDays,realDate,weekday,WEEKDAYS} from './viewings.js';

const CLOCK=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LOCAL_TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const HOUR=3600000;
const OFFSET=(()=>{
  try{return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Jersey',timeZoneName:'shortOffset',hour:'2-digit',hourCycle:'h23'});}
  catch{return null;}
})();

function utcInstant(value){
  if(typeof value!=='string'||!CLOCK.test(value)||value.startsWith('0000-'))return null;
  const date=new Date(value),ms=date.getTime();
  return Number.isFinite(ms)&&date.toISOString()===value?ms:null;
}
function offsetAt(ms){
  if(!OFFSET)return null;
  const name=OFFSET.formatToParts(new Date(ms)).find(part=>part.type==='timeZoneName')?.value;
  if(name==='GMT'||name==='UTC')return 0;
  const match=/^(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/.exec(name??'');
  if(!match)return null;
  const [,sign,h,m='0',s='0']=match, hours=Number(h),minutes=Number(m),seconds=Number(s);
  if(hours>23||minutes>59||seconds>59)return null;
  return (sign==='-'?-1:1)*(hours*HOUR+minutes*60000+seconds*1000);
}
const localKey=ms=>{const local=jerseyNow(new Date(ms));return realDate(local.date)?`${local.date}T${local.time}`:null;};

// Resolve a wall-clock deadline to one immutable UTC instant. If clocks repeat,
// use the first occurrence. If they jump forward, use the first valid instant
// after the gap. Reject when the runtime cannot resolve the local transition.
function deadlineFor(date,time){
  if(!realDate(date)||date.startsWith('0000-'))return null;
  const target=`${date}T${time}`, nominal=Date.parse(`${target}:00.000Z`);
  if(!Number.isFinite(nominal))return null;
  const samples=[];
  for(let hours=-72;hours<=72;hours+=3){
    const ms=nominal+hours*HOUR,offset=offsetAt(ms);
    if(offset===null)return null;
    samples.push({ms,offset});
  }
  const changes=samples.slice(1).flatMap((sample,i)=>sample.offset===samples[i].offset?[]:[[samples[i],sample]]);
  if(changes.length>1)return null;
  const offsets=[...new Set(samples.map(sample=>sample.offset))],matches=[];
  for(const offset of offsets){
    const candidate=nominal-offset;
    if(offsetAt(candidate)===offset&&localKey(candidate)===target)matches.push(candidate);
  }
  if(matches.length)return Math.min(...matches);
  if(changes.length!==1)return null;
  const [before,after]=changes[0];let lo=before.ms,hi=after.ms;
  while(hi-lo>1){
    const mid=lo+Math.floor((hi-lo)/2),offset=offsetAt(mid);
    if(offset===null)return null;
    if(offset===before.offset)lo=mid;else if(offset===after.offset)hi=mid;else return null;
  }
  const prior=localKey(hi-1),next=localKey(hi);
  return prior!==null&&next!==null&&prior<target&&next>target?hi:null;
}

// Pure planning only: activatedAt must be the trusted start of this exact
// configuration. Candidates are not tasks, recovery, or an idempotency claim.
export function saleFollowupWindow(timestamp,schedule){
  if(schedule==null||(typeof schedule==='object'&&!Array.isArray(schedule)&&schedule.enabled===false))return {state:'disabled'};
  if(typeof schedule!=='object'||Array.isArray(schedule)||schedule.enabled!==true||!WEEKDAYS.includes(schedule.day)
      ||typeof schedule.time!=='string'||!LOCAL_TIME.test(schedule.time))return {state:'invalid_schedule'};
  const activated=utcInstant(schedule.activatedAt);
  if(activated===null)return {state:'invalid_schedule'};
  const now=utcInstant(timestamp);
  if(now===null)return {state:'invalid_clock'};
  try{
    const local=jerseyNow(new Date(now)),day=WEEKDAYS.indexOf(weekday(local.date));
    if(day<0||!realDate(local.date))return {state:'invalid_clock'};
    const weekStart=plusDays(local.date,-day),previous=plusDays(weekStart,-7);
    if(!realDate(weekStart)||!realDate(previous)||weekStart.startsWith('0000-')||previous.startsWith('0000-'))return {state:'invalid_clock'};
    if(now<activated)return {state:'not_active',weekStart,dueWindows:[],olderWindowsNotExamined:false};
    const activationLocal=jerseyNow(new Date(activated));
    if(!realDate(activationLocal.date))return {state:'invalid_schedule'};
    const targetDay=WEEKDAYS.indexOf(schedule.day),dueWindows=[];
    for(const week of [previous,weekStart]){
      const due=deadlineFor(plusDays(week,targetDay),schedule.time);
      if(due===null)return {state:'invalid_clock'};
      const dueAt=new Date(due).toISOString();
      if(utcInstant(dueAt)===null)return {state:'invalid_clock'};
      if(due>=activated&&due<=now)dueWindows.push({weekStart:week,dueAt});
    }
    return {state:dueWindows.length?'due':'waiting',weekStart,dueWindows,
      olderWindowsNotExamined:activationLocal.date<previous};
  }catch{return {state:'invalid_clock'};}
}
