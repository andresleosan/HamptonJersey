export function validateInput(value) {
  const keys=['accessClientId','accessClientSecret','sessionSecret','runId','buildId'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||
      keys.some(key=>!Object.hasOwn(value,key)))throw Error('QA input rejected');
  if(!/^run-[A-Za-z0-9_-]{1,64}$/.test(value.runId)||!/^\w{64}$/.test(value.buildId)||
      !/^[a-f0-9]{64}$/.test(value.buildId)||!/^[a-f0-9]{64}$/.test(value.sessionSecret))throw Error('QA input rejected');
  for(const name of ['accessClientId','accessClientSecret']){
    const item=value[name];if(typeof item!=='string'||item.length<16||item.length>512||/[^\x21-\x7e]/.test(item))throw Error('QA credential input rejected');
  }
  return value;
}
