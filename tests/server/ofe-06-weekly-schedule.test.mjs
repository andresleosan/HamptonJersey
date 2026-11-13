import test from 'node:test';
import assert from 'node:assert/strict';
import {saleFollowupWindow} from '../../server/sale-followup-schedule.js';

const monday={enabled:true,day:'mon',time:'09:00',activatedAt:'2026-11-02T08:00:00.000Z'};
const due=(weekStart,dueAt)=>({weekStart,dueAt});
const result=(state,weekStart,dueWindows,olderWindowsNotExamined=false)=>({state,weekStart,dueWindows,olderWindowsNotExamined});

test('only a complete enabled schedule with an activation instant can produce candidates',()=>{
  const now='2026-11-02T09:00:00.000Z';
  assert.deepEqual(saleFollowupWindow(now,null),{state:'disabled'});
  assert.deepEqual(saleFollowupWindow(now,{enabled:false}),{state:'disabled'});
  for(const config of [{},{enabled:1}, {enabled:true}, {enabled:true,day:'mon',time:'09:00'},
    {...monday,day:'monday'}, {...monday,time:'9:00'}, {...monday,time:'24:00'},
    {...monday,activatedAt:null}, {...monday,activatedAt:'2026-02-30T09:00:00.000Z'},
    {...monday,activatedAt:'2026-11-02T09:00:00+00:00'}])
    assert.deepEqual(saleFollowupWindow(now,config),{state:'invalid_schedule'});
});

test('does not invent a scheduled window before activation or while activation is in the future',()=>{
  assert.deepEqual(saleFollowupWindow('2026-11-02T08:59:59.999Z',monday),result('waiting','2026-11-02',[]));
  assert.deepEqual(saleFollowupWindow('2026-11-02T09:00:00.000Z',monday),
    result('due','2026-11-02',[due('2026-11-02','2026-11-02T09:00:00.000Z')]));
  assert.deepEqual(saleFollowupWindow('2026-11-02T10:00:00.000Z',{...monday,activatedAt:'2026-11-02T09:01:00.000Z'}),
    result('waiting','2026-11-02',[]));
  assert.deepEqual(saleFollowupWindow('2026-11-02T08:59:00.000Z',{...monday,activatedAt:'2026-11-03T00:00:00.000Z'}),
    result('not_active','2026-11-02',[]));
});

test('a Sunday 23:59 window is still returned after the next Monday begins',()=>{
  const schedule={enabled:true,day:'sun',time:'23:59',activatedAt:'2026-11-08T10:00:00.000Z'};
  assert.deepEqual(saleFollowupWindow('2026-11-08T23:58:59.999Z',schedule),result('waiting','2026-11-02',[]));
  const expected=result('due','2026-11-09',[due('2026-11-02','2026-11-08T23:59:00.000Z')]);
  assert.deepEqual(saleFollowupWindow('2026-11-09T00:00:00.000Z',schedule),expected);
  assert.deepEqual(saleFollowupWindow('2026-11-09T00:10:00.000Z',schedule),expected);
});

test('returns at most the previous and current windows, and flags possible older ones',()=>{
  const once={...monday,activatedAt:'2026-11-02T08:00:00.000Z'};
  const expected=result('due','2026-11-09',[
    due('2026-11-02','2026-11-02T09:00:00.000Z'),due('2026-11-09','2026-11-09T09:00:00.000Z')]);
  assert.deepEqual(saleFollowupWindow('2026-11-10T00:00:00.000Z',once),expected);
  assert.deepEqual(saleFollowupWindow('2026-11-10T00:00:00.000Z',{...once,activatedAt:'2026-10-01T00:00:00.000Z'}),
    {...expected,olderWindowsNotExamined:true});
  assert.deepEqual(saleFollowupWindow('2027-01-04T08:00:00.000Z',
    {...once,activatedAt:'2026-12-28T10:00:00.000Z'}),result('waiting','2027-01-04',[]));
});

test('autumn repeated time uses its first occurrence and never becomes waiting again',()=>{
  const schedule={enabled:true,day:'sun',time:'01:30',activatedAt:'2026-10-24T00:00:00.000Z'};
  const expected=result('due','2026-10-19',[due('2026-10-19','2026-10-25T00:30:00.000Z')]);
  assert.deepEqual(saleFollowupWindow('2026-10-25T00:29:59.999Z',schedule),result('waiting','2026-10-19',[]));
  for(const now of ['2026-10-25T00:30:00.000Z','2026-10-25T01:00:00.000Z','2026-10-25T01:29:00.000Z','2026-10-25T01:40:00.000Z'])
    assert.deepEqual(saleFollowupWindow(now,schedule),expected);
  assert.deepEqual(saleFollowupWindow('2026-10-25T01:40:00.000Z',
    {...schedule,activatedAt:'2026-10-25T00:45:00.000Z'}),result('waiting','2026-10-19',[]));
});

test('spring missing wall time is due at the first valid instant after the gap',()=>{
  const schedule={enabled:true,day:'sun',time:'01:30',activatedAt:'2026-03-28T00:00:00.000Z'};
  assert.deepEqual(saleFollowupWindow('2026-03-29T00:59:59.999Z',schedule),result('waiting','2026-03-23',[]));
  assert.deepEqual(saleFollowupWindow('2026-03-29T01:00:00.000Z',schedule),
    result('due','2026-03-23',[due('2026-03-23','2026-03-29T01:00:00.000Z')]));
  assert.deepEqual(saleFollowupWindow('2026-03-29T01:01:00.000Z',
    {...schedule,activatedAt:'2026-03-29T01:00:00.001Z'}),result('waiting','2026-03-23',[]));
});

test('rejects invalid, normalised or unsupported clock values without candidates',()=>{
  for(const ts of [null,'','2026-02-30T09:00:00.000Z','2026-11-02','2026-11-02T09:00:00+00:00',0,'0000-01-01T00:00:00.000Z'])
    assert.deepEqual(saleFollowupWindow(ts,monday),{state:'invalid_clock'});
});


test('regression: a prior-week deadline and a repeated-hour deadline remain due',()=>{
  const lateSunday={enabled:true,day:'sun',time:'23:59',activatedAt:'2026-11-08T00:00:00.000Z'};
  assert.equal(saleFollowupWindow('2026-11-09T00:00:00.000Z',lateSunday).state,'due');
  const folded={enabled:true,day:'sun',time:'01:30',activatedAt:'2026-10-24T00:00:00.000Z'};
  assert.equal(saleFollowupWindow('2026-10-25T00:40:00.000Z',folded).state,'due');
  assert.equal(saleFollowupWindow('2026-10-25T01:00:00.000Z',folded).state,'due');
});

test('regression: the autumn fold never reverses an already due deadline',()=>{
  const folded={enabled:true,day:'sun',time:'01:30',activatedAt:'2026-10-24T00:00:00.000Z'};
  assert.equal(saleFollowupWindow('2026-10-25T00:40:00.000Z',folded).state,'due');
  assert.equal(saleFollowupWindow('2026-10-25T01:00:00.000Z',folded).state,'due');
});

test('all repeated autumn minutes and all skipped spring minutes resolve consistently',()=>{
  const autumn={enabled:true,day:'sun',time:'01:30',activatedAt:'2026-10-24T00:00:00.000Z'};
  for(let minute=0;minute<60;minute++){
    const now=new Date(Date.parse('2026-10-25T01:00:00.000Z')+minute*60000).toISOString();
    assert.equal(saleFollowupWindow(now,autumn).state,'due',`fold minute ${minute}`);
  }
  for(let minute=0;minute<60;minute++){
    const gap={enabled:true,day:'sun',time:`01:${String(minute).padStart(2,'0')}`,activatedAt:'2026-03-28T00:00:00.000Z'};
    const actual=saleFollowupWindow('2026-03-29T01:00:00.000Z',gap);
    assert.equal(actual.state,'due');
    assert.deepEqual(actual.dueWindows,[due('2026-03-23','2026-03-29T01:00:00.000Z')]);
  }
});

test('Jersey transitions use stable instants across several calendar years',()=>{
  for(let year=2024;year<=2032;year++){
    const lastSunday=month=>{
      const day=new Date(Date.UTC(year,month,0));
      return day.getUTCDate()-day.getUTCDay();
    };
    const spring=`${year}-03-${String(lastSunday(3)).padStart(2,'0')}`;
    const autumn=`${year}-10-${String(lastSunday(10)).padStart(2,'0')}`;
    const schedule=(day,activation)=>({enabled:true,day:'sun',time:'01:30',activatedAt:activation});
    const springResult=saleFollowupWindow(`${spring}T01:00:00.000Z`,schedule(spring,`${year}-03-01T00:00:00.000Z`));
    const autumnResult=saleFollowupWindow(`${autumn}T01:00:00.000Z`,schedule(autumn,`${year}-10-01T00:00:00.000Z`));
    assert.equal(springResult.dueWindows.at(-1).dueAt,`${spring}T01:00:00.000Z`);
    assert.equal(autumnResult.dueWindows.at(-1).dueAt,`${autumn}T00:30:00.000Z`);
  }
});

test('fails closed if the runtime cannot resolve a Jersey offset',async()=>{
  const original=Intl.DateTimeFormat;
  try{
    Intl.DateTimeFormat=function(locales,options){
      if(options?.timeZoneName==='shortOffset')return {formatToParts:()=>[{type:'timeZoneName',value:'unknown'}]};
      return new original(locales,options);
    };
    const {saleFollowupWindow:withoutOffset}=await import('../../server/sale-followup-schedule.js?missing-offset');
    assert.deepEqual(withoutOffset('2026-11-02T09:00:00.000Z',monday),{state:'invalid_clock'});
  }finally{Intl.DateTimeFormat=original;}
});

test('summer midnight uses the Jersey week rather than the UTC calendar day',()=>{
  const sunday={enabled:true,day:'sun',time:'23:59',activatedAt:'2026-05-03T00:00:00.000Z'};
  assert.deepEqual(saleFollowupWindow('2026-05-03T23:00:00.000Z',sunday),
    result('due','2026-05-04',[due('2026-04-27','2026-05-03T22:59:00.000Z')]));
  assert.deepEqual(saleFollowupWindow('2026-05-03T23:00:00.000Z',
    {...sunday,activatedAt:'2026-05-03T22:59:00.001Z'}),result('waiting','2026-05-04',[]));
});

test('a date whose scheduled local week crosses the supported ISO year fails closed',()=>{
  const schedule={enabled:true,day:'sun',time:'23:00',activatedAt:'9999-12-01T00:00:00.000Z'};
  assert.deepEqual(saleFollowupWindow('9999-12-31T23:00:00.000Z',schedule),{state:'invalid_clock'});
});
