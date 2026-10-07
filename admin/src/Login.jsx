import { useState } from "react";
import { googleIdToken, firebaseSignOut } from "./firebase.js";
import { api } from "./api.js";

export default function Login({ onSignedIn, title = "Panel de Hampton Estates", note = "Entra con tu cuenta de Google autorizada." }) {
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
        : "No se pudo abrir el acceso con Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo." });
    }
  };
  return <section className="card login" aria-labelledby="login-title">
    <h1 id="login-title">{title}</h1>
    {state.denied ? <>
      <p role="alert">Esta cuenta no tiene acceso. Pide a un administrador que añada tu email.</p>
      <button type="button" className="btn" onClick={() => setState({})}>Salir</button>
    </> : <>
      <p>{note}</p>
      <button type="button" className="btn" onClick={go} disabled={state.busy}>{state.busy ? "Entrando…" : "Entrar con Google"}</button>
      {state.error && <p role="alert" className="err">{state.error}</p>}
    </>}
  </section>;
}
