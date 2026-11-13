// Synthetic in-memory SQLite measurement. No network, remote database or production data.
import {performance} from 'node:perf_hooks';
import {makeEnv,seedListing,T0} from '../../../../tests/server/helpers.mjs';
import {recomputeForApplicantWithStatus} from '../../../../server/match-store.js';

for (const size of [0,100,1000,5000]) {
  const env=makeEnv(),db=env.DB.raw;
  db.prepare("INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Fixture','est01-measure@example.test',?,?,?)").run(T0,T0,T0);
  db.prepare("INSERT INTO applicants(contact_id,operation,source,budget_max,created_at,updated_at) VALUES(1,'buy','phone',500000,?,?)").run(T0,T0);
  db.exec('BEGIN');
  try {
    for(let i=0;i<size;i++) seedListing(env,{id:`EST-BENCH-${String(i).padStart(5,'0')}`,matchable:1,sale_price:900000});
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
  const prepare=env.DB.prepare.bind(env.DB),batch=env.DB.batch.bind(env.DB);
  let guard=null, measurements=null;
  env.DB.prepare=statement=>{
    const prepared=prepare(statement);
    if(statement.startsWith('UPDATE applicants SET updated_at=CASE WHEN')) return {bind:(...args)=>{
      guard={statement,args}; return prepared.bind(...args);
    }};
    return prepared;
  };
  env.DB.batch=async statements=>{
    if(guard && !measurements) {
      const statement=db.prepare(guard.statement),times=[];
      for(let i=0;i<25;i++) {const start=performance.now(); statement.run(...guard.args); times.push(performance.now()-start);}
      times.sort((a,b)=>a-b);
      const plan=db.prepare(`EXPLAIN QUERY PLAN ${guard.statement}`).all(...guard.args).map(row=>row.detail);
      measurements={median_ms:Number(times[12].toFixed(3)),p95_ms:Number(times[23].toFixed(3)),
        versions_json_bytes:Buffer.byteLength(guard.args[0]),sql_bytes:Buffer.byteLength(guard.statement),bindings:guard.args.length,plan};
    }
    return batch(statements);
  };
  const start=performance.now(),result=await recomputeForApplicantWithStatus(env,1,'system');
  console.log(JSON.stringify({candidates:size,guard:measurements,total_ms:Number((performance.now()-start).toFixed(3)),result}));
  db.close();
}
