// SPR-06 / SPR-07: the Listings list carries what its filters and columns need.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { plusDays, addMinutes } from "../../server/viewings.js";

const NOW = "2026-10-28T12:05:00.000Z", TOMORROW = plusDays("2026-10-28", 1);
const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);

function seedApplicant(env, n) {
  const c = run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    `Person ${n}`, `p${n}@example.je`, T0, T0, T0);
  return Number(run(env, `INSERT INTO applicants (contact_id, operation, stage, source, budget_max, created_at, updated_at)
    VALUES (?, 'buy', 'searching', 'phone', 1000000, ?, ?)`, Number(c.lastInsertRowid), T0, T0).lastInsertRowid);
}

test("list carries bedrooms, matched and interested", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const env = makeEnv();
  seedListing(env, { bedrooms: 3 });
  seedListing(env, { id: "HE-R002", title: "Quiet one", bedrooms: null });
  for (const n of [1, 2]) run(env, `INSERT INTO matches (applicant_id, listing_id, score, checks, status, created_at, updated_at)
    VALUES (?, 'HE-R001', 50, '[]', 'found', ?, ?)`, seedApplicant(env, n), T0, T0);
  run(env, `INSERT INTO viewing_requests (listing_id, negotiator_id, agent, kind, date, time, end_time, name, email, status, created_at)
    VALUES ('HE-R001', 1, 'Gilberto Franco', 'In person', ?, '10:00', ?, 'Sam Buyer', 'sam@x.je', 'requested', ?)`,
    TOMORROW, addMinutes("10:00", 30), T0);
  const rows = (await call(env, "GET", "/admin/listings", { cookie: await adminCookie() })).data.listings;
  const pick = id => (({ bedrooms, matched, interested }) => ({ bedrooms, matched, interested }))(rows.find(l => l.id === id));
  assert.deepEqual(pick("HE-R001"), { bedrooms: 3, matched: 2, interested: 1 });
  assert.deepEqual(pick("HE-R002"), { bedrooms: null, matched: 0, interested: 0 });
  // The parish filter of the API binds the same way.
  const st = (await call(env, "GET", "/admin/listings?parish=St%20Helier", { cookie: await adminCookie() }));
  assert.equal(st.status, 200);
});
