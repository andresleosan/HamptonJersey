import { useEffect, useState } from "react";
import { api } from "./api.js";
import { firebaseSignOut } from "./firebase.js";
import Login from "./Login.jsx";
import Listings from "./Listings.jsx";
import ListingEditor from "./ListingEditor.jsx";
import Viewings from "./Viewings.jsx";
import Users from "./Users.jsx";
import Tours from "./Tours.jsx";
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
  if (me === undefined) return <p className="center">Loading…</p>;
  if (me === null) return <main className="center"><Login onSignedIn={signedIn} /></main>;

  const [section, arg] = hash.replace(/^#\/?/, "").split("/");
  const page = section === "p" && arg ? <ListingEditor key={arg} id={decodeURIComponent(arg)} />
    : section === "viewings" ? <Viewings /> : section === "users" ? <Users me={me} /> : section === "tours" ? <Tours /> : <Listings />;
  const current = ["viewings", "users", "tours"].includes(section) ? section : "";
  const logout = async () => {
    if (!confirmLeave()) return;
    await api("/session", { method: "DELETE" }).catch(() => {});
    await firebaseSignOut().catch(() => {});
    setMe(null);
  };
  return <>
    <header className="bar" inert={expired} onClick={e => { if (e.target.closest("a")) confirmLeave(e); }}>
      <a href="#/" className="brand">Hampton Estates · Admin</a>
      <nav aria-label="Sections">
        <a href="#/" aria-current={current === "" ? "page" : undefined}>Listings</a>
        <a href="#/viewings" aria-current={current === "viewings" ? "page" : undefined}>Viewing requests</a>
        <a href="#/tours" aria-current={current === "tours" ? "page" : undefined}>3D tours</a>
        <a href="#/users" aria-current={current === "users" ? "page" : undefined}>Users</a>
      </nav>
      <a href="/" className="home">View website</a>
      <span className="who">{me}</span>
      <button type="button" className="btn ghost sm" onClick={logout}>Sign out</button>
    </header>
    <main className="page" inert={expired}>{page}</main>
    {/* Session expired mid-task: sign in again on top of the page so nothing typed is lost. */}
    {expired && <div className="modal" role="dialog" aria-modal="true" aria-label="Session expired">
      <Login title="Your session has expired" note="Sign in again; what you were editing is still here." onSignedIn={signedIn} home={false} />
    </div>}
  </>;
}
