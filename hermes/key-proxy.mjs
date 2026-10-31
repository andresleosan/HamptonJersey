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
    // Past the limit (declared or read), 413 and the connection closed: the rest of the body is never read.
    const tooBig = () => { res.writeHead(413, { "content-type": "text/plain; charset=utf-8", connection: "close" })
      .end("Request too large", () => req.destroy()); };
    if (Number(req.headers["content-length"]) > MAX_BODY) return tooBig();
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      if ((size += c.length) > MAX_BODY) return tooBig();
      chunks.push(c);
    }
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
  // Only the private network shared with Hermes: never every interface.
  if (!/^https:\/\/[^/]+$/.test(origin ?? "") || key.length < 32 || !host || ["0.0.0.0", "::", "[::]"].includes(host)) {
    console.error("Set APP_ORIGIN (https://host), HERMES_KEY_FILE (a key of 32+ characters) and LISTEN_HOST (a private address, not 0.0.0.0 or ::)");
    process.exit(1);
  }
  makeServer({ origin, key }).listen(Number(port), host, () => console.log(`Forwarding /api/hermes/ to ${origin}`));
}
