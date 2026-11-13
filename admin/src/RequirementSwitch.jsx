import {useLayoutEffect, useRef} from 'react';
import '../../site/requirements.css';
import {CRITERIA} from '../../site/requirements.js';
export default function RequirementSwitch({criterion, priority, onChange, disabled=false, invalid=false}) {
  const label=CRITERIA[criterion][0];
  const switchRef=useRef(null), restoreFocus=useRef(false);
  const known=priority === 'must' || priority === 'preferred';
  useLayoutEffect(()=>{
    if (known && restoreFocus.current) { restoreFocus.current=false; switchRef.current?.focus(); }
  },[known]);
  const choose=(event, next)=>{ restoreFocus.current = event.currentTarget === document.activeElement; onChange(next); };
  const description=[criterion === 'budget' ? 'a-budget-limit' : null, invalid ? 'ae-requirement_priorities' : null].filter(Boolean).join(' ') || undefined;
  if (!known) return <span className="req-unconfirmed" role="group" aria-label={`${label} priority to confirm`}>
    <span>Priority to confirm</span>
    <button type="button" className="btn ghost sm" data-priority-review={criterion} aria-label={`${label}: choose Must-have`} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={description} onClick={e=>choose(e,'must')}>Must-have</button>
    <button type="button" className="btn ghost sm" aria-label={`${label}: choose Preferred`} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={description} onClick={e=>choose(e,'preferred')}>Preferred</button>
  </span>;
  const on=priority==='must';
  return <button ref={switchRef} type="button" className="req-switch" role="switch" aria-checked={on}
    aria-label={`${CRITERIA[criterion][0]} must-have`} aria-describedby={description} aria-invalid={invalid || undefined} disabled={disabled}
    onClick={()=>onChange(on?'preferred':'must')}>
    <span>Must-have</span><span className="req-track" aria-hidden="true"/><span className="req-state" aria-hidden="true">{on?'On':'Off'}</span>
  </button>;
}
