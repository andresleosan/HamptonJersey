// Release gate for the public site (spec G5): lists every "TO CONFIRM" marker left in site/ (the panel build in
// site/admin/ is skipped) with its file and line. While any remains it exits 1 on a Cloudflare Pages build (CF_PAGES
// is set there) and with --strict (`npm run check:release`); a local build only warns, so the site can still be tried.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const site = join(repo, "site");
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = join(dir, d.name);
  return d.isDirectory() ? (p === join(site, "admin") ? [] : files(p)) : [p];
});

// One entry per marker (two can share a line), up to the end of its clause.
const hits = files(site).flatMap(f => readFileSync(f, "utf8").split("\n")
  .flatMap((line, i) => [...line.matchAll(/TO CONFIRM[^,.<]*/g)].map(m => `${relative(repo, f)}:${i + 1}: ${m[0].trim()}`)));
if (!hits.length) {
  console.log("No TO CONFIRM markers in site/.");
} else if (process.env.CF_PAGES || process.argv.includes("--strict")) {
  console.error(`${hits.length} TO CONFIRM marker(s) left in site/. Not ready to release:\n${hits.join("\n")}`);
  process.exit(1);
} else {
  console.warn(`Warning: ${hits.length} TO CONFIRM marker(s) left in site/. A Cloudflare Pages build fails until they are filled:\n${hits.join("\n")}`);
}
