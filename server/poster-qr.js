// ANA-10: a window poster's QR opens /p/<id>?src=qr; the website then counts one open (site/index.html). Counts per
// listing and Jersey day only (migration 0091), never who. Switched off until ANA10_QR_OPENS_READY.
import { json, fail } from "./http.js";
import { jerseyToday, plusDays } from "./viewings.js";
import { readLive } from "./routes/public.js";
import { rentalClosureEnabled, rentalClosureVisibleSql, closureOrOff } from "./rental-closure.js";
import lib from "../site/lib.js";

export const posterQrEnabled = env => env.ANA10_QR_OPENS_READY === "1";
export const PER_LISTING = 200, PER_DAY = 5000;
const DAYS = 90;

// One statement, at most one row written: a listing live on the website (PUB-16 included) under both caps. Past a cap
// nothing is written (5,000 rows a day at most, 5% of D1 Free's 100,000).
export const countQrOpen = (env, id) => closureOrOff(env, env => {
  const day = jerseyToday();
  return env.DB.prepare(`INSERT INTO listing_qr_opens (day, listing_id, n) SELECT ?, l.id, 1 FROM listings l
    WHERE l.id = ? AND l.published = 1 AND l.archived_at IS NULL${rentalClosureEnabled(env) ? ` AND ${rentalClosureVisibleSql("l")}` : ""}
      AND (SELECT COALESCE(SUM(n), 0) FROM listing_qr_opens WHERE day = ?) < ${PER_DAY}
    ON CONFLICT DO UPDATE SET n = n + 1 WHERE n < ${PER_LISTING}`).bind(day, id, day).run();
});

// Staff: the address the poster's QR carries, only while the website shows the listing, and its opens of the last 90
// Jersey days. Reading this counts nothing.
async function posterQr({ env, params: [id] }) {
  if (!posterQrEnabled(env)) fail(404, "Not found");
  const shown = (await readLive(env, id)).some(x => lib.shownOnSite(x.pub));
  const { opens } = await env.DB.prepare("SELECT COALESCE(SUM(n), 0) AS opens FROM listing_qr_opens WHERE listing_id = ? AND day >= ?")
    .bind(id, plusDays(jerseyToday(), 1 - DAYS)).first();
  return json({ shown, url: shown ? `${env.SITE_URL.replace(/\/+$/, "")}/p/${id}?src=qr` : null, opens, days: DAYS });
}

// Insights: the period's opens, while switched on.
export const qrOpensTotal = (env, from, to) =>
  env.DB.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM listing_qr_opens WHERE day BETWEEN ? AND ?").bind(from, to);

export const posterQrRoutes = [["GET", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/poster-qr$/, posterQr, true]];
