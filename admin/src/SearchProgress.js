import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
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
  const statusRef = useRef(null), buttonRef = useRef(null), restoreFocus = useRef(false);
  const pending = useRef(false), mounted = useRef(true), [busy, setBusy] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const buttonNode = useCallback(node => {
    if (!node && buttonRef.current) restoreFocus.current = document.activeElement === buttonRef.current;
    buttonRef.current = node;
  }, []);
  useLayoutEffect(() => {
    if (!stale && restoreFocus.current) {
      if (document.activeElement === document.body) statusRef.current?.focus();
      restoreFocus.current = false;
    }
  }, [stale]);
  const reload = () => {
    if (pending.current || reloading || typeof onReload !== 'function') return;
    pending.current = true;
    setBusy(true);
    let result;
    try { result = onReload(); } catch { result = Promise.reject(); }
    Promise.resolve(result).catch(() => {}).finally(() => {
      pending.current = false;
      if (mounted.current) setBusy(false);
    });
  };
  return h('div',{className:`search-progress${compact ? ' search-progress-compact' : ''}`},
    h('div',announce ? {'aria-live':'polite'} : null,
      stale && h('p',{className:'err'},"Couldn't refresh search status."),
      view && h('p',{ref:statusRef,tabIndex:-1},view.message),
      view?.recordedMessage && h('p',null,view.recordedMessage)),
    stale && h('button',{type:'button',className:'btn ghost sm search-progress-reload',
      ref:buttonNode, 'aria-disabled':busy || reloading || typeof onReload !== 'function' ? 'true' : undefined,onClick:reload},'Reload status'),
    view && h(React.Fragment,null,
      dateLine('Last recorded attempt',view.attempt), dateLine('Last successful inventory check',view.success),
      !compact && h('p',{className:'muted'},view.scope)));
}
