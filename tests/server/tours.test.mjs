import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { embedTour } from "../../server/routes/tours.js";

test("tour links: Matterport kept, YouTube/Vimeo share links become players, anything else refused", () => {
  assert.equal(embedTour("https://my.matterport.com/show/?m=JGPnGQ6hosj"), "https://my.matterport.com/show/?m=JGPnGQ6hosj");
  assert.equal(embedTour("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(embedTour("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(embedTour("https://vimeo.com/76979871"), "https://player.vimeo.com/video/76979871");
  for (const bad of ["http://my.matterport.com/show/?m=JGPnGQ6hosj", "https://my.matterport.com/show/", "https://evil.com/?m=x", "javascript:alert(1)", ""])
    assert.equal(embedTour(bad), null, bad);
});

test("tours: sample seeded, admin CRUD + order, public sees only visible ones", async () => {
  const env = makeEnv(), cookie = await adminCookie();
  assert.equal((await call(env, "GET", "/admin/tours")).status, 401);
  assert.equal((await call(env, "POST", "/admin/tours", { body: { title: "x", url: "https://youtu.be/dQw4w9WgXcQ" } })).status, 401);
  assert.deepEqual((await call(env, "GET", "/tours")).data.map(t => t.title), ["Sample 3D tour"]);

  assert.equal((await call(env, "POST", "/admin/tours", { cookie, body: { title: "Bad", url: "https://evil.com" } })).status, 400);
  assert.equal((await call(env, "POST", "/admin/tours", { cookie, body: [] })).status, 400);
  const { id } = (await call(env, "POST", "/admin/tours", { cookie, body: { title: " Le Bernage ", url: "https://youtu.be/dQw4w9WgXcQ", caption: "Walkthrough" } })).data;
  let all = (await call(env, "GET", "/admin/tours", { cookie })).data.tours;
  assert.deepEqual(all.map(t => [t.title, t.position]), [["Sample 3D tour", 1], ["Le Bernage", 2]]);
  assert.equal(all[1].url, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");

  assert.equal((await call(env, "PUT", "/admin/tours/order", { cookie, body: { ids: [id, all[0].id] } })).status, 200);
  assert.equal((await call(env, "PUT", `/admin/tours/${all[0].id}`, { cookie, body: { published: false } })).status, 200);
  assert.equal((await call(env, "PUT", `/admin/tours/${id}`, { cookie, body: { published: "yes" } })).status, 400);
  assert.deepEqual((await call(env, "GET", "/tours")).data, [{ title: "Le Bernage", url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", caption: "Walkthrough" }]);

  assert.equal((await call(env, "DELETE", `/admin/tours/${id}`, { cookie })).status, 200);
  assert.equal((await call(env, "DELETE", `/admin/tours/${id}`, { cookie })).status, 404);
  assert.deepEqual((await call(env, "GET", "/tours")).data, []);
});
