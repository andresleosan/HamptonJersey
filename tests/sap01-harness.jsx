// Synthetic harness: no API, identity, real data, or product integration.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import SearchProgress from '../admin/src/SearchProgress.js';
const empty={version:1,scope:'hampton_inventory',lifecycle:'active',state:'unrecorded',last_attempt_at:null,
  attempt_finished_at:null,last_success_at:null,last_success_checked_count:null,last_attempt_current:false,last_success_current:false};
const snapshot={search_progress:empty,match_counts:{found:0,shortlisted:0,rejected:0},server_time:'2026-11-10T10:05:00.000Z'};
function Harness(){
  const [stale,setStale]=useState(true),[reloads,setReloads]=useState(0),[reloading,setReloading]=useState(false);
  return <main className="page"><h1>Synthetic search progress</h1><SearchProgress snapshot={snapshot} announce stale={stale} reloading={reloading}
    onReload={()=>{setReloads(x=>x+1);setReloading(true);setTimeout(()=>{setReloading(false);setStale(false);},200);}}/><p>Retries: {reloads}</p></main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
