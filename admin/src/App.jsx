import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { firebaseSignOut } from "./firebase.js";
import Login from "./Login.jsx";
import Inbox from "./Inbox.jsx";
import BrowserAlerts from "./BrowserAlerts.jsx";
import Applicants from "./Applicants.jsx";
import NewApplicant from "./NewApplicant.jsx";
import ApplicantDetail from "./ApplicantDetail.jsx";
import Review from "./Review.jsx";
import Queue from "./Queue.jsx";
import Listings from "./Listings.jsx";
import ListingEditor from "./ListingEditor.jsx";
import Viewings from "./Viewings.jsx";
import Sales from "./Sales.jsx";
import SaleDetail from "./SaleDetail.jsx";
import Rentals, { Landlord, NewRental } from "./Rentals.jsx";
import RentalDetail from "./RentalDetail.jsx";
import RentImport from "./RentImport.jsx";
import Statement from "./Statement.jsx";
import OwnerReport from "./OwnerReport.jsx";
import Insights from "./Insights.jsx";
import WeeklyInsights from "./WeeklyInsights.jsx";
import Availability from "./Availability.jsx";
import Users from "./Users.jsx";
import Advertisers from "./Advertisers.jsx";
import { createAdvertiserSession } from "./advertiserSession.js";
import Tours from "./Tours.jsx";
import Automations from "./Automations.jsx";
import Messages from "./Messages.jsx";
import { confirmLeave } from "./unsaved.js";
import { fmtDate } from "./format.js";
import { usePoll } from "./poll.js";
const Email = lazy(() => import("./Email.jsx"));

function useHash(pending, onBlocked) {
  const [hash, setHash] = useState(location.hash);
  const accepted = useRef(location.hash);
  useEffect(() => {
    const f = () => {
      if (pending.current) {
        history.replaceState(null, '', location.pathname + location.search + accepted.current);
        onBlocked(true); return;
      }
      accepted.current = location.hash; setHash(location.hash);
    };
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, [pending, onBlocked]);
  return hash;
}

// R17: the setup pages, used rarely, in a menu at the end of the sections. Escape or a click elsewhere closes it; Escape
// and choosing a page give the focus back to its button, which is marked while one of its pages is open.
// AUT-01: stalled, how many automations have stopped, is counted on the button and on Automations.
const SETTINGS = [["availability", "Availability"], ["tours", "3D tours"], ["users", "Users"], ["automations", "Automations"]];
const stoppedCount = n => n > 0 && <span className="count">{n}<span className="sr"> stopped</span></span>;
function SettingsMenu({ current, stalled }) {
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
      aria-current={SETTINGS.some(([k]) => k === current) ? "true" : undefined} onClick={() => setOpen(o => !o)}>Settings{stoppedCount(stalled)}</button>
    <div id="settings-menu" className="menu" hidden={!open}>{SETTINGS.map(([k, t]) => <a key={k} href={`#/${k}`}
      aria-current={current === k ? "page" : undefined} onClick={() => { setOpen(false); button.current.focus(); }}>{t}{k === "automations" && stoppedCount(stalled)}</a>)}</div>
  </div>;
}

export default function App() {
  const [advertiserSession] = useState(createAdvertiserSession);
  const [me, setMe] = useState(undefined); // undefined = checking, null = signed out
  const [expired, setExpired] = useState(false);
  const [counts, setCounts] = useState({});
  const [taskPending, setTaskPending] = useState(false), [pendingNavigation, setPendingNavigation] = useState(false);
  const pendingRef = useRef(false); pendingRef.current = taskPending;
  const hash = useHash(pendingRef, setPendingNavigation);
  useEffect(() => {
    api("/me").then(d => setMe(d.email), () => setMe(null));
    const f = () => setExpired(true);
    addEventListener("hs:signed-out", f);
    return () => removeEventListener("hs:signed-out", f);
  }, []);

  const [path, query] = hash.replace(/^#\/?/, "").split("?");
  const [section, arg, sub] = path.split("/");
  const current = (section === "p" && arg) || section === "queue" ? "listings" : ["advertisers", "email", "messages", "applicants", "review", "listings", "viewings", "sales", "rentals", "insights", "availability", "users", "tours", "automations"].includes(section) ? section : "";
  // The Inbox counter in the navigation: every 30 s while signed in and the tab is visible. On the Inbox itself,
  // the page's own poll brings the counts (onCounts).
  const loadCounts = useCallback(() => api("/admin/notifications/counts").then(setCounts, () => {}), []);
  usePoll(loadCounts, me && !expired && current !== "" ? 30000 : null);

  // The sticky bar's height (it wraps on phones) for `scroll-padding-top`: a focused field never lands under it.
  const bar = useRef(null);
  useEffect(() => {
    if (!bar.current) return;
    const element=bar.current;
    const measure=()=>{
      // At high zoom a wrapped bar can occupy the viewport. Let it scroll away then.
      element.style.position=element.getBoundingClientRect().height>window.innerHeight/2?'static':'';
      const sticky=getComputedStyle(element).position==='sticky';
      document.documentElement.style.setProperty('--bar-h',`${sticky?element.offsetHeight:0}px`);
    };
    const ro = new ResizeObserver(measure);ro.observe(element);window.addEventListener('resize',measure);measure();
    return () => {ro.disconnect();window.removeEventListener('resize',measure);};
  }, [me]);

  const signedIn = email => { setMe(email); setExpired(false); };
  if (me === undefined) return <p className="center">Loading…</p>;
  if (me === null) return <main className="center"><Login onSignedIn={signedIn} /></main>;

  const page = section === "p" && arg ? <ListingEditor key={arg} id={decodeURIComponent(arg)} onChange={loadCounts} />
    : section === "applicants" && arg === "new"
      ? <NewApplicant key={query ?? ""} contactId={new URLSearchParams(query).get("contact")} chatId={new URLSearchParams(query).get("chat")} />
    : section === "applicants" && /^\d+$/.test(arg) ? <ApplicantDetail key={arg} id={arg} tab={sub} onChange={loadCounts} />
    : section === "applicants" ? <Applicants /> : section === "review" ? <Review />
    : section === "listings" && arg && sub === "report"
      ? <OwnerReport key={arg} id={decodeURIComponent(arg)} days={new URLSearchParams(query).get("days")} />
    : section === "listings" ? <Listings onChange={loadCounts} /> : section === "queue" ? <Queue onChange={loadCounts} /> : section === "viewings"
      ? <Viewings key={query ?? ""} listing={new URLSearchParams(query).get("listing")} requestedId={new URLSearchParams(query).get("viewing")} />
    : section === "sales" && /^\d+$/.test(arg) ? <SaleDetail key={arg} id={arg} requestedMilestone={new URLSearchParams(query).get('milestone')} onChange={loadCounts} />
    : section === "sales" ? <Sales key={query ?? ""} buyer={new URLSearchParams(query).get("applicant")} requestedOffer={new URLSearchParams(query).get('offer')} onChange={loadCounts} />
    : section === "rentals" && arg === "new"
      ? <NewRental key={query ?? ""} landlordId={new URLSearchParams(query).get("landlord")} onChange={loadCounts} />
    : section === "rentals" && arg === "import" ? <RentImport onChange={loadCounts} />
    : section === "rentals" && arg === "statements"
      ? <Statement landlord={new URLSearchParams(query).get("landlord")} month={new URLSearchParams(query).get("month")} />
    : section === "rentals" && arg === "landlords" && /^\d+$/.test(sub) ? <Landlord key={sub} id={sub} />
    : section === "rentals" && /^\d+$/.test(arg) ? <RentalDetail key={arg} id={arg} selection={query??''} onChange={loadCounts} />
    : section === "rentals" ? <Rentals requestedPayment={new URLSearchParams(query).get('payment')} unmatched={new URLSearchParams(query).get('payments')==='unmatched'} onChange={loadCounts} />
    : section === "insights" && arg === "weekly" ? <WeeklyInsights key={sub} weekStart={sub ?? ""} paused={expired} />
    : section === "insights" ? <Insights /> : section === "availability" ? <Availability /> : section === "users" ? <Users me={me} />
    : section === "advertisers" ? <Advertisers session={advertiserSession} />
    : section === "messages" ? <Messages paused={expired} onChange={loadCounts} />
    : section === "email" ? <Suspense fallback={<p>Loading email…</p>}><Email key={query??""} query={query} /></Suspense>
    : section === "tours" ? <Tours /> : section === "automations" ? <Automations stalled={counts.stalled} outbound={counts.outbound} onChange={loadCounts} />
    : <Inbox paused={expired} onCounts={setCounts} me={me} onPending={setTaskPending} />;
  const leave = e => {
    if (taskPending) { e?.preventDefault(); setPendingNavigation(true); return false; }
    return confirmLeave(e);
  };
  const logout = async () => {
    if (!leave()) return;
    await api("/session", { method: "DELETE" }).catch(() => {});
    await firebaseSignOut().catch(() => {});
    setMe(null);
  };
  return <>
    <header ref={bar} className="bar" inert={expired} onClick={e => { if (e.target.closest("a")) leave(e); }}>
      <a href="#/" className="brand">Hampton Estates{" "}<span className="staff">Staff</span></a>
      <nav aria-label="Sections">
        <a href="#/" aria-current={current === "" ? "page" : undefined}>Inbox{counts.action > 0
          && <span className="count">{counts.action}<span className="sr"> need action</span></span>}</a>
        <a href="#/messages" aria-current={current === "messages" ? "page" : undefined}>Messages{counts.chats > 0
          && <span className="count">{counts.chats}<span className="sr"> waiting</span></span>}</a>
        <a href="#/email" aria-current={current === "email" ? "page" : undefined}>Email</a>
        <a href="#/applicants" aria-current={current === "applicants" ? "page" : undefined}>Applicants{counts.expiring > 0
          && <span className="count" title={`${counts.expiring} expiring`}>{counts.expiring}<span className="sr"> expiring</span></span>}{counts.retention_review > 0
          && <span className="count" title={`${counts.retention_review} contacts need retention review`}>{counts.retention_review}<span className="sr"> retention review</span></span>}</a>
        <a href="#/review" aria-current={current === "review" ? "page" : undefined}>Review</a>
        <a href="#/advertisers" aria-current={current === "advertisers" ? "page" : undefined}>Advertisers</a>
        <a href="#/listings" aria-current={current === "listings" ? "page" : undefined}>Listings{counts.to_confirm > 0
          && <span className="count">{counts.to_confirm}<span className="sr"> to confirm</span></span>}</a>
        <a href="#/viewings" aria-current={current === "viewings" ? "page" : undefined}>Viewings</a>
        <a href="#/sales" aria-current={current === "sales" ? "page" : undefined}>Sales{counts.sales > 0
          && <span className="count">{counts.sales}<span className="sr"> overdue or waiting</span></span>}</a>
        <a href="#/rentals" aria-current={current === "rentals" ? "page" : undefined}>Rentals{counts.rentals > 0
          && <span className="count">{counts.rentals}<span className="sr"> to do</span></span>}</a>
        <a href="#/insights" aria-current={current === "insights" ? "page" : undefined}>Insights</a>
        <SettingsMenu current={current} stalled={counts.stalled} />
      </nav>
      <a href="/" className="home">View website</a>
      <span className="who">{me}</span>
      <button type="button" className="btn ghost sm" title={`Signed in as ${me}`} onClick={logout}>Sign out</button>
    </header>
    {/* Every link in the page, like those in the header, asks first when there are unsaved changes. */}
    <main className="page" inert={expired} onClickCapture={e => { if (e.target.closest("a[href^='#']")) leave(e); }}>
      {taskPending && pendingNavigation && <p role="alert" className="warn">Confirm the pending task result before leaving. Wait for the reply, or use the task's retry button if the result is uncertain.</p>}
      {counts.outbound && <Paused outbound={counts.outbound} onResumed={loadCounts} />}
      {page}
      <BrowserAlerts paused={expired} onOpen={()=>{if(leave()){window.focus();location.hash='#/';}}}/></main>
    {/* Session expired mid-task: sign in again on top of the page so nothing typed is lost. */}
    {expired && <div className="modal" role="dialog" aria-modal="true" aria-label="Session expired">
      <Login title="Your session has expired" note="Sign in again; what you were editing is still here." onSignedIn={signedIn} home={false} />
    </div>}
  </>;
}

// The bar and its button go away after Resume sending: the focus goes to the page's heading, focusable only then if it
// is not already.
function focusHeading() {
  const h = document.querySelector("main h1, main h2");
  if (!h) return;
  if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  h.focus();
}

// AUT-13 (H11): Hermes, or someone on the Automations screen, can pause sending; only a person in the panel resumes it.
function Paused({ outbound, onResumed }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState(null);
  const resume = async () => {
    if (!confirm("Resume sending to clients and agencies?")) return;
    setBusy(true); setErr(null);
    try { await api("/admin/outbound/resume", { method: "POST" }); await onResumed(); focusHeading(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return <>
    <div className="warn paused" role="status">
      <p>Sending to clients and agencies is paused (asked by {outbound.by === "hermes" ? "Hermes" : outbound.by} on {fmtDate(outbound.at)}).
        The daily team email summary is paused too.
        Nothing is sent until someone resumes it here.</p>
      <button type="button" className="btn ghost sm" onClick={resume} disabled={busy}>Resume sending</button></div>
    {err && <p role="alert" className="err">{err}</p>}</>;
}
