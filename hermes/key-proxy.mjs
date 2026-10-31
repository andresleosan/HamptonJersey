// AUT-13, decision H4 (spec 2026-10-31): the custodian of Hampton App's key for Hermes. It runs on the VPS outside
// Hermes's container, on a private network Hermes can reach; Hermes calls it with no key and it forwards only the
// door's GET and POST requests (/api/hermes/...) to the app, adding the key. Node, no dependencies.
//
// APP_ORIGIN=https://<app host> HERMES_KEY_FILE=/run/secrets/hermes_key LISTEN_HOST=<private address> \
//   LISTEN_PORT=8787 node hermes/key-proxy.mjs
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DOOR = /^\/api\/hermes\/[A-Za-z0-9_/-]+(\?[A-Za-z0-9=&_-]*)?$/; // the raw request line: no "..", "//" or host
const MAX_BODY = 163840; // the door's own limit for a draft

export function makeServer({ origin, key, fetchFn = fetch }) {
  return createServer(async (req, res) => {
    const reply = (status, body = "", type = "text/plain; charset=utf-8") => res.writeHead(status, { "content-type": type }).end(body);
    if (!DOOR.test(req.url) || req.url.includes("//")) return reply(404, "Not found");
    if (req.method !== "GET" && req.method !== "POST") return reply(405, "Method not allowed");
    const chunks = [];
    let size = 0;
    for await (const c of req) if ((size += c.length) <= MAX_BODY) chunks.push(c); // past the limit: read, not kept
    if (size > MAX_BODY) return reply(413, "Request too large");
    try {
      const r = await fetchFn(origin + req.url, {
        method: req.method, redirect: "manual", signal: AbortSignal.timeout(15000),
        headers: { authorization: `Bearer ${key}`, "user-agent": "hampton-hermes-key-proxy",
          ...(req.method === "POST" ? { "content-type": "application/json" } : {}) },
        body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
      });
      reply(r.status, Buffer.from(await r.arrayBuffer()), r.headers.get("content-type") ?? "application/json");
    } catch { reply(502, "Hampton App did not answer"); }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { APP_ORIGIN: origin, HERMES_KEY_FILE: file, LISTEN_HOST: host, LISTEN_PORT: port = "8787" } = process.env;
  const key = file ? readFileSync(file, "utf8").trim() : "";
  if (!/^https:\/\/[^/]+$/.test(origin ?? "") || key.length < 32 || !host) {
    console.error("Set APP_ORIGIN (https://host), HERMES_KEY_FILE (a key of 32+ characters) and LISTEN_HOST");
    process.exit(1);
  }
  makeServer({ origin, key }).listen(Number(port), host, () => console.log(`Forwarding /api/hermes/ to ${origin}`));
}
