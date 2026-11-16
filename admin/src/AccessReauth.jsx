import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

// PRE-06: Cloudflare Access wants its security sign-in again. It opens in another tab, so this one keeps what was being
// typed; nothing is sent again on its own. "I've signed in" only reads /api/me to see that the way is open again.
export default function AccessReauth({ onDone }) {
  const [state, setState] = useState({}), link = useRef(null);
  useEffect(() => { link.current.focus(); }, []);
  const check = async () => {
    if (state.busy) return; // not disabled while checking, so the focus stays on the button
    setState({ busy: true });
    try { await api("/me"); onDone(); }
    catch (e) {
      if (e.status === 401) return onDone(); // Hampton's own session ended too: its sign-in takes over
      setState({ error: e.code === "ACCESS_REAUTH_REQUIRED" ? "Hampton still can't see your security sign-in. Finish it in the other tab, then try again."
        : e.message });
    }
  };
  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="access-reauth-title">
    <section className="card login access-reauth">
      <h1 id="access-reauth-title">Sign in again to continue</h1>
      <p>Your security sign-in has expired. Open it in a new tab, sign in, then come back here. What you were editing is
        still in this tab.</p>
      <p>If you were saving something, check whether it was saved before you try again.</p>
      <a ref={link} className="btn" href="/admin/" target="_blank" rel="noopener noreferrer">Open sign-in in a new tab</a>
      <button type="button" className="btn ghost" onClick={check} aria-busy={state.busy || undefined}>{state.busy ? "Checking…" : "I've signed in"}</button>
      {state.error && <p role="alert" className="err">{state.error}</p>}
    </section>
  </div>;
}
