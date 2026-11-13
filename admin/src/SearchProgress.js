import React, {useLayoutEffect, useRef} from 'react';
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
  const statusRef = useRef(null), retryRef = useRef(false), wasReloading = useRef(false);
  useLayoutEffect(() => {
    if (!stale && retryRef.current) {
      // Only restore focus after an explicit retry, and never steal it if the user moved elsewhere.
      if (document.activeElement === document.body) statusRef.current?.focus();
      retryRef.current = false;
    } else if (stale && wasReloading.current && !reloading) {
      retryRef.current = false;
    }
    wasReloading.current = reloading;
  }, [stale, reloading]);
  const reload = () => {
    if (reloading || typeof onReload !== 'function') return;
    retryRef.current = true;
    onReload();
  };
  return h('div',{className:`search-progress${compact ? ' search-progress-compact' : ''}`},
    h('div',announce ? {'aria-live':'polite'} : null,
      stale && h('p',{className:'err'},"Couldn't refresh search status."),
      view && h('p',{ref:statusRef,tabIndex:-1},view.message),
      view?.recordedMessage && h('p',null,view.recordedMessage)),
    stale && h('button',{type:'button',className:'btn ghost sm search-progress-reload',
      'aria-disabled':reloading || typeof onReload !== 'function' ? 'true' : undefined,onClick:reload},'Reload status'),
    view && h(React.Fragment,null,
      dateLine('Last recorded attempt',view.attempt), dateLine('Last successful inventory check',view.success),
      !compact && h('p',{className:'muted'},view.scope)));
}
