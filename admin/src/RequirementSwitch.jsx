import '../../site/requirements.css';
import {CRITERIA} from '../../site/requirements.js';
export default function RequirementSwitch({criterion, priority, onChange, disabled=false, invalid=false}) {
  const label=CRITERIA[criterion][0];
  if (priority !== 'must' && priority !== 'preferred') return <span className="req-unconfirmed" role="group" aria-label={`${label} priority to confirm`}>
    <span>Priority to confirm</span>
    <button type="button" className="btn ghost sm" data-priority-review={criterion} aria-label={`${label}: choose Must-have`} disabled={disabled} onClick={()=>onChange('must')}>Must-have</button>
    <button type="button" className="btn ghost sm" aria-label={`${label}: choose Preferred`} disabled={disabled} onClick={()=>onChange('preferred')}>Preferred</button>
  </span>;
  const on=priority==='must';
  return <button type="button" className="req-switch" role="switch" aria-checked={on}
    aria-label={`${CRITERIA[criterion][0]} must-have`} aria-describedby={criterion==='budget' ? 'a-budget-limit' : undefined} aria-invalid={invalid || undefined} disabled={disabled}
    onClick={()=>onChange(on?'preferred':'must')}>
    <span>Must-have</span><span className="req-track" aria-hidden="true"/><span className="req-state" aria-hidden="true">{on?'On':'Off'}</span>
  </button>;
}
