import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { firebaseSignOut } from "./firebase.js";
import Login from "./Login.jsx";
import Inbox from "./Inbox.jsx";
import Applicants from "./Applicants.jsx";
import NewApplicant from "./NewApplicant.jsx";
import ApplicantDetail from "./ApplicantDetail.jsx";
import Review from "./Review.jsx";
import Listings from "./Listings.jsx";
import ListingEditor from "./ListingEditor.jsx";
import Viewings from "./Viewings.jsx";
import Sales from "./Sales.jsx";
import SaleDetail from "./SaleDetail.jsx";
import Rentals, { Landlord, NewRental } from "./Rentals.jsx";
import RentalDetail from "./RentalDetail.jsx";
import Insights from "./Insights.jsx";
import Availability from "./Availability.jsx";
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

// R17: the setup pages, used rarely, in a menu at the end of the sections. Escape or a click elsewhere closes it; Escape
// and choosing a page give the focus back to its button, which is marked while one of its pages is open.
const SETTINGS = [["availability", "Availability"], ["tours", "3D tours"], ["users", "Users"]];
function SettingsMenu({ current }) {
  const [open, setOpen] = useState(false), box = useRef(null), button = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = e => { if (!box.current.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === "Escape") { setOpen(false); button.current.focus(); } };
    addEventListener("pointerdown", away);
    addEventListener("keydown", key);
    return () => { removeEventListener("pointerdown", away); removeEventListener("keydown", key); };
  }, [open]);
  useEffect(() => setOpen(false), [current]); // another page, however it was reached, closes it
  return <div className="settings" ref={box} onBlur={e => { if (e.relatedTarget && !box.current.contains(e.relatedTarget)) setOpen(false); }}>
    <button ref={button} type="button" aria-expanded={open} aria-controls="settings-menu"
      aria-current={SETTINGS.some(([k]) => k === current) ? "true" : undefined} onClick={() => setOpen(o => !o)}>Settings</button>
    <div id="settings-menu" className="menu" hidden={!open}>{SETTINGS.map(([k, t]) => <a key={k} href={`#/${k}`}
      aria-current={current === k ? "page" : undefined} onClick={() => { setOpen(false); button.current.focus(); }}>{t}</a>)}</div>
  </div>;
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

  const [path, query] = hash.replace(/^#\/?/, "").split("?");
  const [section, arg, sub] = path.split("/");
  const current = section === "p" && arg ? "listings" : ["applicants", "review", "listings", "viewings", "sales", "rentals", "insights", "availability", "users", "tours"].includes(section) ? section : "";
  // The Inbox counter in the navigation: every 30 s while signed in and the tab is visible. On the Inbox itself,
  // the page's own poll brings the counts (onCounts).
  const loadCounts = useCallback(() => api("/admin/notifications/counts").then(setCounts, () => {}), []);
  usePoll(loadCounts, me && !expired && current !== "" ? 30000 : null);

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

  const page = section === "p" && arg ? <ListingEditor key={arg} id={decodeURIComponent(arg)} />
    : section === "applicants" && arg === "new"
      ? <NewApplicant key={query ?? ""} contactId={new URLSearchParams(query).get("contact")} />
    : section === "applicants" && /^\d+$/.test(arg) ? <ApplicantDetail key={arg} id={arg} tab={sub} />
    : section === "applicants" ? <Applicants /> : section === "review" ? <Review />
    : section === "listings" ? <Listings /> : section === "viewings"
      ? <Viewings key={query ?? ""} listing={new URLSearchParams(query).get("listing")} />
    : section === "sales" && /^\d+$/.test(arg) ? <SaleDetail key={arg} id={arg} onChange={loadCounts} />
    : section === "sales" ? <Sales key={query ?? ""} buyer={new URLSearchParams(query).get("applicant")} onChange={loadCounts} />
    : section === "rentals" && arg === "new"
      ? <NewRental key={query ?? ""} landlordId={new URLSearchParams(query).get("landlord")} onChange={loadCounts} />
    : section === "rentals" && arg === "landlords" && /^\d+$/.test(sub) ? <Landlord key={sub} id={sub} />
    : section === "rentals" && /^\d+$/.test(arg) ? <RentalDetail key={arg} id={arg} onChange={loadCounts} />
    : section === "rentals" ? <Rentals onChange={loadCounts} />
    : section === "insights" ? <Insights /> : section === "availability" ? <Availability /> : section === "users" ? <Users me={me} />
    : section === "tours" ? <Tours /> : <Inbox paused={expired} onCounts={setCounts} />;
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
        <a href="#/review" aria-current={current === "review" ? "page" : undefined}>Review</a>
        <a href="#/listings" aria-current={current === "listings" ? "page" : undefined}>Listings</a>
        <a href="#/viewings" aria-current={current === "viewings" ? "page" : undefined}>Viewings</a>
        <a href="#/sales" aria-current={current === "sales" ? "page" : undefined}>Sales{counts.sales > 0
          && <span className="count">{counts.sales}<span className="sr"> overdue or waiting</span></span>}</a>
        <a href="#/rentals" aria-current={current === "rentals" ? "page" : undefined}>Rentals{counts.rentals > 0
          && <span className="count">{counts.rentals}<span className="sr"> to do</span></span>}</a>
        <a href="#/insights" aria-current={current === "insights" ? "page" : undefined}>Insights</a>
        <SettingsMenu current={current} />
      </nav>
      <a href="/" className="home">View website</a>
      <span className="who">{me}</span>
      <button type="button" className="btn ghost sm" title={`Signed in as ${me}`} onClick={logout}>Sign out</button>
    </header>
    {/* Every link in the page, like those in the header, asks first when there are unsaved changes. */}
    <main className="page" inert={expired} onClickCapture={e => { if (e.target.closest("a[href^='#']")) confirmLeave(e); }}>{page}</main>
    {/* Session expired mid-task: sign in again on top of the page so nothing typed is lost. */}
    {expired && <div className="modal" role="dialog" aria-modal="true" aria-label="Session expired">
      <Login title="Your session has expired" note="Sign in again; what you were editing is still here." onSignedIn={signedIn} home={false} />
    </div>}
  </>;
}
