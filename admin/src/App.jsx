import { useEffect, useState } from "react";
import { api } from "./api.js";
import { firebaseSignOut } from "./firebase.js";
import Login from "./Login.jsx";
import Listings from "./Listings.jsx";
import ListingEditor from "./ListingEditor.jsx";
import Viewings from "./Viewings.jsx";
import Users from "./Users.jsx";
import { confirmLeave } from "./unsaved.js";

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return hash;
}

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = checking, null = signed out
  const [expired, setExpired] = useState(false);
  const hash = useHash();
  useEffect(() => {
    api("/me").then(d => setMe(d.email), () => setMe(null));
    const f = () => setExpired(true);
    addEventListener("hs:signed-out", f);
    return () => removeEventListener("hs:signed-out", f);
  }, []);

  const signedIn = email => { setMe(email); setExpired(false); };
  if (me === undefined) return <p className="center">Cargando…</p>;
  if (me === null) return <main className="center"><Login onSignedIn={signedIn} /></main>;

  const [section, arg] = hash.replace(/^#\/?/, "").split("/");
  const page = section === "p" && arg ? <ListingEditor key={arg} id={decodeURIComponent(arg)} />
    : section === "solicitudes" ? <Viewings /> : section === "usuarios" ? <Users me={me} /> : <Listings />;
  const current = section === "solicitudes" || section === "usuarios" ? section : "";
  const logout = async () => {
    if (!confirmLeave()) return;
    await api("/session", { method: "DELETE" }).catch(() => {});
    await firebaseSignOut().catch(() => {});
    setMe(null);
  };
  return <>
    <header className="bar" inert={expired} onClick={e => { if (e.target.closest("a")) confirmLeave(e); }}>
      <a href="#/" className="brand">Hampton Estates · Panel</a>
      <nav aria-label="Secciones">
        <a href="#/" aria-current={current === "" ? "page" : undefined}>Propiedades</a>
        <a href="#/solicitudes" aria-current={current === "solicitudes" ? "page" : undefined}>Solicitudes</a>
        <a href="#/usuarios" aria-current={current === "usuarios" ? "page" : undefined}>Usuarios</a>
      </nav>
      <a href="/" className="home">Ver la web</a>
      <span className="who">{me}</span>
      <button type="button" className="btn ghost sm" onClick={logout}>Salir</button>
    </header>
    <main className="page" inert={expired}>{page}</main>
    {/* Session expired mid-task: sign in again on top of the page so nothing typed is lost. */}
    {expired && <div className="modal" role="dialog" aria-modal="true" aria-label="Sesión caducada">
      <Login title="Tu sesión ha caducado" note="Vuelve a entrar; lo que estabas editando sigue aquí." onSignedIn={signedIn} home={false} />
    </div>}
  </>;
}
