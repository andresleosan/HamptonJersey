import '../../site/requirements.css';
import {CRITERIA} from '../../site/requirements.js';
export default function RequirementSwitch({criterion, priority, onChange, disabled=false, invalid=false}) {
  const on=priority==='must';
  return <button type="button" className="req-switch" role="switch" aria-checked={on}
    aria-label={`${CRITERIA[criterion][0]} must-have`} aria-describedby={criterion==='budget' ? 'a-budget-limit' : undefined} aria-invalid={invalid || undefined} disabled={disabled}
    onClick={()=>onChange(on?'preferred':'must')}>
    <span>Must-have</span><span className="req-track" aria-hidden="true"/><span className="req-state" aria-hidden="true">{on?'On':'Off'}</span>
  </button>;
}
