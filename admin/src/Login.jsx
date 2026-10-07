import { useState } from "react";
import { googleIdToken, firebaseSignOut } from "./firebase.js";
import { api } from "./api.js";

export default function Login({ onSignedIn, title = "Hampton Estates admin", note = "Sign in with your authorised Google account.", home = true }) {
  const [state, setState] = useState({});
  const go = async () => {
    setState({ busy: true });
    try {
      const idToken = await googleIdToken();
      const { email } = await api("/session", { method: "POST", body: { idToken } });
      onSignedIn(email);
    } catch (e) {
      if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return setState({});
      if (e.status === 403) { await firebaseSignOut().catch(() => {}); return setState({ denied: true }); }
      setState({ error: e.status != null ? e.message
        : "Couldn't open Google sign-in. Allow pop-ups for this site and try again." });
    }
  };
  return <section className="card login" aria-labelledby="login-title">
    <h1 id="login-title">{title}</h1>
    {state.denied ? <>
      <p role="alert">This account doesn't have access. Ask an administrator to add your email.</p>
      <button type="button" className="btn" onClick={() => setState({})}>Sign out</button>
    </> : <>
      <p>{note}</p>
      <button type="button" className="btn" onClick={go} disabled={state.busy} autoFocus={!home}>{state.busy ? "Signing in…" : "Sign in with Google"}</button>
      {state.error && <p role="alert" className="err">{state.error}</p>}
    </>}
    {home && <a href="/" className="home">← Back to the website</a>}
  </section>;
}
