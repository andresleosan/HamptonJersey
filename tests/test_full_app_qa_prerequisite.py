"""Proposed QA cursor insert must be idempotent and unable to write with another guard."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/'docs/qa/full-app/publish/prerequisite.sql').read_text()


class PrerequisiteTests(unittest.TestCase):
    def database(self):
        db=sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript((ROOT/'docs/qa/full-app/setup.sql').read_text())
        return db

    def test_initializes_only_queues_and_never_overwrites_progress(self):
        db=self.database()
        db.executescript(SQL)
        self.assertEqual(db.execute('SELECT * FROM notification_cursor').fetchall(),[('queues',0,'','')])
        db.execute("UPDATE notification_cursor SET revision=9,after_key='synthetic-progress'")
        db.executescript(SQL)
        self.assertEqual(db.execute('SELECT revision,after_key FROM notification_cursor').fetchall(),[(9,'synthetic-progress')])

    def test_wrong_or_missing_guard_cannot_insert_even_if_executor_continues(self):
        for guard in ['wrong','missing']:
            with self.subTest(guard=guard):
                db=self.database()
                db.execute("UPDATE qa_app_guard SET database_id='other-database'")
                if guard=='missing':db.execute('DELETE FROM qa_app_guard')
                with self.assertRaises(sqlite3.OperationalError):db.executescript(SQL)
                # Independently executing the insert after an error must still refuse a write.
                db.executescript(SQL[SQL.index('INSERT INTO'):])
                self.assertEqual(db.execute('SELECT COUNT(*) FROM notification_cursor').fetchone(),(0,))


if __name__=='__main__':unittest.main()
