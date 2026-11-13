const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),React=require('react'),{createRoot}=require('react-dom/client');

test('choosing either unknown priority transfers focus without stealing it on external updates',async()=>{
  const dom=new JSDOM('<main id="root"></main><button id="outside">Outside</button>',{url:'http://localhost/',pretendToBeVisual:true});
  const old={window:global.window,document:global.document,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
  global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
  const {createServer}=await import('vite');const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});let root,setPriority;
  try {
    const {default:Control}=await vite.ssrLoadModule('/admin/src/RequirementSwitch.jsx');
    function Harness(){const [priority,set]=React.useState('unknown');setPriority=set;return React.createElement(Control,{criterion:'near',priority,onChange:set});}
    root=createRoot(document.getElementById('root'));await React.act(()=>root.render(React.createElement(Harness)));
    for(const [choice,state] of [['Must-have','true'],['Preferred','false']]){
      await React.act(()=>setPriority('unknown'));
      const button=document.querySelector(`[aria-label="Near somewhere: choose ${choice}"]`);button.focus();
      await React.act(()=>button.click());
      const control=document.querySelector('[role=switch]');assert.equal(control.getAttribute('aria-checked'),state);assert.equal(document.activeElement===control,true);
    }
    await React.act(()=>setPriority('unknown'));document.getElementById('outside').focus();
    await React.act(()=>setPriority('must'));assert.equal(document.activeElement.id,'outside');
  } finally {if(root)await React.act(()=>root.unmount());await vite.close();dom.window.close();for(const [k,v] of Object.entries(old))v===undefined?delete global[k]:global[k]=v;}
});
