// "Register your search" (spec §5) and the privacy notice. index.html imports this module only on #/apply or
// #/privacy, so the home page never downloads it. Values from the API or the visitor reach the page only through
// esc() or textContent.

const TEL = "01534 727582";
const STORE = "hampton-apply";
// Answers kept in this tab so a reload loses nothing; personal details and consents never are (DESIGN.md).
const PRIVATE = ["name", "email", "phone", "preferred_channel", "best_time", "requirements", "housing_status", "privacy",
  "marketing"];
const STEPS = [
  { title: "What are you looking for?", fields: ["operation"] },
  { title: "Where?", fields: ["parishes_wanted", "parishes_excluded", "near"] },
  { title: "What kind of home?", fields: ["property_types", "bedrooms_min", "bedrooms_ideal", "bathrooms_min",
    "parking_spaces", "outdoor", "furnished", "pets", "pets_cat", "pets_dog", "pets_other"] },
  { title: "Budget and timing", fields: ["budget_max", "budget_min", "budget_stretch", "move_in_date",
    "lease_term_months", "buyer_position", "mortgage_aip"] },
  { title: "Living in Jersey", fields: ["housing_status", "household_adults", "household_children"] },
  { title: "About you", fields: ["name", "email", "phone", "preferred_channel", "best_time", "requirements",
    "privacy", "marketing"] },
];
const FIELDS = new Set(STEPS.flatMap(s => s.fields));
const ONLY = { rent: ["furnished", "lease_term_months"], buy: ["buyer_position", "mortgage_aip"] };
const CHOICES = ["operation", "furnished", "buyer_position", "mortgage_aip", "housing_status", "preferred_channel"];
const TEXT = ["near", "move_in_date", "name", "email", "phone", "best_time", "requirements"];
const LISTS = ["parishes_wanted", "parishes_excluded", "property_types", "outdoor"];
const INTS = ["bedrooms_min", "bedrooms_ideal", "bathrooms_min", "parking_spaces", "lease_term_months",
  "household_adults", "household_children", "pets_cat", "pets_dog", "pets_other"];
const MONEY = ["budget_min", "budget_max", "budget_stretch"];

// "£1,500" → 1500; empty → null (never 0); anything else stays text, for the check or the server to refuse.
const number = s => {
  const t = String(s ?? "").replace(/[£,\s]/g, "");
  return t === "" ? null : Number.isFinite(Number(t)) ? Number(t) : t;
};

// answers: {name: string | string[]} as read from the form (checkbox groups are lists). Returns the API body:
// empty answers are left out, numbers are numbers, and only the operation's own fields are sent.
export function toBody(a) {
  const b = {}, skip = ONLY[a.operation === "rent" ? "buy" : "rent"];
  const put = (k, v) => {
    if (!skip.includes(k) && v != null && v !== "" && !(Array.isArray(v) && !v.length)) b[k] = v;
  };
  CHOICES.forEach(k => put(k, a[k]));
  TEXT.forEach(k => put(k, String(a[k] ?? "").trim()));
  LISTS.forEach(k => put(k, a[k]));
  INTS.filter(k => !k.startsWith("pets_")).forEach(k => put(k, number(a[k])));
  MONEY.forEach(k => put(k, number(a[k])));
  const pets = a.pets ?? [];
  put("pets", pets.includes("none") ? [{ kind: "none" }] : pets.map(kind => ({ kind, count: number(a[`pets_${kind}`]) })));
  b.privacy = (a.privacy ?? []).length > 0;
  b.marketing = (a.marketing ?? []).length > 0;
  return b;
}

// Help before Continue; the server checks everything again and its errors bring the visitor back to the step.
function checkStep(i, a) {
  const e = {}, missing = (k, msg) => { if (!String(a[k] ?? "").trim()) e[k] = msg; };
  if (i === 0) missing("operation", "Choose To Let or To Buy");
  if (i === 2) missing("bedrooms_min", "Choose the minimum bedrooms");
  if (i === 3) missing("budget_max", "Enter your maximum budget");
  if (i === 5) {
    missing("name", "Enter your name");
    missing("email", "Enter your email address");
    if (!e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) e.email = "Enter a valid email address";
    missing("phone", "Enter your mobile number");
    if (!(a.privacy ?? []).length) e.privacy = "Accept the privacy notice to continue";
  }
  for (const k of STEPS[i].fields) {
    if (e[k] || ONLY[a.operation === "rent" ? "buy" : "rent"].includes(k)) continue;
    if (k.startsWith("pets_") && !(a.pets ?? []).includes(k.slice(5))) continue;
    const n = number(a[k]);
    if (k.startsWith("pets_") && !(Number.isInteger(n) && n >= 1 && n <= 20)) e[k] = "Enter how many, from 1 to 20";
    else if (MONEY.includes(k) && typeof n === "string") e[k] = "Enter an amount in pounds, like 1,500";
    else if (INTS.includes(k) && typeof n === "string") e[k] = "Enter a whole number";
  }
  return e;
}

const $ = (s, el) => el.querySelector(s);
const ICONS = {
  rent: '<path d="M14.5 9.5a4 4 0 1 1-1.2-2.8M13.3 6.7 20 13.4v3.1h-2.6v-2.1h-2.1v-2.1h-2.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  buy: '<path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
};
const OP_NOTE = { rent: "Rent a home, paid monthly", buy: "Buy a home in Jersey" };

export function renderApply(root, { esc, tsKey, tsReady }) {
  root.innerHTML = `<section class="block apply"><div class="wrap">
    <h1 class="apply-h1">Register your search</h1>
    <div class="apply-body"><p class="hint" role="status">Loading the form…</p></div></div></section>`;
  const body = $(".apply-body", root);
  fetch("/api/applicants/options").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(options => { if (document.contains(body)) wizard(body, options, { esc, tsKey, tsReady }); })
    .catch(() => {
      if (!document.contains(body)) return;
      body.innerHTML = `<div class="empty" role="alert"><p>We couldn't load the form right now. Try again, or call us on ${TEL}.</p>
        <button class="btn ghost" type="button">Try again</button></div>`;
      $("button", body).addEventListener("click", () => renderApply(root, { esc, tsKey, tsReady }));
    });
}

function wizard(body, options, { esc, tsKey, tsReady }) {
  const list = k => (Array.isArray(options?.[k]) ? options[k].filter(x => Array.isArray(x) && x.length === 2) : []);
  const err = name => `<small class="field-err" id="e-${name}" hidden></small>`;
  const pills = (name, items, type = "radio", req = false) => `<div class="opts">${items.map(([v, l]) =>
    `<label><input type="${type}" name="${name}" value="${esc(v)}"${req ? " required" : ""}><span>${esc(l)}</span></label>`).join("")}</div>`;
  const group = (name, legend, inner, only = "") =>
    `<fieldset class="field"${only ? ` data-only="${only}"` : ""}><legend>${legend}</legend>${inner}${err(name)}</fieldset>`;
  const input = (name, label, attrs = "", only = "") => `<div class="field"${only ? ` data-only="${only}"` : ""}>
    <label for="f-${name}"${label.rent ? ` data-rent="${label.rent}" data-buy="${label.buy}"` : ""}>${label.rent || label}</label>
    <input id="f-${name}" name="${name}" ${attrs}>${err(name)}</div>`;
  const today = jerseyToday(), inTwoYears = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
  const count = `inputmode="numeric" autocomplete="off"`;
  const pets = list("pet_kinds").filter(([v]) => v !== "none");
  const money = (rent, buy, optional = "") => ({ rent: `${rent}, £ per month${optional}`, buy: `${buy}, £${optional}` });

  const steps = [
    `<div class="opts cards">${list("operation").map(([v, l]) => `<label><input type="radio" name="operation" value="${esc(v)}" required>
      <span class="opt"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[v] || ""}</svg><b>${esc(l)}</b><small>${esc(OP_NOTE[v] || "")}</small></span></label>`).join("")}</div>
      ${err("operation")}
      <p class="hint">Looking for commercial premises? <a href="#book">Contact us</a></p>`,
    group("parishes_wanted", "Parishes you'd like (optional)", pills("parishes_wanted", list("parishes"), "checkbox"))
      + group("parishes_excluded", "Parishes to avoid (optional)", pills("parishes_excluded", list("parishes"), "checkbox"))
      + input("near", "Near somewhere in particular (optional)", `maxlength="200" placeholder="Your work, a school"`),
    group("property_types", "Type of home (optional)", pills("property_types", list("property_types"), "checkbox"))
      + group("bedrooms_min", "Bedrooms, at least", pills("bedrooms_min", [[0, "Studio"], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5+"]], "radio", true))
      + group("bedrooms_ideal", "Bedrooms, ideally (optional)", pills("bedrooms_ideal", [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5+"]]))
      + group("bathrooms_min", "Bathrooms, at least (optional)", pills("bathrooms_min", [[1, "1"], [2, "2"], [3, "3+"]]))
      + group("parking_spaces", "Parking spaces (optional)", pills("parking_spaces", list("parking")))
      + group("outdoor", "Outdoor space (optional)", pills("outdoor", list("outdoor"), "checkbox"))
      + group("furnished", "Furnished (optional)", pills("furnished", list("furnished")), "rent")
      + group("pets", "Pets (optional)", pills("pets", list("pet_kinds"), "checkbox") + `<div class="row">${pets.map(([v, l]) =>
        `<div class="field" data-pet="${esc(v)}" hidden><label for="f-pets_${esc(v)}">How many: ${esc(l)}</label>
          <input id="f-pets_${esc(v)}" name="pets_${esc(v)}" value="1" ${count}>${err(`pets_${esc(v)}`)}</div>`).join("")}</div>`),
    input("budget_max", money("Maximum rent", "Maximum price"), `${count} required`)
      + `<div class="row">${input("budget_min", money("Minimum rent", "Minimum price", " (optional)"), count)}
        ${input("budget_stretch", money("I can stretch to", "I can stretch to", " (optional)"), count)}</div>`
      + input("move_in_date", "When would you like to move? (optional)", `type="date" min="${today}" max="${inTwoYears}"`)
      + input("lease_term_months", "Lease length in months (optional)", count, "rent")
      + group("buyer_position", "Your position (optional)", pills("buyer_position", list("buyer_position")), "buy")
      + group("mortgage_aip", "Mortgage agreement in principle (optional)", pills("mortgage_aip", list("mortgage_aip")), "buy"),
    `<p class="hint">It decides which homes you can rent or buy in Jersey.</p>`
      + group("housing_status", "Housing status (optional)", pills("housing_status", list("housing_status")))
      + `<div class="row">${input("household_adults", "Adults (optional)", count)}${input("household_children", "Children (optional)", count)}</div>`,
    input("name", "Full name", `autocomplete="name" maxlength="120" required placeholder="Your name"`)
      + input("email", "Email", `type="email" autocomplete="email" maxlength="254" required placeholder="name@example.com"`)
      + input("phone", "Mobile", `type="tel" autocomplete="tel" required placeholder="07797 000000"`)
      + group("preferred_channel", "How should we contact you? (optional)", pills("preferred_channel", list("channels")))
      + input("best_time", "Best time to reach you (optional)", `maxlength="200" placeholder="Weekday mornings"`)
      + `<div class="field"><label for="f-requirements">Anything else that matters? (optional)</label>
        <textarea id="f-requirements" name="requirements" maxlength="2000" rows="4"></textarea>${err("requirements")}</div>
      <div class="consent">
        <label><input type="checkbox" name="privacy" value="yes" required><span>I have read the
          <a href="#/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a> (opens in a new tab).</span></label>${err("privacy")}
        <label><input type="checkbox" name="marketing" value="yes"><span>Send me news about homes and the Jersey market (optional). You can stop at any time.</span></label>
      </div>
      ${tsKey ? `<div class="ts"></div>` : ""}`,
  ];
  body.innerHTML = `<p class="hint">Six short steps, about two minutes.</p>
    <div class="apply-progress"><p class="num" aria-live="polite"></p><div class="pbar" aria-hidden="true"><i></i></div></div>
    <form novalidate>${steps.map((html, i) => `<fieldset class="step" hidden><legend><h2 tabindex="-1">${STEPS[i].title}</h2></legend>${html}</fieldset>`).join("")}
      <p class="form-status" role="alert"></p>
      <div class="apply-actions"><button class="apply-back" type="button">Back</button><button class="btn" type="submit">Continue</button></div>
    </form>`;

  const form = $("form", body), sets = [...form.querySelectorAll("fieldset.step")], last = sets.length - 1;
  const status = $(".form-status", form), back = $(".apply-back", form), next = $("button[type=submit]", form);
  const counter = $(".apply-progress p", body), bar = $(".pbar", body);
  const UNAVAILABLE = `Online registration is unavailable right now. Please call us on ${TEL}.`;
  const TS_FAILED = `Our anti-spam check didn't load. Please call us on ${TEL} to register, or try again later.`;
  let step = 0, widget = null, tsAsked = false, tsFailed = false, sending = false;

  const snapshot = () => {
    const a = {};
    for (const el of form.elements) {
      if (!FIELDS.has(el.name)) continue;
      if (el.type === "checkbox") { (a[el.name] ||= []); if (el.checked) a[el.name].push(el.value); }
      else if (el.type === "radio") { a[el.name] ??= ""; if (el.checked) a[el.name] = el.value; }
      else a[el.name] = el.value;
    }
    return a;
  };
  const save = () => {
    const a = Object.fromEntries(Object.entries(snapshot()).filter(([k]) => !PRIVATE.includes(k)));
    try { sessionStorage.setItem(STORE, JSON.stringify({ step, a })); } catch { /* storage off: nothing is kept */ }
  };
  // Shows what fits the chosen operation and pets; hidden fields are not sent (toBody) and not checked.
  const sync = () => {
    const op = $("[name=operation]:checked", form)?.value;
    form.querySelectorAll("[data-only]").forEach(el => { el.hidden = el.dataset.only !== op; });
    form.querySelectorAll("[data-rent]").forEach(l => { l.textContent = op === "buy" ? l.dataset.buy : l.dataset.rent; });
    const chosen = snapshot().pets ?? [];
    form.querySelectorAll("[data-pet]").forEach(el => { el.hidden = !chosen.includes(el.dataset.pet); });
  };
  const controls = name => [...form.querySelectorAll(`[name="${name}"]`)];
  const setError = (name, msg) => {
    const slot = $(`#e-${name}`, form);
    if (slot) { slot.textContent = msg || ""; slot.hidden = !msg; }
    controls(name).forEach(c => {
      if (msg) { c.setAttribute("aria-invalid", "true"); c.setAttribute("aria-describedby", `e-${name}`); }
      else { c.removeAttribute("aria-invalid"); c.removeAttribute("aria-describedby"); }
    });
  };
  // errors: {field: message}. Returns the first one in form order, with its step, or null.
  const showErrors = (errors, clear) => {
    clear.forEach(k => setError(k));
    Object.entries(errors).forEach(([k, m]) => setError(k, String(m)));
    const i = STEPS.findIndex(s => s.fields.some(k => errors[k]));
    return i < 0 ? null : { i, first: STEPS[i].fields.find(k => errors[k]) };
  };
  const focusField = name => controls(name)[0]?.focus();

  const startTurnstile = () => {
    if (!tsKey || tsAsked) return;
    tsAsked = true;
    tsReady.then(() => { if (document.contains(form)) widget = window.turnstile.render($(".ts", form), { sitekey: tsKey }); });
    // Script blocked (content blocker, network): don't leave the visitor at a check they can't complete.
    setTimeout(() => {
      if (widget != null || !document.contains(form)) return;
      tsFailed = true;
      if (step === last) status.textContent = TS_FAILED;
    }, 6000);
  };
  const go = (i, focus = true) => {
    step = i;
    sets.forEach((s, j) => { s.hidden = j !== i; });
    counter.textContent = `Step ${i + 1} of ${sets.length}`;
    bar.style.setProperty("--step", i + 1);
    back.hidden = i === 0;
    next.textContent = i === last ? "Register my search" : "Continue";
    next.disabled = i === last && !tsKey;
    status.textContent = i !== last ? "" : !tsKey ? UNAVAILABLE : tsFailed ? TS_FAILED : "";
    if (i === last) startTurnstile();
    save();
    if (focus) $("h2", sets[i]).focus();
  };

  form.addEventListener("input", e => { if (FIELDS.has(e.target.name)) setError(e.target.name); save(); });
  form.addEventListener("change", e => {
    const t = e.target;
    // "No pets" stands alone; a parish is either wanted or avoided.
    if (t.name === "pets" && t.checked)
      controls("pets").forEach(x => { if (x !== t && (t.value === "none" || x.value === "none")) x.checked = false; });
    const other = { parishes_wanted: "parishes_excluded", parishes_excluded: "parishes_wanted" }[t.name];
    if (other && t.checked) controls(other).forEach(x => { if (x.value === t.value) x.checked = false; });
    sync(); save();
  });
  back.addEventListener("click", () => { if (step > 0 && !sending) go(step - 1); });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (sending || next.disabled) return;
    const a = snapshot(), found = showErrors(checkStep(step, a), STEPS[step].fields);
    if (found) { status.textContent = ""; return focusField(found.first); }
    if (step < last) return go(step + 1);
    const token = $('[name="cf-turnstile-response"]', form)?.value;
    if (!token) { status.textContent = "Please complete the anti-spam check above."; return; }
    sending = true; next.disabled = true; next.textContent = "Sending…"; status.textContent = "";
    let r, data;
    try {
      r = await fetch("/api/applicants", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...toBody(a), turnstile: token }) });
      data = await r.json().catch(() => ({}));
    } catch { data = null; }
    sending = false;
    if (r?.ok) {
      try { sessionStorage.removeItem(STORE); } catch { /* nothing to clear */ }
      if (widget != null) window.turnstile.remove(widget);
      body.innerHTML = `<div class="confirm" role="status" tabindex="-1"><h2></h2>
        <div class="actions"><a class="btn ghost" href="#portfolio">See our properties</a></div></div>`;
      $("h2", body).textContent = `Thank you, ${a.name.trim()}. We'll be in touch within one working day.`;
      $(".confirm", body).focus();
      return;
    }
    if (widget != null) window.turnstile.reset(widget);
    const fields = data?.fields && typeof data.fields === "object" ? data.fields : null;
    const at = fields ? showErrors(fields, [...FIELDS]) : null;
    go(at ? at.i : step, false);
    status.textContent = !data ? "We couldn't reach our server. Your answers are still here. Please try again."
      : `${fields ? "Please check the highlighted fields." : String(data.error || "Something went wrong.")} Your answers are still here.`;
    if (at) focusField(at.first);
  });

  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(STORE)); } catch { /* nothing saved */ }
  if (saved?.a && typeof saved.a === "object") for (const el of form.elements) {
    const v = saved.a[el.name];
    if (!FIELDS.has(el.name) || PRIVATE.includes(el.name) || v === undefined) continue;
    if (el.type === "checkbox") el.checked = Array.isArray(v) && v.includes(el.value);
    else if (el.type === "radio") el.checked = v === el.value;
    else if (typeof v === "string") el.value = v;
  }
  sync();
  // Opening (or starting again) puts focus on the step's heading, as each step change does (WCAG 2.4.3).
  go(Number.isInteger(saved?.step) && saved.step > 0 && saved.step <= last ? saved.step : 0);
}

// Controller details come from Hampton's current site (Luis, 2026-10-25): it publishes no legal entity or JOIC number,
// so the notice names the business and its office. Add them here if Hampton gives them.
export function renderPrivacy(root) {
  root.innerHTML = `<section class="block"><div class="wrap legal">
    <h1>Privacy notice</h1>
    <p>This notice explains how Hampton Estates uses the personal details you give us, for example when you register
      your search or ask for a viewing, and the rights you have under the Data Protection (Jersey) Law 2018.</p>

    <h2>Who we are</h2>
    <p>Hampton Estates, 42 Bath Street, St Helier, Jersey JE2 4ST. We decide how your details are used, so we are the
      controller of your data.</p>

    <h2>What we collect</h2>
    <ul>
      <li>Your name, email address and mobile number, and how and when you prefer us to contact you.</li>
      <li>What you are looking for: renting or buying, areas, type and size of home, budget, timing, pets and anything
        else you tell us.</li>
      <li>Your housing status in Jersey and how many adults and children would live in the home.</li>
      <li>Whether you accepted this notice and whether you asked for our news, with the date.</li>
      <li>For a viewing request: the property, the day and the time you chose.</li>
    </ul>

    <h2>Why we use it</h2>
    <ul>
      <li>To look for homes that match your search and tell you about them.</li>
      <li>To arrange viewings and keep a record of what we have discussed with you.</li>
      <li>To show on a property's page how many people are interested in it: a number only, from 2 people, never your
        name or details.</li>
      <li>To send you news about homes and the Jersey market, only if you ticked the box for it.</li>
    </ul>

    <h2>Our legal basis</h2>
    <p>We use your details to take the steps you ask us to take before you rent or buy a home, and because we have a
      legitimate interest in keeping an accurate record of our dealings with you and in showing, without naming anyone,
      how much interest a property has. We send you news only with your
      consent, which you can withdraw at any time.</p>

    <h2>Who else handles it</h2>
    <p>We do not sell your details. Our website and records are hosted by Cloudflare, which also runs the anti-spam
      check on our forms. Our systems are built and maintained for us by Optimyze. Both act
      only on our instructions. When a provider handles data outside Jersey, the law requires suitable safeguards, and
      we only use providers that give them. We pass your details to a landlord, a seller or their agent only when you
      ask us to arrange a viewing or make an offer.</p>

    <h2>How long we keep it</h2>
    <p>We keep your details for 12 months from the last activity on your record: a new registration, a viewing request,
      an offer, a change you ask for, or a conversation with us. After that we delete them, and a viewing request is
      deleted 12 months after the day of the viewing. If you make an offer that leads to an agreed sale, we keep the sale
      record and your details for 5 years after it completes or falls through, as anti-money-laundering record-keeping
      rules require.</p>

    <h2>Your rights</h2>
    <ul>
      <li>Access: ask for a copy of the details we hold about you.</li>
      <li>Rectification: have wrong or incomplete details corrected.</li>
      <li>Erasure: have your details deleted.</li>
      <li>Objection to marketing (Article 36): tell us to stop sending you news at any time, and we stop straight away.</li>
      <li>Withdrawing consent: this does not affect what we did with your consent before.</li>
    </ul>
    <p>You can also complain to the Jersey Office of the Information Commissioner at
      <a href="https://jerseyoic.org" target="_blank" rel="noopener noreferrer">jerseyoic.org</a>.</p>

    <h2>In your browser</h2>
    <p>While you fill in Register your search, your answers about the home you want are kept in that browser tab, so a
      reload does not lose them. Your name, contact details and housing status are not. They are cleared when you send
      the form or close the tab.</p>

    <h2>Contact us</h2>
    <p>To ask about your data or use any of these rights, email <a href="mailto:francopropertiesjersey@gmail.com">francopropertiesjersey@gmail.com</a>, write to us at the address
      above or call ${TEL}.</p>
  </div></section>`;
}
