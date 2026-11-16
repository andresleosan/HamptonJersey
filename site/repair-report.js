// ADM-12: a tenant reports a repair with the private link Hampton Estates sent. The link's token is in the fragment: it
// is read once, removed from the address bar and kept only in memory. Opening the page sends nothing; "Email me a code"
// asks for a 6-digit code at the tenancy's email, and the right code opens a 30-minute session (an HttpOnly cookie).
// The form sends text only, no photos. Built with textContent only; nothing is stored in the browser.
const token = location.hash.slice(1);
if (location.hash) history.replaceState(null, "", location.pathname);

const GONE = "This link is not available. Please contact Hampton Estates.";
const ENDED = "Your session has ended. Open the link from your message again to get a new code.";
const URGENCY = [["emergency", "Emergency", "A danger to people or serious damage happening now, such as a gas smell, flooding or no electricity."],
  ["urgent", "Urgent", "Needs attention within a few days, such as no hot water or a broken lock."],
  ["routine", "Routine", "Can wait for a planned visit, such as a dripping tap or a sticking door."]];
const app = document.getElementById("app");

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(c => c != null && c !== false));
  return node;
}
const show = (...nodes) => { app.replaceChildren(el("h1", { textContent: "Report a repair", tabIndex: -1 }), ...nodes); app.querySelector("h1").focus(); };
const status = text => show(el("p", { role: "status", textContent: text }));
const post = async (path, body) => {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
};
const button = (text, ghost) => el("button", { className: ghost ? "btn ghost" : "btn", type: ghost ? "button" : "submit", textContent: text });
const field = (label, input, hint) => el("label", { className: "field" }, el("span", { textContent: label }), hint && el("p", { className: "hint", textContent: hint }), input);
function busy(btn, text) { const was = btn.textContent; btn.disabled = true; btn.textContent = text; return () => { btn.disabled = false; btn.textContent = was; }; }

// Step 1: nothing is sent until the tenant asks.
function askForCode(message) {
  const send = button("Email me a code"), alert = el("p", { className: "err", role: "alert" });
  const form = el("form", { className: "card", noValidate: true }, el("p", { textContent: "To report a repair, we will email a 6-digit code to the "
    + "address Hampton Estates has for your tenancy. It works for 10 minutes." }), message && el("p", { className: "err", textContent: message }), alert,
    el("div", { className: "row" }, send));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const done = busy(send, "Sending…");
    try {
      const r = await post("/api/case-access/challenge", { bootstrap: token });
      if (r.status === 202) return enterCode(r.data.challenge_id);
      if (r.status === 404) return status(GONE);
      alert.textContent = r.data.error || "We could not send a code. Please try again later.";
    } catch { alert.textContent = "We could not reach Hampton Estates. Check your connection and try again."; }
    done();
  });
  show(el("p", { className: "lead", textContent: "Use this page to tell Hampton Estates about something in your home that needs repairing." }), form);
}

// Step 2: the code from the email.
function enterCode(challengeId) {
  const input = el("input", { type: "text", className: "code", name: "code", id: "code", inputMode: "numeric", autocomplete: "one-time-code",
    maxLength: 6, pattern: "[0-9]{6}", required: true });
  const check = button("Check code"), again = button("Send a new code", true), alert = el("p", { className: "err", role: "alert", id: "code-error" });
  input.setAttribute("aria-describedby", "code-error");
  const form = el("form", { className: "card", noValidate: true }, el("p", { textContent: "We have emailed you a code. If it does not arrive in a few "
    + "minutes, check your spam folder or ask for a new one: always use the latest code." }),
    field("6-digit code", input), alert, el("div", { className: "row" }, check, again));
  const wrong = text => { alert.textContent = text; input.setAttribute("aria-invalid", "true"); input.focus(); };
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const code = input.value.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return wrong("Enter the 6 digits from the email.");
    const done = busy(check, "Checking…");
    try {
      const r = await post("/api/case-access/verify", { challenge_id: challengeId, code });
      if (r.ok) return load();
      if (r.status === 404) return status(GONE);
      wrong(r.data.error || "That code is not right.");
    } catch { wrong("We could not reach Hampton Estates. Check your connection and try again."); }
    done();
  });
  again.addEventListener("click", () => askForCode());
  show(form);
  input.focus();
}

// Step 3: the report. operationId makes a resend after a lost answer the same report.
function reportForm(ctx) {
  let operationId = crypto.randomUUID();
  const title = el("input", { type: "text", name: "title", id: "title", maxLength: 120, required: true, autocomplete: "off" });
  const detail = el("textarea", { name: "detail", id: "detail", maxLength: 2000 });
  const choices = el("fieldset", {}, el("legend", { textContent: "How urgent is it?" }), ...URGENCY.map(([value, label, hint]) =>
    el("label", { className: "opt" }, el("input", { type: "radio", name: "urgency", value }), el("span", {}, el("strong", { textContent: label }), el("small", { textContent: hint })))));
  const send = button("Send report"), alert = el("p", { className: "err", role: "alert" });
  const left = el("p", { className: "hint", textContent: `You can send ${ctx.reports_left} more ${ctx.reports_left === 1 ? "report" : "reports"} today with this link.` });
  const form = el("form", { className: "card", noValidate: true },
    el("p", {}, "Your home: ", el("strong", { textContent: ctx.address })),
    field("What needs repairing?", title, "For example: kitchen tap leaking."), field("Describe the problem (optional)", detail,
      "Where it is, since when, and anything you have already tried. Up to 2,000 characters."), choices,
    el("p", { className: "note", textContent: "Please do not send photos here. If Hampton Estates needs them, the team will tell you how to send them. "
      + "Reporting a repair does not guarantee a response within a set time and does not authorise any work: Hampton Estates will contact you." }),
    alert, left, el("div", { className: "row" }, send));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    title.removeAttribute("aria-invalid");
    const urgency = form.querySelector("input[name=urgency]:checked")?.value;
    if (!title.value.trim()) { alert.textContent = "Say what needs repairing."; title.setAttribute("aria-invalid", "true"); return title.focus(); }
    if (!urgency) { alert.textContent = "Choose how urgent it is."; return choices.querySelector("input").focus(); }
    const done = busy(send, "Sending…");
    alert.textContent = "";
    try {
      const r = await post("/api/repair-report/submit", { operation_id: operationId, title: title.value, detail: detail.value, urgency });
      if (r.ok) return received(r.data.receipt);
      if (r.status === 404) return status(ENDED);
      alert.textContent = r.data.fields ? Object.values(r.data.fields).join(" ") : r.data.error || "Your report could not be sent. Please try again.";
    } catch { alert.textContent = "We could not confirm that your report was sent. Please try again: it will not be sent twice."; }
    done();
  });
  show(ctx.reports_left > 0 ? form : el("p", { className: "card", textContent: "You have sent 10 reports today with this link. For anything else, "
    + "please call Hampton Estates." }));
  function received(receipt) {
    operationId = crypto.randomUUID();
    const another = button("Report another repair", true);
    another.addEventListener("click", () => load());
    show(el("div", { className: "card" }, el("p", { className: "ok", role: "status", textContent: "Thank you. Your report has been received." }),
      el("p", { textContent: `Reference ${receipt.id.slice(0, 8).toUpperCase()}. Hampton Estates will contact you about it; no work has been ordered yet.` }),
      el("div", { className: "row" }, another)));
  }
}

async function load() {
  try {
    const r = await fetch("/api/repair-report", { cache: "no-store" });
    if (r.ok) return reportForm(await r.json());
    if (token) return askForCode();
    status(r.status === 404 ? "Open the link Hampton Estates sent you again to report a repair." : GONE);
  } catch { status("We could not load this page. Please check your connection and try again."); }
}
load();
