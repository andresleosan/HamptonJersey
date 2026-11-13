// PUB-10: no personal data is written to browser storage or URLs. Retry keeps one request ID in memory.
export async function renderOwner(root,{tsKey,tsReady}) {
 let active=true; const alive=()=>active&&location.hash==='#/owners';
 const stop=()=>{active=false;removeEventListener('hashchange',stop)};addEventListener('hashchange',stop,{once:true});
 root.innerHTML='<section class="block"><div class="wrap"><h1>Sell or let your property</h1><p role="status">Checking availability…</p></div></section>';
 let availability;
 try{const r=await fetch('/api/owner-requests/availability',{cache:'no-store'});if(!r.ok)throw Error();availability=await r.json();}
 catch{if(alive())root.querySelector('[role=status]').textContent='We cannot check availability right now. Please contact the office.';return;}
 if(!alive())return;
 if(!availability.available){root.querySelector('[role=status]').textContent='Online requests are not available yet. Please contact the office.';return;}
 root.querySelector('.wrap').innerHTML=`<h1>Sell or let your property</h1><p>Tell us about your property and the team will contact you.</p>
 <form class="owner-form"><label class="field"><span>Name</span><input name="name" autocomplete="name" maxlength="120" required></label>
 <label class="field"><span>Telephone</span><input name="phone" type="tel" autocomplete="tel" maxlength="40" required></label>
 <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
 <label class="field"><span>Property address</span><textarea name="address" maxlength="400" minlength="5" required></textarea></label>
 <label class="field"><span>What would you like to do?</span><select name="operation" required><option value="">Choose one</option><option value="sale">Sell</option><option value="rent">Let</option></select></label>
 <label><input type="checkbox" name="valuation_requested"> I would like a valuation</label>
 <p>See our <a href="#/privacy" target="_blank" rel="noopener noreferrer">privacy notice (opens in a new tab)</a>.</p>
 <div class="ts"></div><p role="alert"></p><button class="btn" type="submit">Send request</button></form>`;
 const form=root.querySelector('form'),status=form.querySelector('[role=alert]'),button=form.querySelector('button');
 const fieldNames=['name','phone','email','address','operation','valuation_requested'];
 const clearFieldError=name=>{const field=form.elements.namedItem(name),message=form.querySelector(`#owner-error-${name}`);if(!field)return;field.removeAttribute('aria-invalid');field.removeAttribute('aria-describedby');message?.remove();};
 const clearFieldErrors=()=>fieldNames.forEach(clearFieldError);
 const showFieldErrors=(errors,submitted)=>{
  clearFieldErrors();let first=null;
  if(!errors||typeof errors!=='object'||Array.isArray(errors))return false;
  for(const name of fieldNames){const field=form.elements.namedItem(name),text=errors[name];if(!field||typeof text!=='string'||!text.trim())continue;
   const current=field.type==='checkbox'?field.checked:field.value;
   if(current!==submitted[name])continue; // A late response belongs to the value actually submitted.
   const message=document.createElement('span');message.id=`owner-error-${name}`;message.className='err';message.textContent=text;
   field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',message.id);field.closest('label').append(message);first??=field;
  }
  first?.focus();return !!first;
 };
 form.addEventListener('input',e=>{if(fieldNames.includes(e.target.name))clearFieldError(e.target.name);});
 form.addEventListener('change',e=>{if(fieldNames.includes(e.target.name))clearFieldError(e.target.name);});
 let requestId=crypto.randomUUID(),widget=null,pending=false,frozen=null;
 if(tsKey&&tsReady)tsReady.then(()=>{if(alive()&&form.querySelector('.ts'))widget=turnstile.render(form.querySelector('.ts'),{sitekey:tsKey});});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(pending||!form.reportValidity())return;
  const data=new FormData(form),token=widget===null?'':turnstile.getResponse(widget);
  const payload={request_id:requestId,name:data.get('name'),phone:data.get('phone'),email:data.get('email'),address:data.get('address'),operation:data.get('operation'),valuation_requested:data.has('valuation_requested'),privacy_version:availability.privacy_version,token};
  const withoutToken=JSON.stringify({...payload,token:undefined});
  if(frozen&&frozen!==withoutToken){status.textContent='A previous request may have been sent. Restore those details and retry, or contact the office.';return;}
  if(!token){status.textContent='Please complete the verification.';return;}
  pending=true;button.disabled=true;status.textContent='Sending…';
  try {
   const r=await fetch('/api/owner-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
   const out=await r.json().catch(()=>({}));if(!alive())return;
   if(r.ok){root.querySelector('.wrap').innerHTML='<h1>Request received</h1><p role="status">Thank you. Hampton Estates will contact you.</p>';return;}
   const highlighted=r.status===400&&showFieldErrors(out.fields,payload);
   if(r.status>=500)frozen=withoutToken; else if(r.status===409)frozen=withoutToken;
   status.textContent=r.status===400&&!highlighted?'Please check your details and try again.':out.error||'Could not send your request. Please try again.';
  }catch{if(alive()){frozen=withoutToken;status.textContent='We could not confirm whether your request was sent. Please retry with the same details.';}}
  finally{pending=false;button.disabled=false;if(widget!==null)turnstile.reset(widget);}
 });
}
