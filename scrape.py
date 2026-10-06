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


def parse_listing(src, category, page=""):
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
            "sourceUrl": BASE + page,
        })
    return out


def parse_price(t):
    """Primer importe del texto, en su moneda: '£4.75m' -> (4750000, 'GBP'); sin importe -> (None, None)."""
    m = re.search(r"([£€])\s?([\d.,]+)\s*(m\b)?", t, re.I)
    if not m:
        return None, None
    n = float(m.group(2).replace(",", ""))
    return (int(n * 1_000_000) if m.group(3) else int(n)), {"£": "GBP", "€": "EUR"}[m.group(1)]


# Revisión manual de cada anuncio (geografía / tipo / operación / precio). Lo que no figura aquí se
# clasifica por heurística y queda marcado para revisar. Nada de esto inventa precios ni conversiones.
CURATION = {
    "1fa44cf0": {"region": "international", "place": "Alentejo, Portugal"},
    "7eefaf13": {"region": "international", "place": "Galicia, Spain"},
    "9a8bdd7c": {"region": "international", "place": "Brittany, France", "type": "Manor house"},
    "c320d961": {"region": "international", "place": "Madeira, Portugal", "type": "Apartment",
                 "notes": ["Priced in euros. The listing also quotes £99,999; no conversion is made here."]},
    "defec230": {"region": "international", "place": "Brittany, France", "type": "House"},
    "edb3681e": {"region": "international", "place": "Lourinhã, Portugal", "type": "Villa"},
    "f5c45914": {"region": "international", "place": "Brittany, France"},
    "d8dacb1f": {"type": "House"},
    "8c37b8d1": {"type": "Hotel", "use": "commercial"},
    "cb6f6543": {"type": "House"},
    "38b1444c": {"type": "Apartment"},
    "743d6ad4": {"type": "Guest house", "use": "commercial"},
    "ff11c070": {"type": "Apartment"},
    "b1b43893": {"type": "Four apartments"},
    "d1ca2d7c": {"type": "House"},
    "7df76a63": {"type": "Apartment"},
    "3ce6b5b2": {"type": "Apartment"},
    "d5967950": {"type": "Cottage"},
    "a23f0989": {"type": "House"},
    "f2eb59e7": {"type": "Four apartments", "duplicateOf": "b1b43893",
                 "notes": ["Same photo, price and text as 25 Roseville Street; hidden as a likely duplicate."]},
    "41b0dabe": {"type": "House"},
    "ce7687c1": {"type": "House", "notes": ["The description mentions 4/5 bedrooms; the listing field says 5."]},
    "a52a7206": {"type": "Apartment", "place": "St Helier"},
    "8c8bf11a": {"type": "Bungalow"},
    "91c754ff": {"region": "uk", "place": "Streatham, London",
                 "notes": ["Listed in Hampton's residential section, but the property is in London, not Jersey."]},
    "8eb8ffab": {"type": "House", "notes": ["No price published on the source listing."]},
    "9c0f9d02": {"type": "House", "place": "St Lawrence", "notes": ["Source spells the parish 'St Lawerence'."]},
    "636168b1": {"type": "Café with accommodation", "place": "Location confidential",
                 "notes": ["Location withheld and price 'Negotiable'; tenure (freehold or business only) not stated."]},
    "6692ab51": {"type": "Shop (newsagent)", "operation": "rent", "place": "St Helier",
                 "notes": ["Source status is 'Lease' with no rent or premium published; "
                           "'Negotiable' appears where the location normally is."]},
    "cc99defd": {"type": "Restaurant", "operation": "business", "place": "Halkett Street, St Helier",
                 "notes": ["£90,000 appears to be for the business on a 9-year lease, not the freehold."]},
    "758f504e": {"type": "Restaurant", "operation": "business", "place": "Kensington",
                 "notes": ["Price basis (business, lease or freehold) not stated. Source spells the location 'Kensignton'."]},
    "594966f9": {"type": "Restaurant", "place": "Town (St Helier)",
                 "notes": ["Source says 'Freehold/Share Transfer'; the sale may be structured as a share transfer."]},
    "9a7d10a6": {"type": "Apartment block"},
}


def classify(p, retrieved):
    """Separa geografía, tipo y operación; precio de venta / renta / traspaso en campos distintos."""
    c = CURATION.get(p["id"], {})
    text = " ".join([p["status"], p["priceText"], *p["description"]])
    amount, currency = parse_price(p["priceText"])
    op = c.get("operation") or ("rent" if re.search(r"\blet\b|\blease\b", p["status"], re.I) else "sale")
    period = (("month" if re.search(r"month|pcm|\bpm\b|\dpm", p["priceText"], re.I) else
               "year" if re.search(r"p\.?a\.?\b|annum", p["priceText"], re.I) else None)
              if op == "rent" and amount else None)
    out = {
        "id": p["id"], "title": p["title"], "status": p["status"],
        "region": c.get("region") or ("international" if p["category"] == "international" else "jersey"),
        "place": c.get("place") or p["location"],
        "type": c.get("type"),
        "use": c.get("use") or ("commercial" if p["category"] == "commercial" else "residential"),
        "operation": op,
        "currency": currency,
        "salePrice": amount if op == "sale" else None,
        "rent": amount if op == "rent" and period else None,
        "rentPeriod": period,
        "premium": amount if op == "business" else None,
        "priceText": p["priceText"], "beds": p["beds"], "baths": p["baths"],
        "tenure": "Freehold" if re.search(r"freehold", text, re.I) else None,
        "description": p["description"], "image": p["image"],
        "public": bool(p["image"]) and not c.get("duplicateOf"),
        "source": {"page": p["category"], "url": p["sourceUrl"], "location": p["location"], "retrieved": retrieved},
        "notes": list(c.get("notes", [])) if c else ["Classified automatically; review region, type and operation."],
    }
    if op == "rent" and amount and not period:
        out["notes"].append("Rent amount published without a period; not used for comparisons.")
    return out


if __name__ == "__main__":
    import datetime
    today = datetime.date.today().isoformat()
    props, seen = [], set()
    for cat, path in PAGES.items():
        for p in parse_listing(get(path), cat, path):
            if p["id"] not in seen:
                seen.add(p["id"]); props.append(classify(p, today))
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
