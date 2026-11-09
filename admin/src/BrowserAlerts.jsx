import {useEffect,useRef,useState} from 'react';
import {createBrowserAlerts} from './browser-alerts.js';

export default function BrowserAlerts({paused,onOpen}) {
  const controller=useRef(null),open=useRef(onOpen);open.current=onOpen;
  const [state,setState]=useState({supported:false,enabled:false,text:'Off'}),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(paused)return;
    const c=createBrowserAlerts({Notification:window.Notification,locks:navigator.locks,BroadcastChannel:window.BroadcastChannel,document,
      now:()=>Date.now(),setInterval:(fn,ms)=>window.setInterval(fn,ms),clearInterval:id=>window.clearInterval(id),fetch:(path,{signal})=>fetch('/api'+path,{credentials:'same-origin',signal}),
      onOpen:()=>open.current(),onExpired:()=>window.dispatchEvent(new Event('hs:signed-out'))},setState);
    controller.current=c;c.start();return()=>{c.stop();controller.current=null;};
  },[paused]);
  const enable=async()=>{setBusy(true);try{await controller.current?.enable();}catch{setState(s=>({...s,text:'Browser permission could not be enabled'}));}finally{setBusy(false);}};
  return <details className="inbox-preferences browser-alerts"><summary>Urgent browser alerts</summary>
    <p>Optional alerts for urgent work while the staff panel is open. Alerts contain no client details.</p>
    <p role="status">{paused?'Paused until you sign in again':state.text}</p>
    {state.enabled?<button type="button" className="btn ghost sm" onClick={()=>controller.current?.disable()}>Turn off browser alerts</button>
      :<button type="button" className="btn ghost sm" disabled={paused||busy||!state.supported} onClick={enable}>{busy?'Waiting for browser…':'Enable browser alerts'}</button>}
  </details>;
}
