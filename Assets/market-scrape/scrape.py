#!/usr/bin/env python3
"""Local market scrape of the BUS-19 'allowed' channels -> SQLite. Read-only on the web.
Rules: robots.txt per host, identified bot, one request per host every DELAY s, listing cap per channel,
photos kept as links only. A channel that fails is recorded as failed, never as empty."""
import hashlib, html as htmllib, json, re, sqlite3, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urldefrag
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
import lxml.html

HERE = Path(__file__).resolve().parent
DB = HERE / 'market-scrape.sqlite3'
DECISIONS = Path(sys.argv[1])           # decisiones-2026-11-16.json
UA = 'HamptonEstatesBot/0.1 (+https://www.hamptonestatesjersey.com)'
DELAY, MAX_PAGES, MAX_LISTINGS, WORKERS = 2.0, 12, 150, 12
now = lambda: datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

SCHEMA = '''
CREATE TABLE IF NOT EXISTS channels(channel_id TEXT PRIMARY KEY, source_ref TEXT, name TEXT, url TEXT, status TEXT,
  pages_fetched INT DEFAULT 0, candidates INT DEFAULT 0, listings INT DEFAULT 0, note TEXT, finished_at TEXT);
CREATE TABLE IF NOT EXISTS listings(id INTEGER PRIMARY KEY, channel_id TEXT, source_ref TEXT, url TEXT UNIQUE, title TEXT,
  operation TEXT, price_text TEXT, price_value INT, price_period TEXT, bedrooms INT, bathrooms INT, address TEXT,
  reference TEXT, description TEXT, images_json TEXT, listing_status TEXT, first_seen TEXT, last_seen TEXT);
CREATE TABLE IF NOT EXISTS channel_listings(channel_id TEXT, listing_id INT, PRIMARY KEY(channel_id,listing_id));
CREATE TABLE IF NOT EXISTS observations(listing_id INT, observed_at TEXT, price_value INT, listing_status TEXT, content_sha256 TEXT);
CREATE TABLE IF NOT EXISTS fetch_log(url TEXT, at TEXT, status INT, bytes INT, note TEXT);
'''
db = sqlite3.connect(DB, check_same_thread=False); db.executescript(SCHEMA); lock = threading.Lock()

def sql(q, *a):
    with lock:
        cur = db.execute(q, a); db.commit(); return cur

# ---------- polite fetch ----------
_robots, _last, _hostlock = {}, {}, {}
def bare(h): return (h or '').lower().removeprefix('www.')

def robots_for(host):
    if host not in _robots:
        rp = RobotFileParser()
        try:
            with urlopen(Request(f'https://{host}/robots.txt', headers={'User-Agent': UA}), timeout=15) as r:
                rp.parse(r.read(300_000).decode('utf-8', 'replace').splitlines())
        except Exception as e:
            code = getattr(e, 'code', None)
            if code in (401, 403): rp.disallow_all = True
            else: rp.parse([])
        _robots[host] = rp
    return _robots[host]

class Renderer:
    """Navegador Playwright (Chromium) en un contenedor Docker sin red de entrada, no root y sin capacidades; habla por stdio."""
    CMD = ['docker', 'run', '-i', '--rm', '--init', '--name', 'hampton-render', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
           '--read-only', '--tmpfs', '/tmp', '--shm-size', '1g', '--memory', '3g', '--pids-limit', '400', 'hampton-render']
    def __init__(self):
        subprocess.run(['docker', 'rm', '-f', 'hampton-render'], capture_output=True)
        self.p = subprocess.Popen(self.CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.lock, self.n, self.wait = threading.Lock(), 0, {}
        threading.Thread(target=self._read, daemon=True).start()
    def _read(self):
        for line in self.p.stdout:
            try: d = json.loads(line)
            except ValueError: continue
            w = self.wait.pop(d['id'], None)
            if w: w[1].update(d); w[0].set()
    def get(self, url, timeout=60):
        with self.lock:
            self.n += 1; i = self.n; ev = threading.Event(); res = {}; self.wait[i] = (ev, res)
            self.p.stdin.write(json.dumps({'id': i, 'url': url}) + '\n'); self.p.stdin.flush()
        if not ev.wait(timeout): self.wait.pop(i, None); return None, 'timeout', ''
        if 'error' in res: return None, res['error'], ''
        return res['status'], res['final'], res['html']
RENDER = Renderer()

def fetch(url, host0):
    host = urlsplit(url).hostname
    if bare(host) != bare(host0): return None, None, 'other-host'
    if not robots_for(host).can_fetch(UA, url): return None, None, 'robots'
    for attempt in range(3):
        wait = DELAY - (time.time() - _last.get(bare(host), 0))
        if wait > 0: time.sleep(wait)
        _last[bare(host)] = time.time()
        try:
            code, final, body = RENDER.get(url)
            if code is None: raise RuntimeError(final)
            if bare(urlsplit(final).hostname) != bare(host0): return None, None, 'redirect-other-host'
            sql('INSERT INTO fetch_log VALUES(?,?,?,?,?)', url, now(), code, len(body), '')
            if code >= 400:
                if code in (429, 503): time.sleep(10 * (attempt + 1)); continue
                return None, None, f'http-{code}'
            return body, final, 'ok'
        except Exception as e:
            code = getattr(e, 'code', None)
            sql('INSERT INTO fetch_log VALUES(?,?,?,?,?)', url, now(), code, 0, str(e)[:120])
            if code in (429, 503) or code is None:
                time.sleep(10 * (attempt + 1)); continue
            return None, None, f'http-{code}'
    return None, None, 'failed-retries'

# ---------- extraction ----------
PRICE = re.compile(r'£\s?([\d]{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?')
PRICE_ANY = re.compile(r'£\s?[\d,]{3,}(?:\.\d+)?(?:\s?(?:pcm|pw|per (?:week|month|calendar month)|p\.?c\.?m\.?|p/?w|a month|monthly|weekly))?', re.I)
NUM = {'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9,'ten':10,'studio':0}
BEDS = re.compile(r'\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*[-\s]?(?:double\s)?(?:bed(?:room)?s?\b|br\b)', re.I)
BEDS2 = re.compile(r'bed(?:room)?s?\s*[:\-]?\s*(\d{1,2})\b', re.I)
BATHS = re.compile(r'\b(\d{1,2})\s*[-\s]?bath(?:room)?s?\b', re.I)
RENT_W = re.compile(r'to[- ]let|to[- ]rent|for rent|lettings?|\bpcm\b|\bp\.?c\.?m\b|per (?:month|week|calendar month)|\bpw\b|a month', re.I)
SALE_W = re.compile(r'for[- ]sale|guide price|offers (?:in excess|over|around)|freehold|share transfer|price on application|\bpoa\b', re.I)
STATUS_W = re.compile(r'\b(sold stc|sold|sale agreed|let agreed|under offer|reserved|withdrawn|let)\b', re.I)
DETAIL_PATH = re.compile(r'(?:property-for-(?:sale|rent)-[^/?#]+)|/(?:property|properties|propert[a-z-]*|details?|listing|listings|for-sale|to-let|to-rent|residential|lettings?|sales?|homes?|buy|rent|developments?|projects?)/[^/?#]+', re.I)
JUNK = re.compile(r'/(?:about|contact|team|news|blog|careers|privacy|cookie|terms|login|register|sitemap|faq|tag|category|author|feed|wp-|search|valuation|landlords?|sellers?|insights?|services|staff|meet|press|gallery|property-type|property_type|property-category|location|area|agencies|agents?|type)(?:[/\-.]|$)', re.I)
ASSET = re.compile(r'\.(?:jpe?g|png|gif|webp|svg|pdf|docx?|xlsx?|zip|mp4|css|js)(?:\?|$)', re.I)

def tree(html):
    try: return lxml.html.fromstring(html)
    except Exception: return None

def clean(s): return re.sub(r'\s+', ' ', htmllib.unescape(s or '')).strip()

def cards(doc, base):
    """Links inside a price-bearing block: climb from each price text node to the smallest ancestor with one link target."""
    found = {}
    for node in doc.iter():
        if node.tag in ('script', 'style', 'noscript') or not isinstance(node.tag, str): continue
        txt = (node.text or '') + ''.join((c.tail or '') for c in node)
        if '£' not in txt or not PRICE.search(txt): continue
        el = node
        for _ in range(7):
            hrefs = {urldefrag(urljoin(base, a.get('href')))[0] for a in el.iter('a') if a.get('href') and not a.get('href').startswith(('mailto:', 'tel:', 'javascript:', '#'))}
            hrefs = {h for h in hrefs if not ASSET.search(h)}
            if len(hrefs) >= 1 and len(PRICE.findall(el.text_content())) <= 2 and len(hrefs) <= 3:
                for h in hrefs: found.setdefault(h, clean(el.text_content())[:400])
                break
            if el.getparent() is None: break
            el = el.getparent()
    return found

def pattern_links(doc, base, chan_url):
    out = set()
    for a in doc.iter('a'):
        h = a.get('href')
        if not h or h.startswith(('mailto:', 'tel:', 'javascript:', '#')): continue
        u = urldefrag(urljoin(base, h))[0]
        if ASSET.search(u) or u.rstrip('/') == chan_url.rstrip('/'): continue
        p = urlsplit(u).path
        if DETAIL_PATH.search(p) and not JUNK.search(p) and (len(p.strip('/').split('/')) >= 2 or 'property-for-' in p): out.add(u)
    return out

INDEX_W = re.compile(r'propert|for-sale|to-let|to-rent|letting|sales|portfolio|buy|rent|available|current|residential|search-results|listings', re.I)
INDEX_BAD = re.compile(r'about|contact|team|news|blog|career|privacy|cookie|terms|login|register|valuation|landlord|seller|insight|faq|press|account|mailto|tel:|\.(?:pdf|jpe?g|png)', re.I)
def index_links(doc, base, chan_url):
    out = []
    for a in doc.iter('a'):
        h = a.get('href')
        if not h or h.startswith(('#', 'javascript:')): continue
        u = urldefrag(urljoin(base, h))[0]
        label = clean(a.text_content()).lower()
        if u.rstrip('/') == chan_url.rstrip('/') or u in out: continue
        if (INDEX_W.search(urlsplit(u).path) or INDEX_W.search(label)) and not INDEX_BAD.search(urlsplit(u).path + ' ' + label) and len(label) < 40:
            out.append(u)
    return out[:5]

def next_pages(doc, base, cur):
    out = []
    for a in doc.iter('a'):
        h = a.get('href') or ''
        t = clean(a.text_content()).lower()
        rel = (a.get('rel') or '').lower()
        if 'next' in rel or t in ('next', 'next »', '»', '›', 'next page', '>') or re.search(r'[?&/]page[=/_-]?\d+', h) and 'next' in (a.get('class') or '').lower():
            u = urldefrag(urljoin(base, h))[0]
            if u != cur and u not in out: out.append(u)
    return out[:1]

def jsonld(doc):
    items = []
    for s in doc.xpath('//script[@type="application/ld+json"]'):
        try: data = json.loads(s.text or '')
        except Exception: continue
        stack = [data]
        while stack:
            x = stack.pop()
            if isinstance(x, list): stack += x
            elif isinstance(x, dict):
                items.append(x); stack += [v for v in x.values() if isinstance(v, (dict, list))]
    return items

def meta(doc, *names):
    for n in names:
        v = doc.xpath(f'//meta[@property="{n}" or @name="{n}"]/@content')
        if v: return clean(v[0])
    return None

def parse_detail(html, url):
    doc = tree(html)
    if doc is None: return None
    ld = jsonld(doc)
    for bad in doc.xpath('//script|//style|//noscript|//nav|//footer|//form'): bad.drop_tree()
    body = clean(doc.text_content())
    title = meta(doc, 'og:title', 'twitter:title') or clean((doc.xpath('//h1')[:1] or [None])[0].text_content() if doc.xpath('//h1') else '') or clean((doc.xpath('//title/text()') or [''])[0])
    h1 = clean(doc.xpath('//h1')[0].text_content()) if doc.xpath('//h1') else ''
    if h1 and len(h1) < 140: title = h1
    if re.fullmatch(r'(?i)key details|details|property|property details|overview|home|gallery|summary', title.strip()):
        title = clean((doc.xpath('//title/text()') or [''])[0]).split('|')[0].split(' - ')[0].strip() or meta(doc, 'og:title') or title
    desc = meta(doc, 'og:description', 'description') or ''
    price_text = None; period = None; value = None
    for it in ld:
        offer = it.get('offers') if isinstance(it.get('offers'), dict) else it
        p = offer.get('price') or offer.get('lowPrice')
        if p not in (None, '', 0, '0'):
            try: value = int(float(str(p).replace(',', ''))); price_text = f'£{value:,}'; break
            except Exception: pass
    # price from the first prominent price in the main content (before footer) if JSON-LD has none
    if value is None:
        head = body[:6000]
        m = PRICE_ANY.search(head) or PRICE_ANY.search(body)
        if m:
            price_text = clean(m.group(0)); mv = PRICE.search(price_text)
            value = int(mv.group(1).replace(',', '')) if mv else None
    pt = (price_text or '').lower()
    period = 'month' if re.search(r'pcm|p\.c\.m|month', pt) else 'week' if re.search(r'\bpw\b|p/w|week', pt) else None
    low = (url + ' ' + title + ' ' + body[:3000]).lower()
    rent = bool(RENT_W.search(low)) or period is not None
    sale = bool(SALE_W.search(low))
    op = 'rent' if rent and not (sale and not period and value and value > 20000) else 'sale' if sale or (value and value > 20000) else None
    if period is None and op == 'rent' and value and value < 20000: period = 'month'
    beds = None
    for src in (title, desc, body[:4000]):
        m = BEDS.search(src) or BEDS2.search(src)
        if m:
            g = m.group(1).lower(); beds = int(g) if g.isdigit() else NUM[g]; break
    bm = BATHS.search(body[:4000]); baths = int(bm.group(1)) if bm else None
    addr = None
    for it in ld:
        a = it.get('address')
        if isinstance(a, dict): addr = clean(', '.join(str(a.get(k)) for k in ('streetAddress', 'addressLocality', 'postalCode') if a.get(k)))
        elif isinstance(a, str): addr = clean(a)
        if addr: break
    ref = None
    m = re.search(r'(?:ref(?:erence)?|property id|prop(?:erty)? ref)\s*(?:no\.?|number)?\s*[:#]?\s*([A-Za-z0-9\-_/]{3,20})', body[:6000], re.I)
    if m: ref = m.group(1)
    imgs = []
    og = meta(doc, 'og:image')
    if og: imgs.append(urljoin(url, og))
    for src in doc.xpath('//img/@src|//img/@data-src|//a/@data-fancybox-href'):
        if re.search(r'\.(jpe?g|png|webp)', src or '', re.I):
            u = urljoin(url, src)
            if u not in imgs and not re.search(r'logo|icon|sprite|avatar|banner', u, re.I): imgs.append(u)
    st = STATUS_W.search(title + ' ' + body[:1500])
    return dict(title=title[:200], price_text=price_text, price_value=value, price_period=period, operation=op, bedrooms=beds, bathrooms=baths,
                address=addr, reference=ref, description=(desc or '')[:1500], images=imgs[:40], listing_status=st.group(1).lower() if st else None,
                has_signal=bool(value) or (beds is not None and bool(re.search(r'price on application|\bpoa\b|price upon|enquire', body[:4000], re.I))), sha=hashlib.sha256(body[:20000].encode()).hexdigest())

def save_listing(ch, url, d):
    t = now()
    with lock:
        row = db.execute('SELECT id FROM listings WHERE url=?', (url,)).fetchone()
        vals = (ch['channel_id'], ch['source_ref'], d['title'], d['operation'], d['price_text'], d['price_value'], d['price_period'], d['bedrooms'],
                d['bathrooms'], d['address'], d['reference'], d['description'], json.dumps(d['images']), d['listing_status'])
        if row:
            lid = row[0]
            db.execute('UPDATE listings SET channel_id=?,source_ref=?,title=?,operation=?,price_text=?,price_value=?,price_period=?,bedrooms=?,bathrooms=?,address=?,reference=?,description=?,images_json=?,listing_status=?,last_seen=? WHERE id=?', vals + (t, lid))
        else:
            lid = db.execute('INSERT INTO listings(channel_id,source_ref,title,operation,price_text,price_value,price_period,bedrooms,bathrooms,address,reference,description,images_json,listing_status,url,first_seen,last_seen) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', vals + (url, t, t)).lastrowid
        db.execute('INSERT INTO observations VALUES(?,?,?,?,?)', (lid, t, d['price_value'], d['listing_status'], d['sha']))
        db.execute('INSERT OR IGNORE INTO channel_listings VALUES(?,?)', (ch['channel_id'], lid))
        db.commit()

# ---------- one channel ----------
def scrape_channel(ch):
    url, host0 = ch['url'], urlsplit(ch['url']).hostname
    sql('INSERT OR REPLACE INTO channels(channel_id,source_ref,name,url,status) VALUES(?,?,?,?,?)', ch['channel_id'], ch['source_ref'], ch['name'], url, 'running')
    seen_pages, queue, cand, pages, note = set(), [url], {}, 0, ''
    while queue and pages < MAX_PAGES:
        u = queue.pop(0)
        if u in seen_pages: continue
        seen_pages.add(u)
        html, final, why = fetch(u, host0)
        if html is None:
            if pages == 0: note = f'primera página: {why}'
            break
        pages += 1
        doc = tree(html)
        if doc is None: break
        before = len(cand)
        for h, snippet in cards(doc, final).items():
            if bare(urlsplit(h).hostname) == bare(host0): cand.setdefault(h, snippet)
        for h in pattern_links(doc, final, url):
            if bare(urlsplit(h).hostname) == bare(host0): cand.setdefault(h, '')
        if len(cand) > before:
            for n in next_pages(doc, final, u): queue.append(n)
        elif not cand and u == url:
            queue += index_links(doc, final, url)
        if len(cand) >= MAX_LISTINGS * 2: break
    ok = 0; blocked = 0
    ordered = sorted(cand, key=lambda h: (cand[h] == '', h))[:MAX_LISTINGS * 2]
    for h in ordered:
        if ok >= MAX_LISTINGS: break
        if h.rstrip('/') == url.rstrip('/'): continue
        html, final, why = fetch(h, host0)
        if html is None:
            if why == 'robots': blocked += 1
            continue
        d = parse_detail(html, final)
        if d and d['has_signal'] and d['title']:
            save_listing(ch, final, d); ok += 1
    if note: status = 'fallo'
    elif ok: status = 'ok'
    elif pages and not cand: status = 'sin_anuncios'
    else: status = 'sin_anuncios' if pages else 'fallo'
    note = note or (f'{len(cand)} enlaces candidatos, {ok} fichas con precio o dormitorios' + (f', {blocked} bloqueadas por robots' if blocked else ''))
    sql('UPDATE channels SET status=?,pages_fetched=?,candidates=?,listings=?,note=?,finished_at=? WHERE channel_id=?', status, pages, len(cand), ok, note, now(), ch['channel_id'])
    print(f"[{status:12}] {ch['name'][:34]:34} {ok:4} fichas  {note[:70]}", flush=True)

def main():
    chans = [x for x in json.load(open(DECISIONS))['decisions'] if x['status'] == 'allowed']
    done = {r[0] for r in db.execute("SELECT channel_id FROM channels WHERE status IN ('ok','sin_anuncios')")}
    todo = [c for c in chans if c['channel_id'] not in done]
    only = sys.argv[2:]  # optional host filters
    if only: todo = [c for c in todo if any(o in c['url'] for o in only)]
    byhost = {}
    for c in todo: byhost.setdefault(bare(urlsplit(c['url']).hostname), []).append(c)
    print(f'{len(todo)} canales en {len(byhost)} webs', flush=True)
    def run(chs):
        for c in chs:
            try: scrape_channel(c)
            except Exception as e:
                sql("UPDATE channels SET status='fallo',note=? WHERE channel_id=?", f'error: {e}'[:200], c['channel_id']); print('ERROR', c['name'], e, flush=True)
    with ThreadPoolExecutor(WORKERS) as ex: list(ex.map(run, byhost.values()))
    print('FIN', flush=True)

main()
