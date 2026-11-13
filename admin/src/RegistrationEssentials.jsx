import { isActive } from '../../server/applicants.js';
import { missingSearchEssentials } from '../../server/registration-result.js';
import { focusSearchEssential } from './registration-essentials.js';

// A read-only list derived from the saved search; editing an input alone never updates this list.
export default function RegistrationEssentials({ applicant, formRef }) {
  const essentials = applicant && isActive(applicant) ? missingSearchEssentials(applicant) : null;
  if (!essentials?.length) return null;
  return <section className="card" aria-labelledby="essential-heading">
    <h2 id="essential-heading">Details to confirm</h2>
    <p>Based on the saved residential search. Save changes to update this list. This does not show matching progress.</p>
    <ul>{essentials.map(item => <li key={item.key}>
      <button type="button" className="btn ghost sm" onClick={() => focusSearchEssential(formRef.current, item)}>
        {item.key === 'requirement_priorities' ? 'Review must-have priorities'
          : item.reason === 'priority_missing' ? `Review ${item.label} must-have priority` : `Confirm ${item.label}`}
      </button>
    </li>)}</ul>
  </section>;
}
