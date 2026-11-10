"""Transform copied sources for fictional full-app QA; never modify the checkout."""
import hashlib
import json
from pathlib import Path
import re
import shutil


REPO = Path(__file__).resolve().parents[4]
SITE_URL = "https://hamptonjersey-qa.pages.dev"
SIMULATED_TOKEN = "qa-simulated-antispam"

RUNTIME = r'''// Artifact-only QA runtime. No provider authentication or anti-spam verification.
(() => {
  const origin = "https://hamptonjersey-qa.pages.dev";
  if (location.origin !== origin) return;
  const allowed = value => {
    try {
      const u = new URL(value, location.href);
      return u.origin === origin && u.protocol === "https:" && !u.username && !u.password
        && !u.pathname.startsWith("/qa-disabled");
    } catch { return false; }
  };
  const disable = a => {
    if (!allowed(a.getAttribute("href"))) {
      a.removeAttribute("href"); a.setAttribute("aria-disabled", "true");
      a.setAttribute("title", "External navigation is disabled in fictional QA");
    }
  };
  const scan = () => document.querySelectorAll("a[href], area[href]").forEach(disable);
  document.addEventListener("click", e => {
    const a = e.target.closest?.("a[href], area[href]");
    if (a && !allowed(a.getAttribute("href"))) {
      e.preventDefault(); e.stopImmediatePropagation(); disable(a);
    }
  }, true);
  document.addEventListener("submit", e => {
    if (!allowed(e.target.action || location.href)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  const nativeOpen = window.open.bind(window);
  window.open = (url, ...args) => allowed(url) ? nativeOpen(url, ...args) : null;
  new MutationObserver(scan).observe(document, {subtree:true, childList:true, attributes:true, attributeFilter:["href"]});
  scan();

  const widgets = new Map(); let next = 0;
  const token = "qa-simulated-antispam";
  window.turnstile = {
    render(target, options = {}) {
      const container = typeof target === "string" ? document.querySelector(target) : target;
      if (!container) throw new Error("QA simulator needs a form container");
      const input = document.createElement("input"); input.type="hidden";
      input.name="cf-turnstile-response"; input.value=token;
      const label = document.createElement("p"); label.setAttribute?.("role", "status");
      label.textContent="QA simulator: anti-spam provider is not contacted.";
      container.append(input, label);
      const id = "qa-widget-" + (++next); widgets.set(id, {input,label,options});
      queueMicrotask(() => { if (widgets.has(id)) options.callback?.(token); });
      return id;
    },
    reset(id) { const w=widgets.get(id); if(w){w.input.value=token;queueMicrotask(()=>w.options.callback?.(token));} },
    remove(id) { const w=widgets.get(id); if(w){w.input.remove();w.label.remove();widgets.delete(id);} },
    getResponse(id) { return widgets.get(id)?.input.value || ""; }
  };
})();
'''

LOGIN = '''import { useState } from "react";
import { api } from "./api.js";

export default function Login({ onSignedIn, title = "Fictional QA staff", note = "Use the approved QA runner session. Google sign-in is disabled.", home = true }) {
  const [error, setError] = useState("");
  const check = async () => {
    try { const me = await api("/me"); onSignedIn(me.email); }
    catch { setError("No active QA session. The approved runner must provide it."); }
  };
  return <section className="card login" aria-labelledby="login-title">
    <h1 id="login-title">{title}</h1><p>{note}</p>
    <button type="button" className="btn" onClick={check}>Check QA session</button>
    {error && <p role="alert">{error}</p>}
    {home && <a href="/">Back to the fictional website</a>}
  </section>;
}
'''

HEADERS = '''/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
/admin/*
  X-Frame-Options: DENY
'''


def _replace(text, old, new, label):
    if text.count(old) != 1:
        raise ValueError(f"Unexpected frontend source drift: {label}")
    return text.replace(old, new, 1)


def _sub(text, pattern, replacement, label, count=1):
    result, found = re.subn(pattern, replacement, text, flags=re.S)
    if found != count:
        raise ValueError(f"Unexpected frontend source drift: {label}")
    return result


def apply_frontend(workroot: Path) -> dict:
    """Apply once to a complete copied source tree; fail on unsupported source drift."""
    root = Path(workroot).resolve()
    if root == REPO or root in REPO.parents:
        raise ValueError("Frontend overlay requires copied staging sources")
    for folder in ("site", "admin", "server", "shared"):
        target = root / folder
        if not target.is_dir() or target.is_symlink() or target.is_junction() or target.resolve() == REPO / folder:
            raise ValueError("Frontend overlay requires independent copied source directories")
        for path in target.rglob("*"):
            if path.is_symlink() or path.is_junction() or (path.is_file() and path.stat().st_nlink > 1):
                raise ValueError("Linked staging sources are forbidden")

    # Prepare every text edit before writing, so source drift cannot produce a partial overlay.
    original_team = json.loads((root / "site/data/team.json").read_text(encoding="utf-8"))
    files = {}
    for folder in ("site", "admin"):
        for path in (root / folder).rglob("*"):
            if path.is_file() and path.suffix in (".js", ".mjs", ".jsx", ".html", ".css", ".json", ".txt"):
                files[path.relative_to(root).as_posix()] = path.read_text(encoding="utf-8")

    page = files["site/index.html"]
    page = _sub(page, r'<script type="application/ld\+json">.*?</script>', "", "structured data")
    page = _sub(page, r'<footer>.*?</footer>', '''<footer><div class="wrap"><div><b>Fictional QA Estates</b><p>Fictional properties and contacts for testing only.</p></div><div><b>QA environment</b><p>No business enquiries or external delivery.</p></div></div><div class="wrap staff-row"><a href="#/privacy">Privacy</a><a href="/admin/">Staff login</a></div></footer>''', "footer")
    page = _sub(page, r'<script src="https://challenges\.cloudflare\.com/turnstile/[^>]+></script>', "", "provider script")
    page = _sub(page, r'const track = \(id, metric\) => \{.*?\n\};', 'const track = (id, metric) => {};', "track")
    page = _replace(page, 'const wix = (url, w, h) => url ? `${url}/v1/fill/w_${w},h_${h},al_c,q_80/photo.jpg` : "";', 'const wix = (url, w, h) => url || "";', "team image transformation")
    page = _replace(page, 'const tsReady = new Promise(r => { window.onTurnstile = r; });', 'const tsReady = Promise.resolve();', "simulator readiness")
    page = _replace(page, 'TS_KEY = c.status === "fulfilled" && typeof c.value?.turnstileSiteKey === "string" ? c.value.turnstileSiteKey : null;', 'TS_KEY = "qa-simulator";', "simulator key")
    page = _replace(page, 'if (location.hostname.endsWith(".pages.dev")) return;', 'if (location.origin !== "https://hamptonjersey-qa.pages.dev") return;', "chat origin guard")
    page = _sub(page, r'chatBtn\.addEventListener\("click",.*?\n  if \(kept\)', '''chatBtn.addEventListener("click", () => load().then(m => m.toggle(), () => {
    chatBtn.textContent = "QA chat unavailable"; }));
  if (kept)''', "chat fallback")
    page = _sub(page, r'<a class="btn ghost" href="https://wa\.me/\?text=.*?</a>', '<span class="hint">External sharing is disabled in QA.</span>', "sharing")
    page = _sub(page, r'const bios = \[.*?\];', 'const bios = ["Fictional negotiator for QA viewing and sales scenarios.", "Fictional negotiator for QA availability and team scenarios."];', "fictional biographies")
    page = _sub(page, r'<p class="team-intro">Established.*?</p>', '<p class="team-intro">Synthetic negotiators for testing the full application.</p>', "team introduction")
    page = _sub(page, r'<p>Sales, lettings and free valuations from .*?</p>', '<p>Fictional properties and generated patterns for testing search, registration and viewing workflows.</p>', "hero narrative")
    page = _sub(page, r'<div class="contact num">.*?</div>', '<div class="contact num">Fictional contact · external communication disabled</div>', "team contact")
    page = page.replace('Homes across Jersey, since 1982', 'Fictional homes for QA scenarios')
    files["site/index.html"] = page

    lib = files["site/lib.js"]
    lib = _replace(lib, 'const IMG_HOST = "https://static.wixstatic.com/media/";', 'const IMG_HOST = "/qa-assets/";', "image origin")
    lib = _sub(lib, r'const safeUrl = \(u, prefix\) => \{.*?\n\};', '''const safeUrl = (u, prefix) => typeof u === "string" && /^\\/qa-assets\\/qa-pattern-0[123]\\.png$/.test(u) ? u : null;''', "team safe URL")
    lib = _sub(lib, r'const safeHttps = u => \{.*?\};', 'const safeHttps = u => null;', "tour URL")
    lib = _replace(lib, 'const EMBED_HOSTS = ["my.matterport.com", "player.vimeo.com", "www.youtube-nocookie.com"];', 'const EMBED_HOSTS = [];', "embed hosts")
    files["site/lib.js"] = lib

    apply = files["site/apply.js"]
    apply = _sub(apply, r'// Controller details.*?export function renderPrivacy\(root\) \{.*\Z', '''export function renderPrivacy(root) {
  root.innerHTML = `<section class="block"><div class="wrap legal"><h1>Privacy notice</h1>
    <p>This fictional QA environment is for synthetic test data only. Do not enter real personal information.</p>
    <h2>Test records</h2><p>Forms, chat, consent and email states are simulations. No real messages or provider calls are made.</p>
    <h2>In your browser</h2><p>Search preferences can remain in this tab. Chat uses a local return key. Clear browser storage to end your test session.</p>
    <h2>Contact</h2><p>External contact links are disabled. Use the approved QA workflow.</p>
  </div></section>`;
}
''', "fictional privacy")
    files["site/apply.js"] = apply
    files["admin/src/firebase.js"] = '''// Artifact-only stub. Provider authentication is unavailable in fictional QA.
export async function googleIdToken() { throw new Error("Google authentication is disabled in QA"); }
export async function firebaseSignOut() {}
'''
    files["admin/src/Login.jsx"] = LOGIN
    files["admin/src/main.jsx"] = _replace(files["admin/src/main.jsx"], 'const screen=location.hash==="#/qa-history" ? import("./QaHistoryApp.jsx") : import("./App.jsx");', 'const screen=import("./App.jsx");', "full app entry")
    files.pop("admin/src/QaHistoryApp.jsx", None)
    tours = files["admin/src/Tours.jsx"]
    tours = _sub(tours, r'<iframe src=\{t\.url\}.*?/>', '<p role="status">QA simulation: external tour players are disabled.</p>', "tour preview")
    files["admin/src/Tours.jsx"] = tours
    files["admin/src/format.js"] = _sub(files["admin/src/format.js"], r'export const safeHref = u => .*?;', 'export const safeHref = u => undefined;', "external admin links")

    # Neutralize source contact text without recording the original identities in this script.
    identities = sorted({str(member[key]) for member in original_team for key in ("name", "phone", "office", "photo") if member.get(key)}, key=len, reverse=True)
    for name, text in files.items():
        if name.endswith(".html"):
            text = re.sub(r'<link\b[^>]*href="https://fonts\.[^>]*>\s*', '', text)
            text = text.replace('<link rel="icon" href="/favicon.ico" sizes="any">', '<link rel="icon" href="/qa-assets/qa-pattern-01.png" type="image/png">')
            text = text.replace('href="/apple-touch-icon.png"', 'href="/qa-assets/qa-pattern-02.png"')
            text = text.replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow">\n<script src="/qa-runtime.js"></script>', 1)
            banner = '<aside id="qa-environment" role="note" style="padding:8px 16px;background:#fff3c4;color:#211b08;text-align:center">FICTIONAL QA · Synthetic records only · Providers and external contact disabled</aside>'
            text = text.replace('<body>', '<body>' + banner, 1)
        for identity in identities:
            text = text.replace(identity, 'QA fixture')
        text = re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'qa-contact@example.test', text)
        text = re.sub(r'(?<!\w)(?:\+44\s?|0)(?:[\d ]{8,13})\d(?!\w)', 'QA contact disabled', text)
        text = re.sub(r'https?://(?!www\.w3\.org/2000/svg)[A-Za-z0-9.-]+(?::\d+)?', SITE_URL, text)
        text = text.replace('/og-image.jpg', '/qa-assets/qa-pattern-03.png')
        text = re.sub(r'Hampton Estates(?: Jersey)?', 'Fictional QA Estates', text, flags=re.I)
        text = re.sub(r'JERSEY · SINCE 1982|Jersey · since 1982', 'FICTIONAL QA', text)
        text = text.replace('A family firm on Bath Street', 'Fictional QA team')
        text = re.sub(r'(?:42 )?Bath Street', 'Fictional QA location', text)
        text = text.replace('Jersey JE2 4ST', 'QA fixture location')
        text = text.replace('https://hamptonjersey-qa.pages.dev/qa-assets/', '/qa-assets/')
        files[name] = text

    # Deliberate metadata overrides avoid retaining real narrative or photo descriptions.
    page = files["site/index.html"]
    page = re.sub(r'<meta name="description"[^>]+>', '<meta name="description" content="Fictional full-app QA environment with synthetic records.">', page)
    for key in ('og:description', 'og:image:alt'):
        page = re.sub(r'<meta property="' + key + r'"[^>]+>', '<meta property="' + key + '" content="Generated QA patterns and fictional records.">', page)
    page = page.replace('property="og:image:width" content="1200"', 'property="og:image:width" content="600"')
    page = page.replace('property="og:image:height" content="630"', 'property="og:image:height" content="400"')
    files["site/index.html"] = page

    # Dynamic head builders replace the sanitized static metadata on deep links.
    seo = (root / 'server/seo.js').read_text(encoding='utf-8')
    seo = _sub(seo, r'const BRAND = ".*?";', 'const BRAND = "Fictional QA Estates";', "SEO branding")
    seo = _sub(seo, r'const PROPERTIES = \{.*?\};', 'const PROPERTIES = { title: `Properties · ${BRAND}`, description: "Fictional QA properties with synthetic records and generated patterns." };', "SEO description")
    seo = _replace(seo, '`${siteUrl}/og-image.jpg`', '`${siteUrl}/qa-assets/qa-pattern-03.png`', "SEO pattern image")
    seo = _sub(seo, r'imageAlt: "A country house.*?"', 'imageAlt: "Generated QA pattern"', "SEO image alternative")
    seo = _replace(seo, 'meta("description", m.description, "name"),', 'meta("robots", "noindex, nofollow", "name"),\n    meta("description", m.description, "name"),', "SEO robots metadata")
    seo = _replace(seo, 'if (new URL(request.url).host !== new URL(env.SITE_URL).host) h.set("x-robots-tag", "noindex");', 'h.set("x-robots-tag", "noindex, nofollow");', "SEO robots headers")
    seo = _sub(seo, r'export const robotsTxt = siteUrl => .*?;\n', 'export const robotsTxt = siteUrl => `User-agent: *\\nDisallow: /\\n`;\n', "SEO robots policy")
    files['server/seo.js'] = seo

    for name, text in files.items():
        (root / name).write_text(text, encoding="utf-8", newline="\n")
    (root / 'admin/src/QaHistoryApp.jsx').unlink(missing_ok=True)
    for name in ('og-image.jpg', 'favicon.ico', 'apple-touch-icon.png'):
        (root / 'site' / name).unlink(missing_ok=True)
    assets = root / 'site/qa-assets'
    assets.mkdir(exist_ok=True)
    for i in range(1, 4):
        filename = f'qa-pattern-{i:02}.png'
        shutil.copyfile(REPO / 'docs/qa/full-app/media' / filename, assets / filename)
    team = [dict(name=f'QA Negotiator {i:02}', role='QA fixture', phone=None, office=None,
                 photo=f'/qa-assets/qa-pattern-{i:02}.png') for i in (1, 2)]
    (root / 'site/data/team.json').write_text(json.dumps(team, indent=2) + '\n', encoding='utf-8')
    (root / 'site/qa-runtime.js').write_text(RUNTIME, encoding='utf-8', newline='\n')
    (root / 'site/_headers').write_text(HEADERS, encoding='utf-8', newline='\n')
    (root / 'site/_redirects').write_text('# QA has no production legacy redirects.\n', encoding='utf-8')
    return dict(site_url=SITE_URL, simulated_antispam=SIMULATED_TOKEN,
                provider_authentication=False, external_frames=False, telemetry=False,
                team_records=2, generated_asset_files=3,
                runtime_sha256=hashlib.sha256(RUNTIME.encode()).hexdigest(),
                limitations=['Anti-spam and provider login are simulated or unavailable.',
                             'Current seed exposes one photo-backed public listing.',
                             '3D embeds, outbound contact and external navigation are disabled.'])
