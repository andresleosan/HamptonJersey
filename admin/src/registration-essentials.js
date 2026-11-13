// Targets are fixed controls in ApplicantFields, never selectors from saved applicant data.
const FIELDS = {
  parking: '#a-parking_spaces', area: '[name="a-area_answer"]', type: '[name="a-property_types"]',
  bedrooms: '#a-bedrooms_min', bathrooms: '#a-bathrooms_min', garden: '#a-outdoor-garden',
  terrace: '#a-outdoor-terrace', balcony: '#a-outdoor-balcony', furnished: '#a-furnished',
  pets: '#a-pets input', budget: '#a-budget_max', move_in_date: '#a-move_in_date',
  lease_term_months: '#a-lease_term_months', near: '#a-near', requirements: '#a-requirements',
  children: '#a-household_children_status',
};

export function focusSearchEssential(form, item) {
  if (!form || !item) return;
  if (item.reason === 'priority_missing') {
    const choices = [...form.querySelectorAll('[data-priority-review]')].filter(el => !el.disabled);
    const choice = item.key === 'requirement_priorities' ? choices[0] : choices.find(el => el.dataset.priorityReview === item.key);
    if (choice) { choice.focus(); return; }
    const switches = [...form.querySelectorAll('[role="switch"]')].filter(el => !el.disabled);
    const target = item.key === 'requirement_priorities' ? switches[0]
      : switches.find(el => el.getAttribute('aria-label') === `${item.label} must-have`);
    if (target) { target.focus(); return; }
  }
  const selector = Object.hasOwn(FIELDS, item.key) ? FIELDS[item.key] : null;
  if (selector) form.querySelector(selector)?.focus();
}
