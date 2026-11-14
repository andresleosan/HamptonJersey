import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtAgo } from "./format.js";
import { usePoll } from "./poll.js";
import { setUnsaved } from "./unsaved.js";
import InboxTask from "./InboxTask.jsx";
import InboxPreferences from "./InboxPreferences.jsx";
import MissingPayments from "./MissingPayments.jsx";
import {CATEGORY_LABELS} from "../../shared/notification-categories.js";
import "./inbox-tasks.css";

const BOXES = { action: "Needs action", feed: "Feed" };
// NOT-05: a third tab, Missing payments, when the server has it (its route answers 404 while the switch is off).
const PAYMENTS = "Missing payments";
const CATEGORIES = { "": "All", ...CATEGORY_LABELS };
const KIND = { ...CATEGORY_LABELS, new_applicant: "New applicant", matched: "New matches", viewing: "Viewing request", task: "Shared task" };
const EMPTY = {
  action: { "": "You're all caught up. New applicants, matches, viewing requests and shared tasks that need a reply appear here.",
    new_applicant: "You're all caught up. New applicants from the website appear here.",
    matched: "You're all caught up. When listings fit an applicant's search, the notice appears here until they are reviewed.",
    viewing: "You're all caught up. Viewing requests from the website appear here.", task: "No shared tasks need action." },
  feed: { "": "Nothing here yet. Notices marked done and updates for your information appear here.",
    new_applicant: "No applicant notices here yet.", matched: "No match notices here yet.",
    viewing: "No viewing request notices here yet.", task: "No completed tasks or task updates here yet." },
};
Object.assign(EMPTY.action,{agency_reply:'No agency reply tasks need action.',message:'No message tasks need action.',compliance:'No compliance tasks need action.'});
Object.assign(EMPTY.feed,{agency_reply:'No agency reply updates here yet.',message:'No message updates here yet.',compliance:'No compliance updates here yet.'});
const isOpen = n => n.action_required === 1 && n.resolved_at == null;
export default function Inbox({ paused, onCounts, me, onPending }) {
  const [box, setBox] = useState("action"), [cat, setCat] = useState("");
  const [data, setData] = useState(null), [counts, setCounts] = useState({});
  const [sel, setSel] = useState(null), [msg, setMsg] = useState(null), [loadErr, setLoadErr] = useState(null);
  const [users, setUsers] = useState([]), [usersErr, setUsersErr] = useState(null);
  const [dirty, setDirty] = useState({ task: false, prefs: false });
  const [pending, setPending] = useState(false);
  const [owing, setOwing] = useState(null); // NOT-05: how many tenancies the tab lists, null while it is unavailable
  const taskPending = useCallback(value => { setPending(value); onPending(value); }, [onPending]);
  useEffect(() => () => onPending(false), [onPending]);
  const seq = useRef(0), listRef = useRef(null), headRef = useRef(null);
  const selectedSnapshot=useRef(null);
  const current = useRef(null); current.current = { data, sel, dirty };
  const taskDirty = useCallback(value => setDirty(d => d.task === value ? d : { ...d, task: value }), []);
  const prefsDirty = useCallback(value => setDirty(d => d.prefs === value ? d : { ...d, prefs: value }), []);
  useEffect(() => { setUnsaved(dirty.task || dirty.prefs); }, [dirty]);
  useEffect(() => () => setUnsaved(false), []);
  const loadUsers = useCallback(() => api("/admin/users").then(d => { setUsers(d.users); setUsersErr(null); }, e => setUsersErr(e.message)), []);
  useEffect(() => { if (!paused) loadUsers(); }, [paused, loadUsers]);
  // Set by Done: once the list reloads, the focus goes to the selected notice (the next one), or the heading when none.
  const refocus = useRef(false);
  useEffect(() => { if (!paused) api("/admin/missing-payments").then(d => setOwing(d.count), () => {}); }, [paused]);
  const load = useCallback(({pin = true} = {}) => {
    const n = ++seq.current;
    // On Missing payments the notices are not shown: the poll brings only the counts (the nav's included).
    if (box === "payments") return api("/admin/notifications/counts").then(c => {
      if (n === seq.current) { setCounts(c); onCounts(c); }
    }, () => {});
    return api(`/admin/notifications?box=${box}${cat ? `&category=${cat}` : ""}`).then(async d => {
      if (n !== seq.current) return; // a newer request (another tab, a later poll) has the fresher answer
      const editing = current.current;
      let selectionError=null;
      // A colleague can move the selected task into another box. Keep its draft mounted
      // until an explicit reload/save or confirmed navigation, including an uncertain retry.
      if (pin && editing.sel && !d.notifications.some(x => x.id === editing.sel)) {
        const previous = editing.data?.notifications.find(x => x.id === editing.sel)
          ??(selectedSnapshot.current?.id===editing.sel?selectedSnapshot.current:null);
        let selected=previous;
        if(!editing.dirty.task)try{selected=(await api(`/admin/notification-tasks/${editing.sel}`)).task;}catch(e){selectionError=e.message;}
        if(n!==seq.current)return;
        if (selected) {selectedSnapshot.current=selected;d = { ...d, notifications: [...d.notifications, { ...selected, moved: true }] };}
      }
      setData(d); setCounts(d.counts); onCounts(d.counts); setLoadErr(selectionError?`Could not refresh the selected task: ${selectionError}`:null);
      setSel(id => (d.notifications.some(x => x.id === id) ? id : d.notifications[0]?.id ?? null));
    }, e => { if (n === seq.current) { setLoadErr(e.message); refocus.current = false; } });
  }, [box, cat, onCounts]);
  // Every 30 s while the tab is visible; stopped while the session has expired.
  usePoll(load, paused ? null : 30000);
  const canLeaveTask = () => !pending && (!dirty.task || confirm("Discard unsaved task changes?"));
  const show = (b, c) => {
    if ((b === box && c === cat) || !canLeaveTask()) return;
    taskDirty(false); seq.current++; selectedSnapshot.current=null;setBox(b); setCat(c); setData(null); setSel(null); setMsg(null); setLoadErr(null);
  };
  const pick = id => { if (id !== sel && canLeaveTask()) { seq.current++;selectedSnapshot.current=data?.notifications.find(n=>n.id===id)??null;taskDirty(false); setSel(id); setMsg(null); } };
  const read = useCallback((id, revision) => setData(d => d && ({ ...d,
    notifications: d.notifications.map(n => n.id === id && n.revision === revision ? { ...n, is_read: 1 } : n) })), []);
  useEffect(() => {
    if (!refocus.current || !data) return;
    refocus.current = false;
    (listRef.current?.querySelector("[aria-current=true]") ?? headRef.current)?.focus();
  }, [data]);
  const changed = async ({ task, action }) => {
    taskDirty(false);
    const stillOpen = isOpen(task), messages = { edit: "Task details saved.", claim: "Task claimed.",
      created: "Follow-up task created.", reopen: stillOpen ? "Task reopened." : "The source resolved this task again.",
      done: stillOpen ? "New work remains in Needs action." : "Marked as done. It's in the Feed now." };
    setMsg({ ok: true, text: messages[action] || "Task saved." }); refocus.current = true;
    if (action === "created" || action === "reopen") {
      const nextBox = stillOpen ? "action" : "feed", nextCat = action === "created" ? task.category : cat;
      selectedSnapshot.current=task;
      setSel(task.id);
      if (nextBox !== box || nextCat !== cat) { seq.current++; setBox(nextBox); setCat(nextCat); setData(null); return; }
    } else if (action === "done" && !stillOpen) {
      const list = data.notifications, i = list.findIndex(x => x.id === task.id);
      setSel((list[i + 1] ?? list[i - 1])?.id ?? null);
    }
    await load({pin: action==='created'||action==='reopen'});
  };
  const n = data?.notifications.find(x => x.id === sel);

  return <section className="inbox-tasks" aria-labelledby="t-inbox">
    <h1 id="t-inbox" ref={headRef} tabIndex={-1}>Inbox</h1>
    <details className="inbox-preferences"><summary>Feed preferences</summary>
      <InboxPreferences paused={paused} blocked={dirty.task} onDirty={prefsDirty} onSaved={load} /></details>
    <div className="inbox-tabs">
      <div className="seg" role="group" aria-label="Notices">{Object.entries(BOXES).map(([k, t]) =>
        <button key={k} type="button" aria-pressed={box === k} onClick={() => show(k, cat)}>{t}{k === "action" && <span className="count">{counts.action ?? ""}</span>}</button>)}
        {owing != null && <button type="button" aria-pressed={box === "payments"} onClick={() => show("payments", cat)}>{PAYMENTS}<span className="count">{owing}</span></button>}</div>
      {/* Counters are what still needs action, so they show in Needs action only. */}
      {box !== "payments" && <div className="seg" role="group" aria-label="Category">{Object.entries(CATEGORIES).map(([k, t]) =>
        <button key={k} type="button" aria-pressed={cat === k} onClick={() => show(box, k)}>{t}{box === "action" && <span className="count">{counts[k || "action"] ?? ""}</span>}</button>)}</div>}
    </div>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {loadErr && <p role="alert" className="err">{loadErr} <button type="button" className="linkish" onClick={load}>Try again</button></p>}
    {usersErr && <p role="alert" className="err">{usersErr} <button type="button" className="linkish" onClick={loadUsers}>Reload staff</button></p>}
    {box === "payments" ? <MissingPayments paused={paused} onCount={setOwing} /> : !data ? !loadErr && <p>Loading notices…</p> : !data.notifications.length ? <p className="empty card">{EMPTY[box][cat]}</p> :
      <div className="inbox">
        <ul ref={listRef} className="inbox-list" aria-label={`${BOXES[box]}: ${CATEGORIES[cat]}`}>{data.notifications.map(x => <li key={x.id}>
          <button type="button" aria-current={x.id === sel ? "true" : undefined} className={x.is_read ? "" : "unread"} onClick={() => pick(x.id)}>
            <span className="who">{x.title}</span><time className="muted" dateTime={x.created_at}>{fmtAgo(x.created_at)}</time>
            <span className="what">{KIND[x.category]}</span>{box === "feed" && <span className="muted">{x.resolved_at ? "Done" : "For info"}</span>}
          </button></li>)}</ul>
        {n && <InboxTask key={n.id} n={n} users={users} me={me} paused={paused} onChanged={changed} onRead={read} onDirty={taskDirty} onPending={taskPending} reloadUsers={loadUsers} />}
      </div>}
  </section>;
}
