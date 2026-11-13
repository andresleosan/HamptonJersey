import { createElement as h } from 'react';
import { fmtDayMonth } from './format.js';

export function ActivityTable({ data }) {
  const headers = ['Action', 'Source', 'Stored count', 'Unit', 'Coverage', 'First observed in period'];
  return h('div', null,
    h('p', { className: 'muted' }, `Selected period: ${fmtDayMonth(data.period.from)} to ${fmtDayMonth(data.period.to)}.`),
    h('p', { className: 'muted' }, data.coverage.notes),
    h('div', { className: 'table-scroll', role: 'region', 'aria-label': 'Website activity sources', tabIndex: 0 },
      h('table', { className: 'list', 'aria-label': 'Website activity sources' },
        h('thead', null, h('tr', null, headers.map(name => h('th', { scope: 'col', key: name }, name)))),
        h('tbody', null, data.sources.map(source => h('tr', { key: source.key },
          h('th', { scope: 'row' }, source.label, h('div', { className: 'muted' }, source.definition)),
          h('td', null, source.source),
          h('td', { className: 'num' }, source.count == null ? 'Not tracked' : source.count.toLocaleString('en-GB')),
          h('td', null, 'Recorded actions'),
          h('td', null, source.coverage === 'not_configured' ? 'Not integrated' : source.coverage === 'partial' ? 'Partial' : 'Unknown'),
          h('td', null, source.first_observed_day ? fmtDayMonth(source.first_observed_day) : '—')
        )))
      )
    ),
    h('p', { className: 'muted' }, 'Listing and gallery counts use the website’s daily counters. The first stored day in the period is not the start of measurement. A zero is a stored count, not evidence of no visitors.')
  );
}

export function ActivityState({ status, data, onRetry }) {
  if (status === 'loading') return h('p', { role: 'status' }, 'Loading website activity…');
  if (status === 'error') return h('p', { role: 'alert', className: 'err' }, 'Website activity is unavailable. ',
    h('button', { type: 'button', className: 'btn ghost sm', onClick: onRetry }, 'Retry activity'));
  return h(ActivityTable, { data });
}

// The parent report already reads the same date range; reuse its aggregate instead of another D1 scan.
export default function Activity({ data, busy, error, onRetry }) {
  const status = error ? 'error' : busy || !data ? 'loading' : 'ready';
  return h('section', { className: 'block', 'aria-labelledby': 'h-activity' },
    h('h2', { id: 'h-activity' }, 'Website activity'),
    h(ActivityState, { status, data, onRetry })
  );
}
