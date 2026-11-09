// PUB-22: the date a listing last went on the website (migration 0021), which orders "newest" on the site.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie } from "./listing-client.mjs";

const at = (t, iso) => t.mock.timers.setTime(Date.parse(iso));
const publishedAt = env => env.DB.raw.prepare("SELECT published_at FROM listings WHERE id = 'HE-R001'").get().published_at;
const act = async (env, action) =>
  (await call(env, "POST", `/admin/listings/HE-R001/${action}`, { cookie: await adminCookie() })).status;

test("publishing stamps published_at only when it was hidden", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-06T09:00:00.000Z") });
  const env = makeEnv();
  seedListing(env, { published: 0 });
  assert.equal(publishedAt(env), null);
  assert.equal(await act(env, "publish"), 200);
  assert.equal(publishedAt(env), "2026-11-06T09:00:00.000Z");
  at(t, "2026-11-06T10:00:00.000Z");
  assert.equal(await act(env, "publish"), 200, "publishing a published listing again");
  assert.equal(publishedAt(env), "2026-11-06T09:00:00.000Z", "already on the website: unchanged");
  assert.equal(await act(env, "unpublish"), 200);
  assert.equal(publishedAt(env), "2026-11-06T09:00:00.000Z", "hiding keeps the date");
  at(t, "2026-11-06T11:00:00.000Z");
  assert.equal(await act(env, "publish"), 200);
  assert.equal(publishedAt(env), "2026-11-06T11:00:00.000Z", "back on the website: newest again");
});

test("the public API sends publishedAt", async () => {
  const env = makeEnv();
  seedListing(env, { published_at: "2026-11-01T08:00:00.000Z" });
  seedMedia(env);
  const [p] = (await call(env, "GET", "/listings")).data;
  assert.equal(p.publishedAt, "2026-11-01T08:00:00.000Z");
  assert.equal("order" in p, false, "the panel's old home order is no longer sent");
});
