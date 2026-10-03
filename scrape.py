"""Scraper del sitio oficial (Wix) -> data/properties.json + data/team.json.
Uso: python3 scrape.py   (solo stdlib)"""
import html, json, re, urllib.request

BASE = "https://www.hamptonestatesjersey.com"
# international primero: la página residencial repite esos mismos ítems
PAGES = {"international": "/copy-of-residential-properties", "residential": "/residential-properties",
         "commercial": "/commercial-properties"}


def get(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf8")


def text(fragment):
    fragment = re.sub(r"<(script|style|svg)\b.*?</\1>", "", fragment, flags=re.S)
    t = html.unescape(re.sub(r"<br\s*/?>|</p>|</h\d>|</li>", "\n", fragment))
    t = re.sub(r"<[^>]+>", "", t).replace("​", "")
    return [l.strip() for l in t.split("\n") if l.strip()]


STATUSES = {"for sale", "under offer", "sold", "lease", "to let", "new"}


def parse_listing(src, category):
    # ponytail: Wix repeater -> cada componente lleva el sufijo __<uuid> del ítem; agrupamos por uuid
    marks = [(src.index(">", m.end()) + 1, m.group(1))
             for m in re.finditer(r'id="comp-[a-z0-9]+__([0-9a-f-]{36})"', src)]
    items = {}
    for (pos, uid), nxt in zip(marks, marks[1:] + [(len(src), None)]):
        chunk = src[pos:nxt[0]]
        it = items.setdefault(uid, {"lines": [], "img": None})
        it["lines"] += [l for l in text(chunk) if l != "MORE DETAILS"]
        m = re.search(r'static\.wixstatic\.com/media/([0-9a-z_]+~mv2\.(?:jpe?g|png|webp))', chunk, re.I)
        if m and not it["img"]:
            it["img"] = m.group(1)
    out = []
    for uid, it in items.items():
        L = it["lines"]
        cut = next((i for i, l in enumerate(L) if "TO CONTACT" in l or l.startswith("MORE DETAILS")), len(L))
        L = L[:cut]  # el último ítem arrastra el footer
        if len(L) < 3:
            continue
        price = next((l for l in reversed(L) if re.search(r"[£€]\s?[\d.,]+", l)), "")
        status = L[0] if L[0].strip().lower() in STATUSES else ""
        rest = L[1:] if status else L
        nums = [l for l in rest[2:4] if re.fullmatch(r"\d+|N/A", l)]
        desc = [l for l in rest[2:] if l not in nums and l != price]
        out.append({
            "id": uid[:8], "category": category, "status": status.strip().title() or "For Sale",
            "title": rest[0], "location": rest[1] if len(rest) > 1 else "",
            "beds": int(nums[0]) if nums and nums[0].isdigit() else None,
            "baths": int(nums[1]) if len(nums) > 1 and nums[1].isdigit() else None,
            "priceText": price, "price": parse_price(price), "description": desc,
            "image": f"https://static.wixstatic.com/media/{it['img']}" if it["img"] else None,
        })
    return out


def parse_price(t):
    m = re.search(r"£\s?([\d.,]+)\s*(m)?", t, re.I)
    if not m:
        return None
    n = float(m.group(1).replace(",", ""))
    return int(n * 1_000_000) if m.group(2) else int(n)


if __name__ == "__main__":
    props, seen = [], set()
    for cat, path in PAGES.items():
        for p in parse_listing(get(path), cat):
            if p["id"] not in seen:
                seen.add(p["id"]); props.append(p)
    assert props and all(p["title"] for p in props), "scrape vacío: cambió el HTML de Wix"
    team = [{"name": "Gilberto Franco", "role": "Managing Director", "phone": "07797 718199",
             "office": "01534 727582"},
            {"name": "Joshua Franco", "role": "Negotiator", "office": "01534 727582"}]
    team_html = get("/meet-the-team")
    imgs = re.findall(r'static\.wixstatic\.com/media/([0-9a-z_]+~mv2\.(?:jpe?g|png))', team_html, re.I)
    for t, img in zip(team, list(dict.fromkeys(imgs))[2:]):  # [0] cabecera, [1] logo
        t["photo"] = f"https://static.wixstatic.com/media/{img}"
    import os
    os.makedirs("site/data", exist_ok=True)
    json.dump(props, open("site/data/properties.json", "w"), indent=1, ensure_ascii=False)
    json.dump(team, open("site/data/team.json", "w"), indent=1, ensure_ascii=False)
    print(len(props), "propiedades,", len(team), "agentes")
