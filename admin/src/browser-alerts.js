const validCursor=c=>c&&Number.isSafeInteger(c.version)&&c.version>=0&&Number.isSafeInteger(c.id)&&c.id>=0;
const compare=(a,b)=>a.version-b.version||a.id-b.id;

// In-memory only. Web Locks elect one visible tab; BroadcastChannel shares technical cursors.
export function createBrowserAlerts(env,onChange=()=>{}) {
  const {Notification:Native,locks,document,BroadcastChannel:Channel}=env;
  const supported=!!(Native&&locks?.request&&Channel);
  let started=false,enabled=false,leader=false,requesting=false,busy=false,cursor=null,channel=null,timer=null;
  let releaseLock=null,abort=null,generation=0,nextAt=0;
  const visible=()=>document.visibilityState==='visible';
  const status=text=>onChange({supported,enabled,text});
  const merge=next=>{if(validCursor(next)&&(!cursor||compare(next,cursor)>0))cursor={version:next.version,id:next.id};};
  const broadcast=()=>{if(cursor)channel?.postMessage({cursor});};
  const release=()=>{generation++;abort?.abort();abort=null;busy=false;leader=false;const done=releaseLock;releaseLock=null;done?.();};
  const disable=()=>{enabled=false;release();status(Native?.permission==='denied'?'Blocked in browser settings':'Off');};
  const poll=async()=>{
    if(!started||!enabled||!leader||!visible()||busy||env.now()<nextAt)return;
    if(Native.permission!=='granted'){disable();return;}
    const ticket=generation,baseline=cursor===null,after=cursor&&{...cursor};
    busy=true;abort=new AbortController();nextAt=env.now()+30000;
    try {
      const response=await env.fetch('/admin/notification-alerts'+(after?`?version=${after.version}&id=${after.id}`:''),{signal:abort.signal});
      if(ticket!==generation||!started||!enabled||!visible())return;
      if(response.status===401){disable();env.onExpired();return;}
      if(!response.ok)throw new Error('Alert fetch failed');
      const data=await response.json();
      if(ticket!==generation||!started||!enabled||!visible())return;
      if(!validCursor(data?.cursor)||!Array.isArray(data.alerts)||typeof data.hasMore!=='boolean'
        ||data.alerts.length>200||data.alerts.some(a=>!validCursor(a)||a.id<1||a.version<1||compare(a,data.cursor)>0))throw new Error('Invalid alert metadata');
      if(!baseline)for(const item of data.alerts){
        if(cursor&&compare(item,cursor)<=0)continue;
        const notification=new Native('Hampton needs your attention',{body:'Open Inbox to review a task.',tag:`hampton-task:${item.id}:${item.version}`});
        notification.onclick=()=>{notification.close();if(started&&enabled)env.onOpen();};
        merge(item);
      }
      merge(data.cursor);broadcast();status('On while this panel is open');
    } catch {
      if(ticket===generation&&started&&enabled)status('On · connection unavailable; retrying');
    } finally {if(ticket===generation){busy=false;abort=null;}}
  };
  const acquire=()=>{
    if(!started||!enabled||!visible()||requesting||leader)return;
    requesting=true;
    Promise.resolve(locks.request('hampton:urgent-alerts',{ifAvailable:true},async lock=>{
      if(!lock||!started||!enabled||!visible())return;
      leader=true;nextAt=0;
      const held=new Promise(resolve=>{releaseLock=resolve;});
      poll();await held;
    })).catch(()=>{if(started)disable();}).finally(()=>{requesting=false;});
  };
  const tick=()=>{if(!visible())return;if(leader)poll();else acquire();};
  const visibility=()=>{if(!visible())release();else tick();};
  return {
    start(){if(started)return;started=true;status(supported?'Off':'Unavailable in this browser');if(!supported)return;
      channel=new Channel('hampton:urgent-alert-cursor');
      channel.onmessage=({data})=>{if(data?.hello)broadcast();if(validCursor(data?.cursor))merge(data.cursor);};
      channel.postMessage({hello:true});document.addEventListener('visibilitychange',visibility);timer=env.setInterval(tick,5000);
    },
    async enable(){if(!started||!supported)return;
      if(Native.permission==='denied'){status('Blocked in browser settings');return;}
      const permission=Native.permission==='granted'?'granted':await Native.requestPermission();
      if(!started)return;if(permission!=='granted'){status(permission==='denied'?'Blocked in browser settings':'Off');return;}
      enabled=true;status('On while this panel is open');channel?.postMessage({hello:true});acquire();
    },
    disable,
    stop(){started=false;enabled=false;release();if(timer!==null)env.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);channel?.close();channel=null;},
  };
}
