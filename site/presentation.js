// AGE-12: the homes Hampton presented to one client, and their answer on each. The link's token is in the fragment: it is
// read once, removed from the address bar, exchanged by POST for a session cookie and never stored. Reading the page
// answers nothing; only "Send answer" does. Built with textContent only.
const token = location.hash.slice(1);
if (location.hash) history.replaceState(null, "", location.pathname);

const GONE = "This link is not available. Please contact Hampton Estates.";
const CHOICES = [["interested", "I'm interested"], ["request_viewing", "I'd like to view it"], ["not_for_me", "Not for me"], ["call_me", "Please call me"]];
const DONE = { interested: "Thank you. You said you are interested: we will contact you about the next step.",
  request_viewing: "Thank you. We will arrange a viewing with the times you already gave us and confirm it with you before anything is booked.",
  not_for_me: "Thank you. You said this home is not for you: it changes nothing else in your search.",
  call_me: "Thank you. We will call you about this home." };
const app = document.getElementById("app");

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(c => c != null && c !== false));
  return node;
}
const status = text => app.replaceChildren(el("h1", { textContent: "Your selection" }), el("p", { role: "status", textContent: text }));
// A currency that is not an ISO code shows the number alone.
const money = (amount, currency = "GBP") => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0,
  ...(/^[A-Z]{3}$/.test(currency ?? "GBP") && { style: "currency", currency: currency ?? "GBP" }) }).format(amount);
function price(l) {
  if (l.operation === "rent" && l.rent != null) return `${money(l.rent, l.currency)}${l.rent_period ? ` per ${l.rent_period}` : ""}`;
  return l.sale_price != null ? money(l.sale_price, l.currency) : null;
}
const facts = l => [l.location, l.bedrooms != null && `${l.bedrooms} ${l.bedrooms === 1 ? "bedroom" : "bedrooms"}`,
  l.bathrooms != null && `${l.bathrooms} ${l.bathrooms === 1 ? "bathroom" : "bathrooms"}`].filter(Boolean).join(" · ");

function answerForm(o, item) {
  const id = `h${o.match_id}`, form = el("form", { noValidate: true }), alert = el("p", { className: "err", role: "alert" });
  const choices = el("div", { className: "opts" }, ...CHOICES.map(([value, text]) =>
    el("label", {}, el("input", { type: "radio", name: `choice-${o.match_id}`, value }), el("span", { textContent: text }))));
  const note = el("textarea", { name: "reason", maxLength: 500, id: `${id}-note` });
  const button = el("button", { className: "btn", type: "submit", textContent: "Send answer" });
  form.append(el("fieldset", {}, el("legend", { textContent: "Your answer" }), choices),
    el("label", { className: "note", htmlFor: note.id }, "Anything to add? (optional, up to 500 characters)", note), alert, button);
  let busy = false;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;
    const choice = form.querySelector("input:checked")?.value;
    if (!choice) { alert.textContent = "Choose an answer first."; return; }
    busy = true; button.disabled = true; alert.textContent = ""; button.textContent = "Sending…";
    try {
      const r = await fetch("/api/presentation/respond", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ match_id: o.match_id, choice, reason: note.value }) });
      const out = await r.json().catch(() => ({}));
      if (r.ok) { form.replaceWith(el("p", { className: "answered", role: "status", tabIndex: -1, textContent: DONE[choice] })); item.querySelector(".answered").focus(); return; }
      alert.textContent = out.error || "Your answer could not be sent. Please try again.";
    } catch { alert.textContent = "We could not confirm that your answer was sent. Please try again."; }
    busy = false; button.disabled = false; button.textContent = "Send answer";
  });
  return form;
}

function render(options) {
  app.replaceChildren(el("h1", { textContent: "Your selection" }),
    el("p", { className: "lead", textContent: options.length ? "Homes Hampton Estates selected for your search. Tell us what you think of each one: "
      + "your search details stay as they are." : "There are no homes in this selection." }));
  if (!options.length) return;
  app.append(el("ul", { className: "homes" }, ...options.map(o => {
    // A home no longer offered: the server sends nothing of it.
    if (!o.listing) return el("li", { className: "home" }, el("p", { className: "facts", textContent: "This home is no longer available." }));
    const l = o.listing, item = el("li", { className: "home" });
    item.setAttribute("aria-labelledby", `h${o.match_id}`);
    // A photo withdrawn or changed since the page loaded is refused by the server: it just disappears.
    const photo = p => { const img = el("img", { src: `/api/presentation/photos/${p.id}`, alt: p.label || "Photo of the home", loading: "lazy",
      decoding: "async" }); img.addEventListener("error", () => img.remove()); return img; };
    item.append(...[o.photos.length && el("div", { className: "photos", tabIndex: 0, role: "group", ariaLabel: `Photos of ${l.title || "the home"}` }, ...o.photos.map(photo)),
    el("h2", { id: `h${o.match_id}`, textContent: l.title || "Home" }), el("p", { className: "facts", textContent: facts(l) }),
    price(l) && el("p", { className: "price", textContent: price(l) }),
    // AGE-11: the date of the availability confirmation approved with the presentation, only while it still stands.
    l.availability_confirmed_at && el("p", { className: "facts", textContent: `Availability confirmed on ${new Date(l.availability_confirmed_at)
      .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}` }), l.summary && el("p", { textContent: l.summary }),
    o.choice ? el("p", { className: "answered", textContent: `You answered: ${CHOICES.find(c => c[0] === o.choice)[1]}.` })
      : answerForm(o, item)].filter(Boolean));
    return item;
  })));
}

// VIS-13: the client's viewings and their answer (each a POST with the time shown; reading changes nothing). Absent while
// the reminders are switched off (the server answers 404) or when there is no viewing.
const ACTIONS = [["confirm", "I'll be there"], ["reschedule", "Ask for another time"], ["cancel", "Cancel this viewing"]];
const SAID = { confirm: "Thank you. You confirmed you will attend.", reschedule: "Thank you. We will contact you to agree another time; "
  + "until then this viewing stays as it is.", cancel: "This viewing is cancelled." };
const day = d => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
function renderViewings(section, viewings, said) {
  section.replaceChildren(...[el("h2", { id: "viewings-h", textContent: "Your viewings" }), said && el("p", { role: "status", textContent: said }),
    viewings.length ? el("ul", { className: "homes" }, ...viewings.map(v => {
      const alert = el("p", { className: "err", role: "alert" });
      const act = async (action, button) => {
        if (action === "cancel" && !confirm("Cancel this viewing?")) return;
        button.disabled = true; alert.textContent = "";
        try {
          const r = await fetch(`/api/presentation/viewings/${v.id}/${action}`, { method: "POST", headers: { "content-type": "application/json" },
            cache: "no-store", body: JSON.stringify({ date: v.date, time: v.time }) });
          const out = await r.json().catch(() => ({}));
          if (r.ok) { renderViewings(section, out.viewings, SAID[action]); section.querySelector("[role=status]")?.focus(); return; }
          alert.textContent = out.error || "Your answer could not be sent. Please try again.";
        } catch { alert.textContent = "We could not confirm that your answer was sent. Please try again."; }
        button.disabled = false;
      };
      const shown = ACTIONS.filter(([a]) => !(a === "confirm" && (v.status !== "confirmed" || v.confirmed)) && !(a === "reschedule" && v.reschedule_requested));
      return el("li", { className: "home" }, el("h3", { textContent: v.title || "Viewing" }),
        el("p", { className: "facts", textContent: [v.location, `${day(v.date)} at ${v.time}`, v.kind].filter(Boolean).join(" · ") }),
        el("p", { textContent: v.status === "confirmed" ? (v.confirmed ? "Confirmed. You said you will attend." : "Confirmed.") : "Waiting for confirmation." }),
        v.reschedule_requested && el("p", { textContent: "You asked for another time: we will contact you." }),
        el("div", { className: "opts" }, ...shown.map(([a, text]) => { const b = el("button", { className: "btn", type: "button", textContent: text });
          b.addEventListener("click", () => act(a, b)); return b; })), alert);
    })) : el("p", { textContent: "You have no upcoming viewings." })].filter(Boolean));
  section.querySelector("[role=status]")?.setAttribute("tabindex", "-1");
}
async function viewings() {
  const r = await fetch("/api/presentation/viewings", { cache: "no-store" });
  if (!r.ok) return;
  const { viewings: list } = await r.json();
  if (!list.length) return;
  const section = el("section", { className: "viewings" });
  section.setAttribute("aria-labelledby", "viewings-h");
  app.append(section);
  renderViewings(section, list);
}

(async () => {
  try {
    if (token) {
      const r = await fetch("/api/presentation/session", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ token }) });
      if (!r.ok) return status(GONE);
    }
    const r = await fetch("/api/presentation/options", { cache: "no-store" });
    if (!r.ok) return status(GONE);
    render((await r.json()).options);
    await viewings().catch(() => {});
  } catch { status("We could not load your selection. Please check your connection and try again."); }
})();
