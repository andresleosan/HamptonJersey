#!/usr/bin/env python3
"""Build the D1 import (SQL) and an R2 upload list for the agency property packages
(<dir>/<Agency>/properties.json + photos*.zip). Every listing is created archived and unpublished.

Usage: python3 scripts/import_agencies.py --src DIR --existing live_ids.txt [--out build/agencies]
--existing: one listing id per line (the ids already in D1), so new ids continue after them.
Ids already given to a record_key are kept in <out>/ids.json, so a re-run gives the same ids;
inserts use ON CONFLICT DO NOTHING (panel edits are never overwritten).
"""
import argparse
import glob
import hashlib
import io
import json
import os
import re
import zipfile
from datetime import datetime, timezone

from import_hampton import q, insert

# ponytail: status words seen in the 2026-10-08 packages; anything else falls back to not_stated.
AVAIL = {"available": None, "for sale": "for_sale", "new instruction": "for_sale", "for rent": "to_let",
         "to let": "to_let", "under offer": "under_offer", "under_offer": "under_offer", "sale agreed": "under_offer",
         "sold stc": "under_offer", "sold_stc": "under_offer", "let agreed": "under_offer",
         "let": "withdrawn", "sold": "sold"}
COMMERCIAL_TYPES = {"parking", "retail unit", "retail / commercial units"}
COUNTRY = {"hunts-estates-68": "Barbados", "hunts-estates-1459399": "France"}
# Only GBP/EUR are stored: the USD price is shown in pounds at GBP/USD 1.3199 (8 Oct 2026, Trading Economics).
PRICE = {"hunts-estates-68": {"currency": "GBP", "sale_price": 3410000.0,
                              "price_text": "Approx. £3,410,000 (US$4,500,000)"}}
TENURE = {"freehold": "Freehold", "flying freehold": "Flying Freehold", "share transfer": "Share Transfer"}
# Agencies, their staff and contact details are not repeated on Hampton's listings.
NAMED = re.compile(r"Columbia Estates|Hunts? Estates|huntestates|Gill Hunt|Steven Hunt|David Voak|Red Properties|"
                   r"Prestige Properties|Slomans|Bull and Company|\b0\d{4} ?\d{6}\b|\S+@\S+", re.I)
SOLE = re.compile(r"[,.]?\s*sole (selling |letting )?agents?[.!]?", re.I)
SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“])")
SNIFF = [(b"\xff\xd8\xff", "image/jpeg", "jpg"), (b"\x89PNG", "image/png", "png"), (b"RIFF", "image/webp", "webp")]


def scrub_text(s):
    if not s:
        return None
    s = re.sub(r",? and the agency is acting as sole selling agent", "", s)
    paras = []
    for para in s.split("\n"):
        kept = [x for x in SENTENCE.split(para.strip())
                if x and not NAMED.search(x) and not re.match(r"The agency acts as sole", x)]
        if kept:
            paras.append(" ".join(kept))
    return "\n\n".join(paras) or None


def scrub_lines(items):
    out = []
    for x in items or []:
        x = SOLE.sub("", x).strip(" ,.") if not NAMED.search(x) else ""
        if x:
            out.append(x)
    return "\n".join(out) or None


def availability(p):
    a = AVAIL.get((p.get("status") or "").strip().lower(), "not_stated")
    if a is None:  # "available": sale or let depends on the operation
        a = "to_let" if p["operation"] == "rent" else "for_sale"
    return a


def cap(s, n):
    return s[:n] if isinstance(s, str) else s


def nice_type(t):
    return t if not t or t != t.lower() and t != t.upper() else t.title()


def map_listing(p, lid, ts):
    t = (p.get("type") or "").lower()
    use = p.get("use") or ("commercial" if t in COMMERCIAL_TYPES else "residential")
    country = COUNTRY.get(p["record_key"], "Jersey" if p.get("region") == "jersey" else None)
    specs = [{"group": "", "label": cap(s["label"].strip(), 100), "value": cap(str(s["value"]).strip(), 300)}
             for s in p.get("specs") or [] if s.get("label") and str(s.get("value") or "").strip()
             and not NAMED.search(f"{s['label']} {s['value']}")][:60]
    money = lambda v: float(v) if isinstance(v, (int, float)) and v > 0 else None
    beds = lambda v: int(v) if isinstance(v, (int, float)) and 0 <= v <= 100 else None
    return {
        "id": lid, "use": use, "title": cap(p["title"].strip(), 200), "property_type": cap(nice_type(p.get("type")), 100),
        "operation": p["operation"], "availability": availability(p), "country": country,
        "location": cap(p.get("place"), 200), "road_name": cap(p.get("address"), 200),
        "bedrooms": beds(p.get("beds")), "bathrooms": beds(p.get("baths")),
        "tenure": TENURE.get((p.get("tenure") or "").lower(), p.get("tenure")),
        "sale_price": money(p.get("salePrice")), "rent": money(p.get("rent")),
        "rent_period": p.get("rentPeriod") if p.get("rentPeriod") in ("month", "year") else None,
        "premium": money(p.get("premium")),
        "currency": p.get("currency") if p.get("currency") in ("GBP", "EUR") else None,
        "price_text": cap(p.get("priceText"), 200), "summary": cap(scrub_lines(p.get("summary")), 5000),
        "description": cap(scrub_text(p.get("description")), 20000), "specs": json.dumps(specs),
        **PRICE.get(p["record_key"], {}),
        "published": 0, "archived_at": ts, "created_at": ts, "updated_at": ts, "updated_by": "import",
    }


def make_thumb(data, dst):
    from PIL import Image, ImageFile, ImageOps
    ImageFile.LOAD_TRUNCATED_IMAGES = True  # a few source JPEGs end 2 bytes short; browsers show them fine
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((640, 640))
        im.save(dst, "JPEG", quality=80, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--existing", required=True)
    ap.add_argument("--out", default="build/agencies")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    taken = set(open(a.existing).read().split())
    ids_file = os.path.join(a.out, "ids.json")
    ids = json.load(open(ids_file)) if os.path.exists(ids_file) else {}
    taken |= set(ids.values())
    # Optional hand-edited copy, {listing id: description}, from <out>/rewrite/out-*.json.
    rewrites = {k: v for f in sorted(glob.glob(os.path.join(a.out, "rewrite", "out-*.json")))
                for k, v in json.load(open(f)).items()}
    sql, uploads, n_media, problems = [], [], 0, []

    for pj in sorted(glob.glob(os.path.join(a.src, "*", "properties.json"))):
        folder = os.path.dirname(pj)
        pkg = json.load(open(pj))
        zips = [zipfile.ZipFile(z) for z in sorted(glob.glob(os.path.join(folder, "photos*.zip")))]
        members = {n: z for z in zips for n in z.namelist()}
        for p in pkg["properties"]:
            key = p["record_key"]
            draft = map_listing(p, None, ts)
            if key not in ids:
                prefix = "HE-I" if draft["country"] not in ("Jersey", "United Kingdom") else (
                    "HE-C" if draft["use"] == "commercial" else "HE-R")
                n = max([int(i[len(prefix):]) for i in taken if i.startswith(prefix)] + [0]) + 1
                ids[key] = f"{prefix}{n:03d}"
                taken.add(ids[key])
            lid = ids[key]
            draft["id"] = lid
            draft["description"] = cap(rewrites.get(lid, draft["description"]), 20000)
            media = []
            for pos, img in enumerate(sorted(p["images"], key=lambda i: i["sequence"])):
                name = next((m for m in (img["relative_path"], img["relative_path"].removeprefix("images/"))
                             if m in members), None)
                data = members[name].read(name) if name else None
                if not data or hashlib.sha256(data).hexdigest() != img["sha256"]:
                    problems.append(f"{key}: {img['relative_path']} missing or hash mismatch, skipped")
                    continue
                sniff = next((s for s in SNIFF if data.startswith(s[0])), None)
                if not sniff:
                    problems.append(f"{key}: {img['relative_path']} not JPG/PNG/WebP, skipped")
                    continue
                mid = "U" + hashlib.sha1(f"{key}|{img['sha256']}|{pos}".encode()).hexdigest()[:16]
                r2, thumb = f"uploads/{mid}.{sniff[2]}", f"thumbs/uploads/{mid}.jpg"
                orig_path, thumb_path = os.path.join(a.out, r2), os.path.join(a.out, thumb)
                if not os.path.exists(orig_path):
                    os.makedirs(os.path.dirname(orig_path), exist_ok=True)
                    with open(orig_path, "wb") as fh:
                        fh.write(data)
                if not os.path.exists(thumb_path):
                    make_thumb(data, thumb_path)
                uploads += [(r2, os.path.abspath(orig_path), sniff[1]), (thumb, os.path.abspath(thumb_path), "image/jpeg")]
                media.append({
                    "id": mid, "listing_id": lid, "r2_key": r2, "thumb_key": thumb, "origin": "upload",
                    "kind": "floorplan" if img["kind"] == "floorplan" else "photo",
                    "label": cap(img.get("image_note"), 200), "public": 1, "position": len(media),
                    "content_type": sniff[1], "width": img.get("width"), "height": img.get("height"),
                    "bytes": len(data), "source_url": img.get("source_url"), "provider": pkg["agency"],
                    "rights_status": "user_declared_permission_2026-10-08", "created_at": ts, "created_by": "import",
                })
            draft["cover_media_id"] = next((m["id"] for m in media if m["kind"] == "photo"), None)
            sql.append(insert("listings", draft, "id"))
            sql.extend(insert("media", m, "id") for m in media)
            n_media += len(media)

    json.dump(ids, open(ids_file, "w"), indent=1)
    with open(os.path.join(a.out, "import.sql"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(sql) + "\n")
    with open(os.path.join(a.out, "upload.tsv"), "w", encoding="utf-8") as fh:
        fh.writelines(f"{k}\t{p}\t{t}\n" for k, p, t in uploads)
    print("\n".join(problems))
    print(f"{len(ids)} listings (all archived), {n_media} media, {len(uploads)} objects → {a.out}")


if __name__ == "__main__":
    main()
