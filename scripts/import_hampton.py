#!/usr/bin/env python3
"""Build the D1 import (SQL), thumbnails and an R2 upload list from the Hampton research SQLite.

Usage: python3 scripts/import_hampton.py [--db PATH] [--out DIR]
Safe to re-run: listings and media use ON CONFLICT DO NOTHING (panel edits are never overwritten);
research_* tables are fully replaced. See docs/superpowers/specs/2026-10-07-panel-admin-design.md §5.
"""
import argparse
import os
import sqlite3
import sys
from datetime import date

AVAIL = {"For sale": "for_sale", "Under offer": "under_offer", "Sold": "sold", "To let": "to_let",
         "Lease": "lease", "Not stated": "not_stated"}
PUBLISH = {"for_sale", "under_offer", "to_let", "lease"}
RESIDENTIAL_TYPES = {"House", "Flat", "Apartment", "Apartment Complex", "Bungalow", "Residential"}
RESEARCH = {"properties": "research_properties", "sources": "research_sources", "facts": "research_facts",
            "financial_terms": "research_financial_terms", "issues": "research_issues",
            "search_log": "research_search_log"}
CONTENT_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf"}


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return str(int(v))
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def clean(s):
    s = (s or "").strip() if isinstance(s, str) else s
    return s or None


def num(v):
    return int(v) if v not in (None, "") else None


def price_fields(r):
    """Operation + separate price columns. The README warns raw_numeric_price is sometimes wrong,
    so only asking_amount is used, and only when basis and currency are unambiguous."""
    basis = (r["price_basis"] or "").lower()
    out = {"sale_price": None, "rent": None, "rent_period": None, "premium": None}
    if "sale asking price" in basis:
        op, key = "sale", "sale_price"
    elif basis.startswith("rent per"):
        op, key = "rent", "rent"
        out["rent_period"] = "month" if "month" in basis else "year"
    elif "premium" in basis or "business" in basis:
        op, key = "business", "premium"
    else:  # ambiguous / not stated: keep the text, invent nothing
        op, key = ("rent" if r["availability"] in ("To let", "Lease") else "sale"), None
    text = r["asking_text"] or ""
    cur = r["currency"] or ("GBP" if "£" in text else "EUR" if "€" in text else None)
    amt = r["asking_amount"]
    if key and cur and amt and amt > 0:
        out[key] = float(amt)
    return op, cur, out


def use_of(r):
    if r["collection"] == "commercial":
        return "commercial"
    if r["collection"] == "indexed_legacy" and clean(r["property_type"]) not in RESIDENTIAL_TYPES:
        return "commercial"
    return "residential"


def map_listing(r, tenure, today):
    legacy = r["collection"] == "indexed_legacy"
    avail = "withdrawn" if legacy else AVAIL.get(r["availability"], "not_stated")
    op, cur, prices = price_fields(r)
    stamp = f"{r['research_date'] or today}T00:00:00.000Z"
    return {
        "id": r["property_id"], "use": use_of(r), "title": clean(r["name"]) or r["property_id"],
        "property_type": clean(r["property_type"]), "operation": op, "availability": avail,
        "country": clean(r["country"]), "location": clean(r["location"]), "road_name": clean(r["road_name"]),
        "bedrooms": num(r["bedrooms"]), "bathrooms": num(r["bathrooms"]), "tenure": tenure,
        **prices, "currency": cur, "price_text": clean(r["asking_text"]),
        "summary": clean(r["hampton_summary"]), "description": clean(r["hampton_description"]), "specs": "[]",
        "published": int(r["catalogue_scope"] == "Current requested catalogue" and avail in PUBLISH),
        "archived_at": f"{today}T00:00:00.000Z" if legacy else None,
        "created_at": stamp, "updated_at": stamp, "updated_by": "import",
    }


def media_kind(asset_type, path):
    t, p = (asset_type or "").lower(), (path or "").lower()
    if not p or p.endswith(".pdf"):
        return "document"
    if "floor" in t or "plan" in t:
        return "floorplan"
    return "photo"


def map_media(r, position, today):
    path = clean(r["local_path"])
    origin = "hampton" if r["provider"] == "Hampton Estates" else "external"
    kind = media_kind(r["asset_type"], path)
    ext = os.path.splitext(path)[1].lower() if path else ""
    return {
        "id": r["asset_id"], "listing_id": r["property_id"], "r2_key": path,
        "thumb_key": "thumbs/" + path.split("/", 1)[1] if ext in (".jpg", ".jpeg") else None,
        "origin": origin, "kind": kind, "label": clean(r["label"]),
        "public": int(origin == "hampton" and kind in ("photo", "floorplan") and path is not None),
        "position": position, "content_type": CONTENT_TYPES.get(ext),
        "width": num(r["width"]), "height": num(r["height"]), "bytes": num(r["bytes"]),
        "source_url": clean(r["url"]), "provider": clean(r["provider"]), "rights_status": clean(r["rights_status"]),
        "created_at": f"{today}T00:00:00.000Z", "created_by": "import",
    }


def insert(table, row, key):
    """Never overwrites panel edits (ON CONFLICT DO NOTHING) and never resurrects a listing
    that was deleted for good in the panel (deleted_listings tombstone)."""
    cols = list(row)
    listing_id = row["listing_id"] if table == "media" else row["id"]
    return (f"INSERT INTO {table} ({', '.join(cols)}) SELECT {', '.join(q(row[c]) for c in cols)} "
            f"WHERE NOT EXISTS (SELECT 1 FROM deleted_listings WHERE id = {q(listing_id)}) "
            f"ON CONFLICT({key}) DO NOTHING;")


def make_thumb(src, dst):
    if not os.path.exists(dst):
        from PIL import Image, ImageOps
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((640, 640))
            im.save(dst, "JPEG", quality=80, optimize=True)
    return os.path.abspath(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="/root/Hampton_Database/hampton_properties.sqlite")
    ap.add_argument("--out", default="build/import")
    a = ap.parse_args()
    root = os.path.dirname(os.path.abspath(a.db))
    con = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    today = date.today().isoformat()
    os.makedirs(a.out, exist_ok=True)
    sql, uploads = [], []

    for src, dst in RESEARCH.items():
        sql.append(f"DELETE FROM {dst};")
        for row in con.execute(f"SELECT * FROM {src}"):
            cols = row.keys()
            sql.append(f"INSERT INTO {dst} ({', '.join(cols)}) VALUES ({', '.join(q(row[c]) for c in cols)});")

    tenure = {}
    for f in con.execute("SELECT property_id, value FROM facts WHERE field = 'tenure' ORDER BY origin != 'Hampton', fact_id"):
        tenure.setdefault(f["property_id"], clean(f["value"]))

    listings = {r["property_id"]: map_listing(r, tenure.get(r["property_id"]), today)
                for r in con.execute("SELECT * FROM properties ORDER BY property_id")}

    media, seen, pos = [], set(), {}
    rows = con.execute("SELECT * FROM media ORDER BY property_id, provider != 'Hampton Estates', asset_id")
    for r in rows:
        if r["property_id"] not in listings:
            continue
        m = map_media(r, pos.get(r["property_id"], 0), today)
        pos[r["property_id"]] = m["position"] + 1
        if m["r2_key"]:
            file = os.path.join(root, m["r2_key"])
            if not os.path.isfile(file):
                print(f"warning: missing file {file}; kept as link only", file=sys.stderr)
                m.update(r2_key=None, thumb_key=None, public=0, kind="document")
            elif m["r2_key"] not in seen:
                seen.add(m["r2_key"])
                uploads.append((m["r2_key"], os.path.abspath(file), m["content_type"] or "application/octet-stream"))
                if m["thumb_key"]:
                    uploads.append((m["thumb_key"], make_thumb(file, os.path.join(a.out, m["thumb_key"])), "image/jpeg"))
        media.append(m)

    for l in listings.values():
        l["cover_media_id"] = next((m["id"] for m in media if m["listing_id"] == l["id"] and m["origin"] == "hampton"
                                    and m["kind"] == "photo" and m["r2_key"]), None)
        sql.append(insert("listings", l, "id"))
    sql.extend(insert("media", m, "id") for m in media)

    with open(os.path.join(a.out, "import.sql"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(sql) + "\n")
    with open(os.path.join(a.out, "upload.tsv"), "w", encoding="utf-8") as fh:
        fh.writelines(f"{k}\t{p}\t{t}\n" for k, p, t in uploads)
    published = sum(l["published"] for l in listings.values())
    print(f"{len(listings)} listings ({published} published), {len(media)} media, {len(uploads)} objects → {a.out}")


if __name__ == "__main__":
    main()
