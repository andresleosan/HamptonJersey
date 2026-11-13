let viewGeneration=0;
// This page consumes only an already-approved aggregate DTO; no private draft or source data is embedded.
export async function renderDemand(root) {
  const generation=++viewGeneration;
  root.replaceChildren();
  const section=document.createElement('section'); section.className='block';
  const wrap=document.createElement('div'); wrap.className='wrap'; section.append(wrap);root.append(section);
  const h=document.createElement('h1');h.textContent='Property search demand';wrap.append(h);
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Loading demand…';wrap.append(status);
  try {
    const response=await fetch('/api/demand/current',{cache:'no-store'});
    if(!response.ok) throw new Error('unavailable');
    const data=await response.json(); if(location.hash!=='#/demand' || generation!==viewGeneration) return;
    if(data.status!=='available'||!Array.isArray(data.snapshots)||!data.snapshots.length) {status.textContent='Demand figures are not available at present.';return;}
    status.remove();
    for(const snapshot of data.snapshots) {
      if(!snapshot || !Array.isArray(snapshot.cells) || !['rent','buy'].includes(snapshot.operation) || typeof snapshot.definition!=='string') throw new Error('invalid');
      const block=document.createElement('section'), title=document.createElement('h2'), definition=document.createElement('p'), date=document.createElement('p');
      title.textContent=snapshot.operation==='rent'?'To rent':'To buy';definition.textContent=snapshot.definition;
      date.textContent=`As of ${snapshot.as_of} · valid until ${snapshot.valid_until}`; block.append(title,definition,date);
      const list=document.createElement('ul');
      for(const cell of snapshot.cells) {
        if(!cell || typeof cell.parish!=='string' || typeof cell.bedroom_band!=='string' || !Number.isSafeInteger(cell.display_count) || cell.display_count<5) throw new Error('invalid');
        const li=document.createElement('li');li.textContent=`${cell.parish} · minimum bedrooms ${cell.bedroom_band} · ${cell.display_count}`;list.append(li);
      }
      if(!snapshot.cells.length) {const p=document.createElement('p');p.textContent='No figures are available to display.';block.append(p);} else block.append(list);
      wrap.append(block);
    }
    const contact=document.createElement('a');contact.href='/#team';contact.className='btn ghost';contact.textContent='Contact our team';wrap.append(contact);
  } catch {
    if(location.hash!=='#/demand' || generation!==viewGeneration) return;
    wrap.replaceChildren(h); const p=document.createElement('p');p.setAttribute('role','alert');p.textContent="We couldn't load demand figures. Please try again.";
    const button=document.createElement('button');button.type='button';button.className='btn ghost';button.textContent='Try again';button.addEventListener('click',()=>renderDemand(root));wrap.append(p,button);
  }
}
