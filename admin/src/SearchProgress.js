import React from 'react';
import {presentSearchProgress} from './searchProgressPresentation.js';

const h = React.createElement;
function dateLine(label, date) {
  if (!date) return null;
  return h('p',{className:'muted',key:label}, `${label}: `,
    date.unverified ? 'Unverified historical date: ' : null,
    h('time',{dateTime:date.dateTime},date.text),
    date.earlierVersion ? ' For an earlier version of this search.' : null);
}

// The caller supplies one authorized snapshot and a read-only reload callback.
// This component never fetches or initiates a check.
export default function SearchProgress({snapshot, compact=false, announce=false, stale=false, onReload, reloading=false}) {
  const view = snapshot ? presentSearchProgress(snapshot.search_progress,snapshot.match_counts,snapshot.server_time,{stale}) : null;
  return h('div',{className:`search-progress${compact ? ' search-progress-compact' : ''}`},
    stale && h('div',{className:'search-progress-error'},
      h('p',{className:'err'},"Couldn't refresh search status."),
      h('button',{type:'button',className:'btn ghost sm',disabled:reloading || typeof onReload !== 'function',onClick:onReload},'Reload status')),
    view && h(React.Fragment,null,
      h('p',announce ? {'aria-live':'polite'} : null,view.message),
      view.recordedMessage && h('p',null,view.recordedMessage),
      dateLine('Last recorded attempt',view.attempt), dateLine('Last successful inventory check',view.success),
      !compact && h('p',{className:'muted'},view.scope)));
}
