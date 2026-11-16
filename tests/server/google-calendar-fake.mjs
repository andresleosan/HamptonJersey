// VIS-12: a fake Google (OAuth token endpoint, freeBusy and one calendar's events) behind an injectable fetch. It keeps
// what it was sent, so tests can check that no note, key or private detail ever leaves Hampton. Synthetic data only.
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const API = "https://www.googleapis.com/calendar/v3";

// Google answers the "email" scope with its full name; the ID token carries the account's address (M1).
export function fakeGoogle({ scope = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.freebusy" } = {}) {
  const g = {
    events: new Map(), // id → event resource (with etag)
    busy: [],          // [{ start, end }] that freeBusy answers
    calls: [],         // { method, url, body, headers }
    fail: {},          // "insert" | "get" | "put" | "freebusy" | "token" → status, or "throw" / "hang"
    loseInsertAnswer: false,
    scope, tag: 0, grants: 0,
    account: { email: "negotiator@hampton.test", email_verified: true }, // what the ID token says (null: no ID token)
  };
  const reply = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status,
    headers: { "content-type": "application/json" } });
  const failure = async (key, signal) => {
    const f = g.fail[key];
    if (f === "throw") throw new TypeError("network down");
    if (f === "hang") return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
    return f ? reply(f, { error: { code: f } }) : null;
  };
  const stamp = ev => ({ ...ev, etag: `"e${++g.tag}"` });
  g.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url), method = init.method ?? "GET";
    const body = typeof init.body === "string" ? (init.body.startsWith("{") ? JSON.parse(init.body)
      : Object.fromEntries(new URLSearchParams(init.body))) : null;
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    g.calls.push({ method, url: url.href, body, headers });
    if (url.href.startsWith(TOKEN_URL)) {
      const f = await failure("token"); if (f) return f;
      if (body.grant_type === "authorization_code") {
        // The first grant is 1//FIXTURE-REFRESH, later ones 1//FIXTURE-REFRESH-2, -3… (a reconnection gets a new token).
        const n = ++g.grants, part = o => Buffer.from(JSON.stringify(o)).toString("base64url");
        return reply(200, { access_token: "ya29.FIXTURE-ACCESS", refresh_token: `1//FIXTURE-REFRESH${n > 1 ? `-${n}` : ""}`,
          scope: g.scope, expires_in: 3599,
          ...(g.account ? { id_token: `${part({ alg: "RS256" })}.${part({ iss: "https://accounts.google.com", ...g.account })}.c2ln` } : {}) });
      }
      if (body.grant_type === "refresh_token" && body.refresh_token?.startsWith("1//FIXTURE-REFRESH"))
        return reply(200, { access_token: "ya29.FIXTURE-ACCESS", expires_in: 3599, scope: g.scope });
      return reply(400, { error: "invalid_grant" });
    }
    if (url.href.startsWith(REVOKE_URL)) { const f = await failure("revoke"); return f ?? reply(200, {}); }
    if (headers.authorization !== "Bearer ya29.FIXTURE-ACCESS") return reply(401, { error: { code: 401 } });
    if (url.pathname === "/calendar/v3/freeBusy") {
      const f = await failure("freebusy", init.signal); if (f) return f;
      const id = body.items[0].id;
      return reply(200, { calendars: { [id]: { busy: g.busy.filter(b => b.start < body.timeMax && b.end > body.timeMin) } } });
    }
    const m = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);
    if (!m) return reply(404, null);
    const cal = decodeURIComponent(m[1]), id = m[2], key = id && (cal === "primary" ? id : `${cal}/${id}`);
    if (method === "POST" && !id) {
      const f = await failure("insert"); if (f) return f;
      const k = cal === "primary" ? body.id : `${cal}/${body.id}`;
      if (g.events.has(k)) return reply(409, { error: { code: 409, message: "The requested identifier already exists." } });
      const ev = stamp({ ...body, status: body.status ?? "confirmed" });
      g.events.set(k, ev);
      if (g.loseInsertAnswer) { g.loseInsertAnswer = false; throw new TypeError("connection reset"); }
      return reply(200, ev);
    }
    if (method === "GET" && id) {
      const f = await failure("get"); if (f) return f;
      return g.events.has(key) ? reply(200, g.events.get(key)) : reply(404, { error: { code: 404 } });
    }
    if (method === "PUT" && id) {
      const f = await failure("put"); if (f) return f;
      const cur = g.events.get(key);
      if (!cur) return reply(404, { error: { code: 404 } });
      if (headers["if-match"] && headers["if-match"] !== cur.etag) return reply(412, { error: { code: 412 } });
      const ev = stamp({ ...body, id });
      g.events.set(key, ev);
      return reply(200, ev);
    }
    if (method === "DELETE" && id) { // M6: the event goes (Google keeps no attendee, title or place of it for us)
      const f = await failure("delete"); if (f) return f;
      if (!g.events.has(key)) return reply(410, { error: { code: 410 } });
      g.events.delete(key);
      return new Response(null, { status: 204 });
    }
    return reply(405, null);
  };
  // What a staff member would do by hand in Google: move the event (primary calendar; events of others are "cal/id").
  g.moveInGoogle = (id, start, end) => g.events.set(id, stamp({ ...g.events.get(id), start: { dateTime: start }, end: { dateTime: end } }));
  g.sent = () => JSON.stringify(g.calls.map(c => c.body));
  g.writes = () => g.calls.filter(c => c.url.startsWith(API) && ["POST", "PUT"].includes(c.method) && !c.url.includes("freeBusy"));
  return g;
}
