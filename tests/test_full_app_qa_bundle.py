"""Black-box checks of the SQL proposed for the separate full-app QA database."""
import hashlib
import json
import re
import sqlite3
import struct
import subprocess
import sys
import unittest
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "docs/qa/full-app"
QA_ID = "53bc4af9-7250-44fe-8f90-6e415fda1034"
QA_USER = "qa-agent@example.test"


def schema(connection):
    return connection.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL "
        "AND name NOT LIKE 'sqlite_%' AND name NOT IN ('qa_app_guard','d1_migrations') "
        "ORDER BY type,name"
    ).fetchall()


class FullAppQaBundleTests(unittest.TestCase):
    def sql(self):
        self.assertTrue((BUNDLE / "setup.sql").is_file(), "QA setup.sql must be prepared")
        return (BUNDLE / "setup.sql").read_text(encoding="utf8")

    def database(self):
        connection = sqlite3.connect(":memory:")
        connection.execute("PRAGMA foreign_keys=ON")
        connection.executescript(self.sql())
        self.addCleanup(connection.close)
        return connection

    def test_schema_matches_all_37_migrations(self):
        actual = self.database()
        expected = sqlite3.connect(":memory:")
        self.addCleanup(expected.close)
        migrations = sorted((ROOT / "migrations").glob("*.sql"))
        self.assertEqual(len(migrations), 37)
        for path in migrations:
            expected.executescript(path.read_text(encoding="utf8"))
        self.assertEqual(schema(actual), schema(expected))
        self.assertEqual([r[0] for r in actual.execute("SELECT name FROM d1_migrations ORDER BY name")],
                         [p.name for p in migrations])

    def test_identity_privacy_and_guard(self):
        connection = self.database()
        self.assertEqual(connection.execute("SELECT email,name FROM admins").fetchall(),
                         [(QA_USER, "QA Agent")])
        self.assertEqual(connection.execute("SELECT marker,database_id FROM qa_app_guard WHERE id=1").fetchone(),
                         ("hampton-app-qa-v1", QA_ID))
        self.assertEqual(connection.execute("SELECT count(*) FROM sqlite_master WHERE name='qa_history_guard'").fetchone()[0], 0)
        for (table,) in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
            columns = [r[1] for r in connection.execute(f'PRAGMA table_info("{table}")')]
            for row in connection.execute(f'SELECT * FROM "{table}"'):
                for column, value in zip(columns, row):
                    if "phone" in column:
                        self.assertIsNone(value, f"No dialable QA phone in {table}.{column}")
                    if not isinstance(value, str):
                        continue
                    emails = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+", value)
                    self.assertTrue(all(e.endswith(".test") for e in emails), f"Non-test email in {table}.{column}")
                    for url in re.findall(r"https?://[^\s\"'<>]+", value):
                        self.assertTrue((urlparse(url).hostname or "").endswith(".test"), f"External URL in {table}.{column}")
        self.assertTrue(all(n.startswith("QA ") for (n,) in connection.execute("SELECT name FROM negotiators")))

    def test_integrity_and_core_workflow_links(self):
        connection = self.database()
        self.assertEqual(connection.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
        self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
        for table in ["contacts", "applicants", "viewing_requests", "matches", "offers", "sales", "rentals",
                      "tenancies", "payments", "repairs", "notifications", "chats", "outbound", "drive_imports"]:
            self.assertGreater(connection.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0], 0, table)
        self.assertEqual(connection.execute("SELECT count(*) FROM sales s JOIN offers o ON s.offer_id=o.id "
                                            "AND s.listing_id=o.listing_id AND s.applicant_id=o.applicant_id").fetchone()[0], 1)
        self.assertGreaterEqual(connection.execute("SELECT count(*) FROM events WHERE entity_type='listing' AND entity_id='HE-Q001'").fetchone()[0], 60)
        self.assertGreater(connection.execute("SELECT count(*) FROM history_viewing_events").fetchone()[0], 0)
        self.assertGreater(connection.execute("SELECT count(*) FROM listings WHERE published=0 AND archived_at IS NULL").fetchone()[0], 0)
        self.assertGreater(connection.execute("SELECT count(*) FROM listings WHERE archived_at IS NOT NULL").fetchone()[0], 0)

    def test_sending_and_background_work_start_disabled(self):
        connection = self.database()
        settings = {k: json.loads(v) for k, v in connection.execute("SELECT key,value FROM app_settings")}
        self.assertFalse(settings["email"]["enabled"])
        self.assertFalse(settings["email"]["summary"])
        self.assertEqual(settings["email"]["recipients"], [])
        self.assertTrue(settings["outbound"]["paused"])
        self.assertEqual(connection.execute("SELECT count(*) FROM outbound WHERE status IN ('queued','sending')").fetchone()[0], 0)
        self.assertEqual(connection.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','working')").fetchone()[0], 0)

    def test_rental_money_units_and_collection_schedule(self):
        connection = self.database()
        self.assertEqual(connection.execute("SELECT count(*) FROM tenancies t JOIN rentals r ON r.id=t.rental_id "
                                            "WHERE r.service='let_only' AND (t.collect_from IS NOT NULL OR "
                                            "EXISTS(SELECT 1 FROM charges c WHERE c.tenancy_id=t.id))").fetchone()[0], 0)
        self.assertEqual(connection.execute("SELECT count(*) FROM charges c WHERE c.kind='rent' AND c.amount <> "
                                            "100*(SELECT rent FROM rent_changes h WHERE h.tenancy_id=c.tenancy_id "
                                            "AND h.effective_on<=c.due_on ORDER BY h.effective_on DESC LIMIT 1)").fetchone()[0], 0)
        self.assertEqual(connection.execute("SELECT amount FROM payments WHERE id=1").fetchone()[0], 150000)
        self.assertEqual(connection.execute("SELECT count(*) FROM rent_changes h JOIN tenancies t "
                                            "ON h.tenancy_id=t.id AND h.effective_on=t.start_on").fetchone()[0], 2)
        self.assertEqual(connection.execute("SELECT count(*) FROM charges WHERE tenancy_id=1 AND substr(due_on,9,2)='01'").fetchone()[0], 3)
        self.assertEqual(connection.execute("SELECT count(*) FROM tenancies t WHERE t.rent <> "
                                            "(SELECT rent FROM rent_changes h WHERE h.tenancy_id=t.id "
                                            "ORDER BY h.effective_on DESC LIMIT 1)").fetchone()[0], 0)

    def test_nonempty_database_is_rejected_before_any_change(self):
        connection = sqlite3.connect(":memory:")
        self.addCleanup(connection.close)
        connection.executescript("CREATE TABLE unrelated(value TEXT); INSERT INTO unrelated VALUES('keep');")
        before = list(connection.iterdump())
        with self.assertRaises(sqlite3.Error):
            connection.executescript(self.sql())
        self.assertEqual(list(connection.iterdump()), before)

    def test_second_import_is_rejected_without_changes(self):
        connection = self.database()
        before = list(connection.iterdump())
        with self.assertRaises(sqlite3.Error):
            connection.executescript(self.sql())
        self.assertEqual(list(connection.iterdump()), before)

    def test_schema_triggers_and_foreign_keys_are_active(self):
        connection = self.database()
        connection.execute("INSERT INTO events(at,actor,entity_type,entity_id,type,data) "
                           "SELECT seeded_at,'system','viewing','1','viewing.confirmed','{}' FROM qa_app_guard")
        event_id = connection.execute("SELECT max(id) FROM events").fetchone()[0]
        self.assertEqual(connection.execute("SELECT listing_id FROM history_viewing_events WHERE event_id=?", (event_id,)).fetchone(), ("HE-Q001",))
        with self.assertRaises(sqlite3.IntegrityError):
            connection.execute("INSERT INTO applicants(contact_id,operation,source,created_at,updated_at) "
                               "VALUES(999999,'buy','web','2026-01-01','2026-01-01')")

    def test_sql_hash_line_endings_and_media_manifest(self):
        self.sql()
        manifest = json.loads((BUNDLE / "manifest.json").read_text(encoding="utf8"))
        raw = (BUNDLE / "setup.sql").read_bytes()
        self.assertNotIn(b"\r", raw)
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"))
        self.assertEqual(hashlib.sha256(raw).hexdigest(), manifest["sql"]["sha256"])
        self.assertEqual(manifest["destination"]["database_id"], QA_ID)
        self.assertFalse(manifest["remote_import_authorized"])
        connection = self.database()
        for item in manifest["media_objects"]:
            image = (BUNDLE / item["file"]).read_bytes()
            self.assertEqual(image[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", image[16:24]), (600, 400))
            self.assertEqual(hashlib.sha256(image).hexdigest(), item["sha256"])
            self.assertEqual(connection.execute("SELECT bytes FROM media WHERE r2_key=?", (item["r2_key"],)).fetchone(), (len(image),))

    def test_generator_reproduces_the_proposed_bytes(self):
        self.sql()
        result = subprocess.run([sys.executable, str(BUNDLE / "build.py"), "--check"],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, "Generator must reproduce the proposed package")


if __name__ == "__main__":
    unittest.main()
