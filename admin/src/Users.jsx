import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

export default function Users({ me }) {
  const [users, setUsers] = useState(null), [email, setEmail] = useState(""), [msg, setMsg] = useState(null);
  const load = () => api("/admin/users").then(d => setUsers(d.users), e => setMsg({ text: e.message }));
  useEffect(() => { load(); }, []);
  const add = async e => {
    e.preventDefault();
    try { await api("/admin/users", { method: "POST", body: { email } }); setMsg({ ok: true, text: `${email.trim()} can now sign in.` }); setEmail(""); load(); }
    catch (err) { setMsg({ text: err.message }); }
  };
  const remove = async u => {
    if (!confirm(`Remove access for ${u}?`)) return;
    try { await api(`/admin/users/${encodeURIComponent(u)}`, { method: "DELETE" }); setMsg({ ok: true, text: `${u} no longer has access.` }); load(); }
    catch (err) { setMsg({ text: err.message }); }
  };
  return <section aria-labelledby="t-users">
    <h1 id="t-users">Users with access</h1>
    <form className="inline" onSubmit={add}>
      <label htmlFor="new-email">Google email</label>
      <input id="new-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@gmail.com" />
      <button className="btn">Grant access</button>
    </form>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {!users ? <p>Loading…</p> : <table className="list users">
      <thead><tr><th scope="col">Email</th><th scope="col">Name</th><th scope="col">Added</th><th scope="col"><span className="sr">Actions</span></th></tr></thead>
      <tbody>{users.map(u => <tr key={u.email}>
        <td>{u.email}{u.email === me && <span className="muted"> (you)</span>}</td>
        <td><NameForm key={u.name ?? ""} user={u} onDone={m => { setMsg(m); if (m.ok) load(); }} /></td>
        <td className="muted">{fmtDate(u.added_at)} · {u.added_by}</td>
        <td>{u.email !== me && <button type="button" className="btn ghost sm danger" onClick={() => remove(u.email)}>Remove access</button>}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

// The name shown instead of the email in "Assigned to" and the Timeline; blank shows the email.
function NameForm({ user, onDone }) {
  const [name, setName] = useState(user.name ?? ""), [busy, setBusy] = useState(false);
  const changed = name.trim() !== (user.name ?? "");
  const save = async e => {
    e.preventDefault(); setBusy(true);
    try {
      await api(`/admin/users/${encodeURIComponent(user.email)}`, { method: "PUT", body: { name: name.trim() || null } });
      onDone({ ok: true, text: name.trim() ? `${user.email} now shows as ${name.trim()}.` : `${user.email} now shows as their email.` });
    } catch (err) { onDone({ text: err.message }); }
    finally { setBusy(false); }
  };
  return <form className="inline name-form" onSubmit={save}>
    <input aria-label={`Name for ${user.email}`} value={name} maxLength={80} onChange={e => setName(e.target.value)} />
    <button className="btn ghost sm" disabled={!changed || busy}>Save</button>
  </form>;
}
