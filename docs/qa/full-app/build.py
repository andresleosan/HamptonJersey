"""Build the proposed QA initialization package locally; never contact Cloudflare."""
import argparse
import hashlib
import json
import sqlite3
import struct
import zlib
from pathlib import Path

BUNDLE = Path(__file__).resolve().parent
ROOT = BUNDLE.parents[2]
QA_ID = "53bc4af9-7250-44fe-8f90-6e415fda1034"
USER = "qa-agent@example.test"
BASE = "(SELECT seeded_at FROM qa_app_guard WHERE id=1)"


class Sql(str):
    """An explicit SQL expression, never external input."""


def literal(value):
    if isinstance(value, Sql):
        return str(value)
    if value is None:
        return "NULL"
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value)


def stamp(days=0, seconds=0):
    return Sql(f"strftime('%Y-%m-%dT%H:%M:%fZ',{BASE},'{days:+d} days','{seconds:+d} seconds')")


def day(offset=0):
    return Sql(f"date({BASE},'{offset:+d} days')")


def png_pattern(index):
    """A deterministic test pattern, with no photograph, text or metadata."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    colors = [(45, 95, 160), (35, 130, 105), (155, 75, 100)]
    color = colors[index - 1]
    rows = []
    for y in range(400):
        row = bytearray(b"\0")
        for x in range(600):
            row.extend(color if (x // 50 + y // 50) % 2 else (230, 235, 240))
        rows.append(row)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 600, 400, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


def build():
    migrations = sorted((ROOT / "migrations").glob("*.sql"))
    if len(migrations) != 37 or migrations[-1].name != "0038_history_related.sql":
        raise ValueError("Migration baseline changed; review the QA package before rebuilding")
    baseline = sqlite3.connect(":memory:")
    try:
        for migration in migrations:
            # Only sqlite_master DDL is exported. All migration data stays in memory.
            baseline.executescript(migration.read_text(encoding="utf8"))
        objects = baseline.execute(
            "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL "
            "AND name NOT LIKE 'sqlite_%' ORDER BY "
            "CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END,name"
        ).fetchall()
    finally:
        baseline.close()

    statements = [
        "-- Proposed initialization of the EMPTY, SEPARATE full-app QA D1 only.",
        "-- Not authorized for remote execution. Never use this against the business or History D1.",
        "-- A second import is intentionally rejected; inspect remote state after any uncertain result.",
        "-- No migration rows, identities, listings, URLs or other data are copied from the business.",
        "-- First executable statement fails BEFORE any write if a non-internal object exists.",
        "SELECT json(CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_%' AND name <> '_cf_KV') "
        "THEN '{}' ELSE 'QA initialization requires an empty database' END);",
        *[sql + ";" for _, _, sql in objects],
        "CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, "
        "applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);",
        "CREATE TABLE qa_app_guard(id INTEGER PRIMARY KEY CHECK(id=1),marker TEXT NOT NULL,"
        "database_id TEXT NOT NULL,fixture_version INTEGER NOT NULL,seeded_at TEXT NOT NULL,fixture_day TEXT NOT NULL);",
        "INSERT INTO qa_app_guard VALUES(1,'hampton-app-qa-v1','" + QA_ID + "',1,"
        "strftime('%Y-%m-%dT%H:%M:%fZ','now'),date('now'));",
    ]

    def insert(table, **values):
        columns = ",".join('"' + key + '"' for key in values)
        statements.append(f'INSERT INTO "{table}"({columns}) VALUES(' +
                          ",".join(literal(value) for value in values.values()) + ");")

    def audit(**values):
        return dict(created_at=stamp(-7), updated_at=stamp(), updated_by=USER, **values)

    for i, migration in enumerate(migrations, 1):
        insert("d1_migrations", id=i, name=migration.name, applied_at=Sql(BASE))
    insert("admins", email=USER, name="QA Agent", added_by="system", added_at=stamp())
    for key, value in {
        "email": {"enabled": False, "summary": False, "recipients": [], "revision": 1,
                  "approved_by": None, "approved_at": None},
        "outbound": {"paused": True},
        "automations": {"listing_text": False},
    }.items():
        insert("app_settings", key=key, value=value, updated_at=stamp(), updated_by=USER)
    hours = {d: ["09:00", "17:00"] for d in ["mon", "tue", "wed", "thu", "fri"]}
    for i in [1, 2]:
        insert("negotiators", id=i, name=f"QA Negotiator {i:02}", role="QA fixture", active=i == 1,
               hours=hours, **audit())
    insert("negotiator_exceptions", id=1, negotiator_id=1, date=day(2), kind="block",
           note="QA blocked day", created_at=stamp(), created_by=USER)

    listings = [
        ("HE-Q001", "residential", "sale", "for_sale", True),
        ("HE-Q002", "residential", "rent", "to_let", True),
        ("HE-Q003", "commercial", "business", "lease", True),
        ("HE-Q004", "residential", "sale", "for_sale", False),
        ("HE-Q005", "residential", "sale", "withdrawn", False),
        ("HE-Q006", "residential", "sale", "under_offer", True),
        ("HE-Q007", "residential", "sale", "for_sale", False),
    ]
    for i, (listing_id, use, operation, availability, published) in enumerate(listings, 1):
        extra = {"archived_at": stamp(-1)} if listing_id == "HE-Q005" else {}
        if listing_id == "HE-Q007":
            extra.update(review_requested_at=stamp(), review_requested_by=USER)
        insert("listings", id=listing_id, use=use, operation=operation, availability=availability,
               title=f"QA Fictional Property {i:03}", property_type="house" if use == "residential" else "shop",
               country="Jersey", location=f"QA location {i:02}", road_name=f"QA test road {i:02}",
               parish="St Helier", bedrooms=3 if use == "residential" else None, bathrooms=2,
               sale_price=420000 if listing_id == "HE-Q006" else 500000 if operation == "sale" else None,
               rent=2000 if operation != "sale" else None, rent_period="month" if operation != "sale" else None,
               currency="GBP", summary="Exclusively fictional QA property.", description="Generated QA fixture; no real property.",
               published=published, matchable=published, confirmed_at=stamp(-120 if i == 1 else -1),
               published_at=stamp(-7) if published else None, specs=[], feat_type="house" if use == "residential" else None,
               feat_pets="yes", feat_parking=1, feat_furnished="no", feat_outdoor=["garden"],
               cover_media_id="QAM00001" if listing_id == "HE-Q001" else None, **audit(), **extra)
    insert("deleted_listings", id="HE-Q008", deleted_at=stamp(-1), deleted_by=USER)

    media = []
    assets = {}
    for i in [1, 2, 3]:
        filename = f"media/qa-pattern-{i:02}.png"
        data = png_pattern(i)
        assets[filename] = data
        key = f"qa/full-app-v1/qa-pattern-{i:02}.png"
        media.append({"file": filename, "r2_key": key, "sha256": hashlib.sha256(data).hexdigest(),
                      "bytes": len(data), "content_type": "image/png"})
        insert("media", id=f"QAM{i:05}", listing_id="HE-Q001" if i < 3 else "HE-Q004",
               r2_key=key, thumb_key=key, origin="upload", kind="photo" if i < 3 else "floorplan",
               label=f"QA generated test pattern {i}", public=i < 3, position=i, content_type="image/png",
               width=600, height=400, bytes=len(data), rights_status="owned", created_at=stamp(-7), created_by=USER)
    insert("tours", id=1, title="QA unpublished tour placeholder", url="https://tour.example.test/qa-001",
           caption="Non-network fixture placeholder; external integration remains untested.",
           published=False, position=1, created_at=stamp(), updated_at=stamp())

    for i in range(1, 5):
        insert("contacts", id=i, name=f"QA Contact {i:02}", email=f"contact-{i:02}@example.test",
               preferred_channel="email", privacy_ack_at=stamp(-7), consent_source="web",
               last_activity_at=stamp(), last_contact_at=stamp(-1), **audit())
        extra = {}
        if i == 3:
            extra.update(search_category="commercial", search_operation="transfer", commercial_kind="both")
        if i == 4:
            extra.update(search_state="resolved", resolved_at=stamp(-1), resolved_by=USER,
                         resolution_reason="QA completed scenario")
        insert("applicants", id=i, contact_id=i, operation="rent" if i in [2, 3] else "buy",
               stage="completed" if i == 4 else "searching", source="web", assigned_to=USER,
               budget_min=1000 if i in [2, 3] else 300000, budget_max=2500 if i in [2, 3] else 600000,
               property_types=["flat"] if i == 2 else ["house"], bedrooms_min=2,
               parishes_wanted=["St Helier"], parishes_excluded=[], requirements="QA fictional requirements",
               **audit(), **extra)
    for i, listing, status, offset in [(1, "HE-Q001", "requested", 7), (2, "HE-Q002", "confirmed", 8),
                                       (3, "HE-Q006", "completed", -2)]:
        insert("viewing_requests", id=i, listing_id=listing, listing_ref=listing,
               listing_title_snapshot=f"QA property {listing}", agent="QA Negotiator 01", kind="In person",
               date=day(offset), time="10:00", end_time="10:30", name=f"QA Visitor {i:02}",
               email=f"visitor-{i:02}@example.test", status=status, negotiator_id=1,
               outcome="proceed" if status == "completed" else None, **audit())
    for i, applicant, listing, status in [(1, 1, "HE-Q001", "shortlisted"), (2, 2, "HE-Q002", "found"),
                                          (3, 1, "HE-Q006", "shortlisted")]:
        insert("matches", id=i, applicant_id=applicant, listing_id=listing, score=85, checks=[], status=status,
               reviewed_by=USER if status == "shortlisted" else None,
               reviewed_at=stamp(-1) if status == "shortlisted" else None,
               created_at=stamp(-3), updated_at=stamp())
    for i, listing, applicant, amount, status in [(1, "HE-Q006", 1, 420000, "accepted"),
                                                 (2, "HE-Q001", 4, 500000, "pending")]:
        insert("offers", id=i, listing_id=listing, applicant_id=applicant, amount=amount,
               status=status, conditions="QA fixture only", created_by=USER, **audit())
    insert("sales", id=1, listing_id="HE-Q006", applicant_id=1, offer_id=1, price=420000,
           route="freehold", seller_name="QA Seller 01", seller_email="seller-01@example.test",
           target_date=day(30), fee=10000, notes="Fictional QA transaction", created_by=USER, **audit())
    for key in ["lawyers", "due_diligence", "questionnaire", "searches", "mortgage", "contract", "funds", "passing", "settled"]:
        insert("sale_milestones", sale_id=1, key=key, planned_on=day(14), note="QA milestone")

    insert("landlords", id=1, name="QA Landlord 01", email="landlord-01@example.test",
           approval_limit=500, created_by=USER, **audit())
    for i in [1, 2]:
        insert("rentals", id=i, landlord_id=1, address=f"QA fictional rental {i:02}", parish="St Helier",
               service="full" if i == 1 else "let_only", fee_percent=10 if i == 1 else None,
               has_gas=i == 1, created_by=USER, **audit())
        insert("tenancies", id=i, rental_id=i, payment_ref=f"HE-T{i:04}",
               tenant_name=f"QA Tenant {i:02}", tenant_email=f"tenant-{i:02}@example.test",
               kind="fixed" if i == 1 else "periodic", regime="2025" if i == 1 else "2011",
               start_on=day(-90), end_on=day(270) if i == 1 else None, rent=1600 if i == 1 else 1800,
               last_rent_change_on=Sql(f"date({BASE},'start of month','+2 months')") if i == 1 else None,
               due_day=1, deposit=1500, deposit_ref=f"QA-DEPOSIT-{i:02}",
               collect_from=Sql(f"date({BASE},'start of month','-1 month')") if i == 1 else None,
               opening_balance=0, created_by=USER, **audit())
        insert("rent_changes", tenancy_id=i, effective_on=day(-90), rent=1500 if i == 1 else 1800,
               created_at=stamp(), created_by=USER)
    for i, offset in enumerate([-1, 0, 1], 1):
        insert("charges", id=i, tenancy_id=1, due_on=Sql(f"date({BASE},'start of month','{offset:+d} months')"),
               amount=150000, kind="rent")
    for i, tenancy, amount in [(1, 1, 150000), (2, None, 30000)]:
        insert("payments", id=i, tenancy_id=tenancy, received_on=day(-3), amount=amount, kind="rent",
               source="manual", description=f"QA payment {i}", created_at=stamp(-3), created_by=USER)
    insert("rent_changes", tenancy_id=1, effective_on=Sql(f"date({BASE},'start of month','+2 months')"),
           rent=1600, created_at=stamp(), created_by=USER)
    for kind, expiry in [("eicr", 90), ("gas", -1)]:
        insert("compliance_items", rental_id=1, kind=kind, done_on=day(-365), expires_on=day(expiry),
               note="QA compliance fixture", updated_at=stamp(), updated_by=USER)
    insert("repairs", id=1, rental_id=1, tenancy_id=1, title="QA fictional repair", detail="Generated QA case",
           urgency="routine", status="reported", quote=200, created_by=USER, **audit())
    insert("rental_events", id=1, rental_id=1, tenancy_id=1, at=stamp(-1), actor=USER,
           type="payment.recorded", data={"payment_id": 1})

    for listing, *_ in listings:
        insert("events", at=stamp(-7), actor=USER, entity_type="listing", entity_id=listing,
               type="listing.created", data={"version": 1, "revision": 1, "source": "panel", "fields": []})
    for i in range(1, 61):
        insert("events", at=stamp(-2, i * 60), actor=USER, entity_type="listing", entity_id="HE-Q001",
               type="listing.updated", data={"version": 1, "revision": i + 1, "source": "panel",
               "fields": ["bedrooms"], "before": {"bedrooms": 3 if i % 2 else 2},
               "after": {"bedrooms": 2 if i % 2 else 3}, "derived_fields": [], "related": {}})
    for entity, entity_id, kind, data in [
        ("applicant", "1", "match.reviewed", {"listing_id": "HE-Q001", "from": "found", "to": "shortlisted"}),
        ("viewing", "1", "viewing.requested", {"listing_id": "HE-Q001"}),
        ("applicant", "4", "offer.recorded", {"listing_id": "HE-Q001", "offer_id": 2}),
    ]:
        insert("events", at=stamp(-1), actor=USER, entity_type=entity, entity_id=entity_id, type=kind, data=data)
    insert("events", at=stamp(-1), actor=USER, entity_type="applicant", entity_id="1", type="sale.milestone",
           data=Sql("json_object('listing_id','HE-Q006','sale_id',1,'key','passing','after',json_object('planned_on'," + day(14) + "))"))
    insert("events", at=stamp(), actor=USER, entity_type="admin", entity_id="qa-checklist", type="qa.task.created", data={"version": 1})
    insert("notifications", event_id=Sql("(SELECT id FROM events WHERE type='qa.task.created')"),
           category="task", title="QA follow-up task", action_required=True, created_at=stamp(),
           task_key="manual:qa-checklist", assigned_to=USER, due_at=stamp(3), task_reason="QA review fixture",
           urgency="normal", target_kind="listing", target_id="HE-Q004")
    for i, status in [(1, "answered"), (2, "waiting")]:
        insert("chats", id=i, key_hash=hashlib.sha256(f"qa-chat-fixture-{i}".encode()).hexdigest(),
               status=status, listing_id="HE-Q001", name=f"QA Chat Visitor {i:02}", email=f"chat-{i:02}@example.test",
               privacy_ack_at=stamp(), created_at=stamp(), last_at=stamp(),
               waiting_since=stamp() if status == "waiting" else None)
        insert("chat_messages", id=i, chat_id=i, role="visitor", text="QA fictional enquiry", created_at=stamp())
    insert("chat_messages", id=3, chat_id=1, role="team", sent_by=USER, text="QA fictional reply", created_at=stamp())
    recipient = "recipient@example.test"
    insert("outbound", id=1, ref="QA-OUT-001", dedupe_key="qa-draft-001", template="qa_fixture", entity_id="1",
           version=1, recipient=recipient, recipient_hash=hashlib.sha256(recipient.encode()).hexdigest(),
           subject="QA unsent draft", text="Fictional QA draft. Never approved for real sending.", status="draft",
           created_at=stamp(), updated_at=stamp())
    insert("email_inbound", id=1, dedupe_key="qa-inbound-001", sender="visitor@example.test", header_from="visitor@example.test",
           recipient="team@example.test", subject="QA received fixture", text="Synthetic inbound message; no real delivery.",
           html_only=False, truncated=False, message_id="qa-inbound-001@example.test", received_at=stamp())
    insert("jobs", id=1, kind="listing_text", listing_id="HE-Q004", status="draft", result={"summary": "QA fictional draft"},
           requested_by=USER, created_at=stamp(), drafted_at=stamp())
    insert("drive_imports", id=1, folder_id="QA_FOLDER_000001", folder_name="QA import fixture", status="failed",
           note="Fictional failure case; no Drive credential or network request.", error="QA provider simulation pending",
           requested_by=USER, created_at=stamp())
    for metric, n in [("view", 12), ("photos", 3), ("tour", 0)]:
        insert("daily_stats", day=day(-1), listing_id="HE-Q001", metric=metric, n=n)
    insert("advertisers", id=1, name="QA Agency 01", kind="agency",
           details={"email": "agency@example.test", "website": "https://agency.example.test"}, activity_on=day(), **audit())
    insert("advertiser_reviews", id=1, advertiser_id=1, action="activity", reason="QA fictitious review", on_date=day(),
           actor=USER, created_at=stamp())
    insert("research_properties", property_id="QA-RESEARCH-001", hampton_record_id="HE-Q001", name="QA Fictional Property 001",
           collection="QA fixture", country="Jersey", location="QA location 01", property_type="house", bedrooms=3,
           hampton_source_url="https://source.example.test/qa-001", match_status="matched", research_date=day())
    insert("research_sources", source_id="QA-SOURCE-001", property_id="QA-RESEARCH-001", origin="qa_fixture",
           title="QA source fixture", url="https://source.example.test/qa-001", accessed_on=day(), summary="Fictional source")
    insert("research_facts", fact_id="QA-FACT-001", property_id="QA-RESEARCH-001", source_id="QA-SOURCE-001",
           origin="qa_fixture", field="bedrooms", value="3", confidence="high", context="QA fixture")
    insert("research_financial_terms", term_id="QA-TERM-001", property_id="QA-RESEARCH-001", source_id="QA-SOURCE-001",
           term_type="asking", amount=500000, currency="GBP", notes="QA synthetic amount", source_url="https://source.example.test/qa-001")
    insert("research_issues", issue_id="QA-ISSUE-001", property_ids='["QA-RESEARCH-001"]', field="fixture",
           severity="low", issue="QA test issue", evidence="QA fixture", source_urls='["https://source.example.test/qa-001"]')
    insert("research_search_log", search_id="QA-SEARCH-001", property_id="QA-RESEARCH-001", date=day(),
           query="QA fixture lookup", engine="qa_stub", outcome="No network request")
    week = f"date({BASE},'weekday 1','-14 days')"
    insert("weekly_insights", week_start=Sql(week), week_until=Sql(f"date({week},'+7 days')"), generated_at=stamp(),
           payload=Sql("json_object('version',1,'period',json_object('days',7,'from'," + week + ",'to',date(" + week +
                       ",'+6 days')),'generated_at'," + BASE + ",'totals',json_object('views',12,'viewing_requests',3,"
                       "'new_applicants',4,'viewings_completed',1),'most_viewed',json('[]'),'coverage',json_object('first_day'," + day(-30) + "))"))
    sql = ("\n\n".join(statements) + "\n").encode("utf8")
    check = sqlite3.connect(":memory:")
    try:
        check.execute("PRAGMA foreign_keys=ON")
        check.executescript(sql.decode("utf8"))
        if check.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("QA package has broken foreign keys")
        counts = {t: check.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0] for (t,) in
                  check.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")}
    finally:
        check.close()
    manifest = {
        "fixture_version": 1, "source_commit": "80ad03df7e095750f455aa4aa668573e9aac5db4",
        "destination": {"project": "hamptonjersey-qa", "environment": "production", "database_name": "hampton-app-qa",
                        "database_id": QA_ID, "import_binding": "APP_QA_DB", "application_binding": "DB"},
        "remote_import_authorized": False, "remote_import_performed": False,
        "sql": {"file": "setup.sql", "sha256": hashlib.sha256(sql).hexdigest(), "bytes": len(sql), "encoding": "UTF-8", "line_endings": "LF"},
        "migrations": [{"name": p.name, "canonical_lf_sha256": hashlib.sha256(p.read_text(encoding="utf8").encode()).hexdigest()} for p in migrations],
        "schema_objects": {kind: sum(t == kind for t, _, _ in objects) for kind in ["table", "index", "view", "trigger"]},
        "expected_table_counts": counts, "test_user": {"email": USER, "name": "QA Agent", "table": "admins", "scope": "QA D1 only", "google_account": False},
        "dates": "Relative to qa_app_guard.seeded_at, recorded once at import (UTC); no stored business dates",
        "media_bucket": "hampton-app-qa-media", "media_objects": media, "media_uploaded": False,
        "sending_enabled": False, "queued_jobs": 0, "other_migration_data_copied": False,
        "import_policy": "Empty database only. Not idempotent. Read remote state before retry after any uncertainty.",
        "functional_application_smoke": False,
    }
    return {"setup.sql": sql, "manifest.json": (json.dumps(manifest, indent=2, ensure_ascii=True) + "\n").encode(), **assets}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check the proposed files without rewriting them")
    args = parser.parse_args()
    outputs = build()
    if args.check:
        if any(not (BUNDLE / name).is_file() or (BUNDLE / name).read_bytes() != data for name, data in outputs.items()):
            raise SystemExit("QA package differs from the reproducible build; review before import")
        print("FULL_APP_QA_PACKAGE_REPRODUCIBLE=PASS")
    else:
        for name, data in outputs.items():
            (BUNDLE / name).parent.mkdir(parents=True, exist_ok=True)
            (BUNDLE / name).write_bytes(data)
        print("FULL_APP_QA_PACKAGE_BUILT_LOCALLY=True; no network or remote writes")


if __name__ == "__main__":
    main()
