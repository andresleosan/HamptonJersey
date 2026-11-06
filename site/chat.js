// MSG-02 (spec 2026-11-06): the website's chat, answered by a person from the panel. index.html imports this module
// on the first click of "Message us", or at once when this browser has a chat to come back to. Messages and anything
// from the API reach the page only through textContent; the templates below hold fixed text only.

const STORE = "hampton-chat"; // index.html checks the same key
const KEEP_DAYS = 30, MAX = 1000, TEL = "01534 727582";
const TS_FAILED = `Our anti-spam check didn't load. Please call us on ${TEL}, or try again later.`;

// While waiting for an answer: every 5 s the first minute, 15 s up to 5 minutes, 30 s up to 2 hours, then not until
// the visitor writes or opens the chat again.
export function pollDelay(ms) {
  return ms < 60e3 ? 5000 : ms < 5 * 60e3 ? 15000 : ms < 2 * 3600e3 ? 30000 : null;
}

// C5: this browser keeps the key, the time of the chat's last message and the last message seen: nothing personal. The
// server says when the key has ended (7 days after the chat's last message, which a reply also moves); the browser only
// drops a key older than the chat itself can be (30 days).
export function readStore(raw, nowMs) {
  try {
    const s = JSON.parse(raw);
    return typeof s?.key === "string" && typeof s.at === "number" && nowMs - s.at < KEEP_DAYS * 864e5
      ? { key: s.key, at: s.at, seen: Number.isInteger(s.seen) ? s.seen : 0 } : null;
  } catch { return null; }
}
const load = () => { try { return readStore(localStorage.getItem(STORE), Date.now()); } catch { return null; } };
const save = s => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage off: the chat lasts this page */ } };
const forget = () => { try { localStorage.removeItem(STORE); } catch { /* nothing kept */ } };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const when = iso => {
  const d = new Date(iso), t = d.toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"});
  return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString("en-GB", {day: "numeric", month: "short"})}, ${t}`;
};

let o = null; // init's options: {btn, chatOn, tsKey, tsReady, listing}
let dlg, body, store = null, chat = null, shown = new Set(), timer = null, widget = null;

// A response for a chat this page has since ended or replaced is dropped (status -1): it must not bring it back.
async function call(method, path, payload) {
  const key = store?.key, headers = {};
  if (store) headers.authorization = `Bearer ${store.key}`;
  if (payload) headers["content-type"] = "application/json";
  let r;
  try { r = await fetch(`/api${path}`, {method, headers, body: payload && JSON.stringify(payload), credentials: "omit"}); }
  catch { throw Object.assign(new Error("We couldn't reach our server. Check your connection and try again."), {status: 0}); }
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (store?.key !== key) throw Object.assign(new Error("This chat has changed."), {status: -1});
  if (!r.ok) throw Object.assign(new Error(data?.error || "Something went wrong. Please try again."), {status: r.status, data});
  return data;
}

// The button says when the team has replied and the chat is closed.
export { badge as refresh };
function badge() {
  const n = chat ? chat.messages.filter(m => m.role === "team" && m.id > (store?.seen ?? 0)).length : 0;
  o.btn.textContent = n && !dlg?.open ? `Message us · ${n} new ${n === 1 ? "reply" : "replies"}` : "Message us";
  o.btn.hidden = !(o.chatOn || store) || !!o.hidden?.();
}

function remember(c) {
  chat = c;
  const last = c.messages.at(-1);
  store = {...store, at: last ? Date.parse(last.at) : Date.now()};
  if (dlg?.open) store.seen = last?.id ?? 0;
  save(store);
}

// The chat has ended (7 days, or deleted elsewhere): forget it here; a new one can start if the website offers it.
function ended(message) {
  forget(); store = null; chat = null; shown = new Set(); clearTimeout(timer);
  if (dlg?.open) o.chatOn ? startForm(message) : (dlg.close(), badge());
  else badge();
}

function schedule() {
  clearTimeout(timer);
  if (!store || !chat || chat.status === "handled") return;
  const wait = pollDelay(Date.now() - store.at);
  if (wait == null) return;
  timer = setTimeout(async () => {
    if (document.hidden) return; // visibilitychange (set in init) starts it again
    try { remember(await call("GET", "/chat")); render(); }
    catch (e) { if (e.status === 401) return ended(e.message); if (e.status === -1) return; }
    schedule();
  }, wait);
}

function shell() {
  dlg = el("dialog", "chat");
  dlg.setAttribute("aria-labelledby", "chat-h");
  dlg.innerHTML = `<div class="chat-top"><h2 id="chat-h">Message us</h2><button type="button" class="linkbtn chat-close">Close</button></div>
    <div class="chat-body"></div>`;
  body = dlg.querySelector(".chat-body");
  dlg.querySelector(".chat-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => { badge(); o.btn.setAttribute("aria-expanded", "false"); });
  // A click on the backdrop (outside the box) closes it, as Escape does.
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
}

const fieldErr = (form, errors) => {
  form.querySelectorAll(".field-err").forEach(e => e.remove());
  const ids = e => (e.getAttribute("aria-describedby") ?? "").split(" ").filter(id => id && !id.startsWith("chat-e-"));
  form.querySelectorAll("[aria-invalid]").forEach(e => { e.removeAttribute("aria-invalid"); e.setAttribute("aria-describedby", ids(e).join(" ")); });
  let first = null;
  for (const [k, m] of Object.entries(errors || {})) {
    const input = form.elements[k];
    if (!input) continue;
    const id = `chat-e-${k}`, small = el("small", "field-err", String(m));
    small.id = id;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", [...ids(input), id].join(" "));
    (input.closest(".field") ?? input.parentElement).append(small);
    first ??= input;
  }
  first?.focus();
  return first;
};

function startForm(note) {
  clearTimeout(timer);
  body.innerHTML = `<form class="chat-start" novalidate>
    <p class="chat-note" tabindex="-1"></p>
    <p>Leave your message and your contact details. A person from Hampton Estates will reply here, usually within 2 hours
      during office hours, or contact you directly. Please don't share documents, financial or health details here.</p>
    <label class="field"><span>Name</span><input name="name" autocomplete="name" maxlength="100" required></label>
    <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" aria-describedby="chat-reach"></label>
    <label class="field"><span>Mobile</span><input name="phone" type="tel" autocomplete="tel" maxlength="30" aria-describedby="chat-reach"></label>
    <p class="hint" id="chat-reach">An email or a mobile number, so we can reply if you leave.</p>
    <label class="field"><span>Your message</span><textarea name="text" rows="4" maxlength="${MAX}" required aria-describedby="chat-left"></textarea></label>
    <small class="hint" id="chat-left">${MAX} characters left</small>
    <label class="check"><input type="checkbox" name="privacy"><span>I have read the
      <a href="#/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a> (opens in a new tab).</span></label>
    <div class="ts"></div>
    <p class="form-status" role="alert"></p>
    <button class="btn" type="submit">Send</button></form>`;
  const form = body.querySelector("form"), status = form.querySelector(".form-status"), btn = form.querySelector("button[type=submit]");
  form.querySelector(".chat-note").textContent = note ?? "";
  form.querySelector(".chat-note").hidden = !note;
  counter(form.elements.text, form.querySelector("#chat-left"));
  widget = null;
  if (o.tsKey) o.tsReady.then(() => { if (form.isConnected) widget = window.turnstile.render(form.querySelector(".ts"), {sitekey: o.tsKey}); });
  setTimeout(() => { if (widget == null && form.isConnected) status.textContent = o.tsKey ? TS_FAILED : `The chat is unavailable right now. Please call us on ${TEL}.`; }, o.tsKey ? 6000 : 0);
  // Why the chat starts again (deleted, ended) is read first; otherwise straight to Name.
  (note ? form.querySelector(".chat-note") : form.elements.name).focus();
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const f = form.elements;
    status.textContent = ""; btn.disabled = true;
    try {
      store = null;
      const r = await call("POST", "/chat", {name: f.name.value, email: f.email.value, phone: f.phone.value, text: f.text.value,
        privacy: f.privacy.checked, listing_id: o.listing(), turnstile: form.querySelector('[name="cf-turnstile-response"]')?.value});
      if (widget != null) window.turnstile.remove(widget);
      store = {key: r.key, at: Date.now(), seen: 0};
      remember(r.chat);
      conversation();
      schedule();
    } catch (err) {
      if (!fieldErr(form, err.data?.fields)) status.textContent = err.message; // what was typed stays in the form
      if (widget != null) window.turnstile.reset(widget);
      btn.disabled = false;
    }
  });
}

const counter = (area, out) => area.addEventListener("input", () => { out.textContent = `${MAX - area.value.length} characters left`; });

function conversation() {
  shown = new Set();
  body.innerHTML = `<p class="hint chat-about" hidden></p><ol class="chat-log" aria-live="polite" aria-label="Conversation"></ol>
    <p class="hint">We'll reply here. If you close this page, you can come back on this device for 7 days, and we may also
      contact you by email or phone.</p>
    <form class="chat-say" novalidate><label class="field"><span>Your message</span>
      <textarea name="text" rows="2" maxlength="${MAX}" aria-describedby="chat-left"></textarea></label>
      <small class="hint" id="chat-left">${MAX} characters left</small>
      <p class="form-status" role="alert"></p>
      <div class="chat-actions"><button class="btn" type="submit">Send</button>
        <button type="button" class="linkbtn" data-end>End chat</button><button type="button" class="linkbtn" data-delete>Delete chat</button></div></form>`;
  const form = body.querySelector("form"), status = form.querySelector(".form-status"), area = form.elements.text;
  counter(area, form.querySelector("#chat-left"));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!area.value.trim()) { status.textContent = "Write a message first."; return area.focus(); }
    status.textContent = "";
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try { remember(await call("POST", "/chat/messages", {text: area.value})); area.value = ""; area.dispatchEvent(new Event("input")); render(); schedule(); }
    catch (err) { if (err.status === 401) return ended(err.message); status.textContent = err.message; }
    finally { btn.disabled = false; }
  });
  form.querySelector("[data-end]").addEventListener("click", () => {
    if (!confirm("End this chat on this device? We keep the conversation so we can still reply by email or phone.")) return;
    ended();
  });
  form.querySelector("[data-delete]").addEventListener("click", async () => {
    if (!confirm("Delete this chat? Your messages and our replies are deleted for good.")) return;
    clearTimeout(timer);
    try { await call("DELETE", "/chat"); ended("Your chat was deleted."); }
    catch (err) { if (err.status === 401) return ended(err.message); status.textContent = err.message; }
  });
  render();
  area.focus();
}

// Only messages not on the page yet are added, so the live region announces just those.
function render() {
  const log = body?.querySelector(".chat-log");
  if (!log || !chat) return badge();
  const about = body.querySelector(".chat-about");
  about.hidden = !chat.listing;
  if (chat.listing) about.textContent = `About ${chat.listing.title}`;
  for (const m of chat.messages) {
    if (shown.has(m.id)) continue;
    shown.add(m.id);
    const li = el("li", `from-${m.role}`), who = el("p", "who");
    who.append(el("b", null, m.role === "team" ? m.from : "You"), ` · ${when(m.at)}`);
    li.append(who, el("p", "text", m.text));
    log.append(li);
  }
  log.lastElementChild?.scrollIntoView({block: "nearest"});
  badge();
}

export async function toggle() {
  if (dlg?.open) return dlg.close();
  if (!dlg) shell();
  dlg.showModal();
  o.btn.setAttribute("aria-expanded", "true");
  store = load() ?? store; // storage off: the chat this page started
  if (!store) return startForm();
  if (!body.querySelector(".chat-log")) conversation();
  try { remember(await call("GET", "/chat")); render(); schedule(); }
  catch (e) { if (e.status === 401) ended(e.message); }
}

// From index.html once the config is known. With a stored chat, one look for new replies (the button says so).
export async function init(opts) {
  o = opts;
  addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  store = load();
  if (!store) { forget(); return badge(); }
  badge();
  try { remember(await call("GET", "/chat")); badge(); schedule(); }
  catch (e) { if (e.status === 401) ended(); }
}
