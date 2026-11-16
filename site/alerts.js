// REG-15: «Save this search». Only an email and criteria; nothing is written to browser storage or URLs. The page
// says it is not available while the switch or the form's settings are off (the website then shows no link to it).
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export async function renderAlerts(root, { tsKey, tsReady }) {
  let active = true; const alive = () => active && location.hash === "#/alerts";
  addEventListener("hashchange", () => { active = false; }, { once: true });
  root.innerHTML = '<section class="block"><div class="wrap"><h1>Email me new homes</h1><p role="status">Checking availability…</p></div></section>';
  let a;
  try { const r = await fetch("/api/saved-searches/availability", { cache: "no-store" }); if (!r.ok) throw Error(); a = await r.json(); }
  catch { a = { available: false }; }
  if (!alive()) return;
  const wrap = root.querySelector(".wrap");
  if (!a.available) { wrap.querySelector("[role=status]").textContent = "Property alerts are not available yet. Please register your search instead."; return; }
  const boxes = (name, list) => list.map(([v, l]) => `<label><input type="checkbox" name="${name}" value="${esc(v)}"> ${esc(l)}</label>`).join(" ");
  const o = a.options;
  wrap.innerHTML = `<h1>Email me new homes</h1><p>Leave your email and what you are looking for. We will email you when a new home matches.</p>
  <form class="alerts-form" novalidate>
  <label class="field"><span>What are you looking for?</span><select name="operation" required><option value="">Choose one</option>
   ${o.operation.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select></label>
  <label class="field"><span>Maximum price in £ (a month to let), optional</span><input name="budget_max" type="number" inputmode="numeric" min="1" step="1"></label>
  <label class="field"><span>Minimum bedrooms, optional</span><select name="bedrooms_min"><option value="">Any</option>
   ${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${n}+</option>`).join("")}</select></label>
  <fieldset class="field"><legend>Parishes, optional (none means anywhere)</legend>${boxes("parishes", o.parishes.map(p => [p, p]))}</fieldset>
  <fieldset class="field"><legend>Type of home, optional</legend>${boxes("property_types", o.property_types)}</fieldset>
  <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
  <label><input type="checkbox" name="consent" required> Email me homes that match this search. I can stop at any time from any alert.</label>
  <p>See our <a href="#/privacy" target="_blank" rel="noopener noreferrer">privacy notice (opens in a new tab)</a>.</p>
  <div class="ts"></div><p role="alert"></p><button class="btn" type="submit">Save this search</button></form>`;
  const form = wrap.querySelector("form"), status = form.querySelector("[role=alert]"), button = form.querySelector("button");
  let widget = null, pending = false;
  if (tsKey && tsReady) tsReady.then(() => { if (alive() && form.querySelector(".ts")) widget = turnstile.render(form.querySelector(".ts"), { sitekey: tsKey }); });
  form.addEventListener("submit", async e => {
    e.preventDefault(); if (pending) return;
    const d = new FormData(form), num = k => d.get(k) ? Number(d.get(k)) : null;
    if (!d.get("operation")) { status.textContent = "Choose To Let or To Buy."; return; }
    if (!form.elements.email.checkValidity() || !d.get("email")) { status.textContent = "Enter a valid email address."; return; }
    if (!d.has("consent")) { status.textContent = "Tick the box to receive property alerts by email."; return; }
    const token = widget === null ? "" : turnstile.getResponse(widget);
    if (!token) { status.textContent = "Please complete the verification."; return; }
    pending = true; button.disabled = true; status.textContent = "Saving…";
    try {
      const r = await fetch("/api/saved-searches", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ email: d.get("email"), operation: d.get("operation"), budget_max: num("budget_max"),
          bedrooms_min: num("bedrooms_min"), parishes: d.getAll("parishes"), property_types: d.getAll("property_types"),
          consent: true, privacy_version: a.privacy_version, turnstile: token }) });
      const out = await r.json().catch(() => ({}));
      if (!alive()) return;
      if (r.ok) { wrap.innerHTML = '<h1>Check your email</h1><p role="status">We sent you a link. Open it within 7 days to start your alerts.</p>'; return; }
      status.textContent = out.fields ? Object.values(out.fields).join(" ") : out.error || "Could not save your search. Please try again.";
    } catch { if (alive()) status.textContent = "Could not save your search. Please try again."; }
    finally { pending = false; button.disabled = false; if (widget !== null) turnstile.reset(widget); }
  });
}
