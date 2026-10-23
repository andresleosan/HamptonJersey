import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { firebaseSignOut } from "./firebase.js";
import Login from "./Login.jsx";
import Inbox from "./Inbox.jsx";
import Applicants from "./Applicants.jsx";
import NewApplicant from "./NewApplicant.jsx";
import ApplicantDetail from "./ApplicantDetail.jsx";
import Listings from "./Listings.jsx";
import ListingEditor from "./ListingEditor.jsx";
import Viewings from "./Viewings.jsx";
import Users from "./Users.jsx";
import Tours from "./Tours.jsx";
import { confirmLeave } from "./unsaved.js";
import { usePoll } from "./poll.js";

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
  const [counts, setCounts] = useState({});
  const hash = useHash();
  useEffect(() => {
    api("/me").then(d => setMe(d.email), () => setMe(null));
    const f = () => setExpired(true);
    addEventListener("hs:signed-out", f);
    return () => removeEventListener("hs:signed-out", f);
  }, []);

  // The Inbox counter in the navigation: every 30 s while signed in and the tab is visible.
  const loadCounts = useCallback(() => api("/admin/notifications/counts").then(setCounts, () => {}), []);
  usePoll(loadCounts, me && !expired ? 30000 : null);

  // The sticky bar's height (it wraps on phones) for `scroll-padding-top`: a focused field never lands under it.
  const bar = useRef(null);
  useEffect(() => {
    if (!bar.current) return;
    const ro = new ResizeObserver(([e]) => document.documentElement.style.setProperty("--bar-h", `${e.target.offsetHeight}px`));
    ro.observe(bar.current);
    return () => ro.disconnect();
  }, [me]);

  const signedIn = email => { setMe(email); setExpired(false); };
  if (me === undefined) return <p className="center">Loading…</p>;
  if (me === null) return <main className="center"><Login onSignedIn={signedIn} /></main>;

  const [path, query] = hash.replace(/^#\/?/, "").split("?");
  const [section, arg, sub] = path.split("/");
  const page = section === "p" && arg ? <ListingEditor key={arg} id={decodeURIComponent(arg)} />
    : section === "applicants" && arg === "new"
      ? <NewApplicant key={query ?? ""} contactId={new URLSearchParams(query).get("contact")} />
    : section === "applicants" && /^\d+$/.test(arg) ? <ApplicantDetail key={arg} id={arg} tab={sub} />
    : section === "applicants" ? <Applicants />
    : section === "listings" ? <Listings /> : section === "viewings" ? <Viewings /> : section === "users" ? <Users me={me} />
    : section === "tours" ? <Tours /> : <Inbox paused={expired} onCounts={setCounts} />;
  const current = section === "p" && arg ? "listings" : ["applicants", "listings", "viewings", "users", "tours"].includes(section) ? section : "";
  const logout = async () => {
    if (!confirmLeave()) return;
    await api("/session", { method: "DELETE" }).catch(() => {});
    await firebaseSignOut().catch(() => {});
    setMe(null);
  };
  return <>
    <header ref={bar} className="bar" inert={expired} onClick={e => { if (e.target.closest("a")) confirmLeave(e); }}>
      <a href="#/" className="brand">Hampton Estates · Admin</a>
      <nav aria-label="Sections">
        <a href="#/" aria-current={current === "" ? "page" : undefined}>Inbox{counts.action > 0
          && <span className="count">{counts.action}<span className="sr"> need action</span></span>}</a>
        <a href="#/applicants" aria-current={current === "applicants" ? "page" : undefined}>Applicants</a>
        <a href="#/listings" aria-current={current === "listings" ? "page" : undefined}>Listings</a>
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
