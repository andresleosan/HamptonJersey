import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

export default function Users({ me }) {
  const [users, setUsers] = useState(null), [email, setEmail] = useState(""), [msg, setMsg] = useState(null);
  const load = () => api("/admin/users").then(d => setUsers(d.users), e => setMsg({ text: e.message }));
  useEffect(() => { load(); }, []);
  const add = async e => {
    e.preventDefault();
    try { await api("/admin/users", { method: "POST", body: { email } }); setMsg({ ok: true, text: `${email.trim()} ya puede entrar.` }); setEmail(""); load(); }
    catch (err) { setMsg({ text: err.message }); }
  };
  const remove = async u => {
    if (!confirm(`¿Quitar el acceso a ${u}?`)) return;
    try { await api(`/admin/users/${encodeURIComponent(u)}`, { method: "DELETE" }); setMsg({ ok: true, text: `${u} ya no tiene acceso.` }); load(); }
    catch (err) { setMsg({ text: err.message }); }
  };
  return <section aria-labelledby="t-users">
    <h1 id="t-users">Usuarios con acceso</h1>
    <form className="inline" onSubmit={add}>
      <label htmlFor="new-email">Email de Google</label>
      <input id="new-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@gmail.com" />
      <button className="btn">Dar acceso</button>
    </form>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {!users ? <p>Cargando…</p> : <table className="list">
      <thead><tr><th scope="col">Email</th><th scope="col">Añadido</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
      <tbody>{users.map(u => <tr key={u.email}>
        <td>{u.email}{u.email === me && <span className="muted"> (tú)</span>}</td>
        <td className="muted">{fmtDate(u.added_at)} · {u.added_by}</td>
        <td>{u.email !== me && <button type="button" className="btn ghost sm danger" onClick={() => remove(u.email)}>Quitar acceso</button>}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}
