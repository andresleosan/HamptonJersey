import os, sqlite3, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import import_hampton as ih

TODAY = "2026-10-07"

def prop(**kw):
    base = dict(property_id="HE-R001", collection="residential", catalogue_scope="Current requested catalogue",
                availability="For sale", price_basis="Sale asking price", asking_amount=779000.0, currency="GBP",
                asking_text="£779,000", name=" Le Bernage ", property_type="House\n", country="Jersey",
                location="St Saviour", road_name="", bedrooms=3.0, bathrooms=1.0, hampton_summary="A\nB\n\n",
                hampton_description="Desc", research_date="2026-10-05")
    base.update(kw)
    return base

def asset(**kw):
    base = dict(asset_id="A00001", property_id="HE-R001", asset_type="photo", local_path="media/hampton/x.jpg",
                provider="Hampton Estates", label="Kitchen.png", url="https://static.wixstatic.com/x",
                rights_status="hampton_source_ownership_to_confirm", width=700.0, height=466.0, bytes=1000.0)
    base.update(kw)
    return base

class ListingMapping(unittest.TestCase):
    def test_sale(self):
        l = ih.map_listing(prop(), None, TODAY)
        self.assertEqual((l["operation"], l["sale_price"], l["rent"], l["premium"], l["currency"]), ("sale", 779000.0, None, None, "GBP"))
        self.assertEqual((l["title"], l["property_type"], l["road_name"], l["summary"]), ("Le Bernage", "House", None, "A\nB"))
        self.assertEqual((l["published"], l["archived_at"], l["availability"]), (1, None, "for_sale"))
        self.assertEqual(l["bedrooms"], 3)

    def test_rent_per_month(self):
        l = ih.map_listing(prop(price_basis="Rent per month", availability="To let", asking_amount=1900.0), None, TODAY)
        self.assertEqual((l["operation"], l["rent"], l["rent_period"], l["sale_price"]), ("rent", 1900.0, "month", None))

    def test_business_premium(self):
        l = ih.map_listing(prop(collection="commercial", price_basis="Business / lease premium; separate rent may apply", asking_amount=90000.0), None, TODAY)
        self.assertEqual((l["use"], l["operation"], l["premium"], l["sale_price"]), ("commercial", "business", 90000.0, None))

    def test_ambiguous_keeps_text_but_no_amount(self):
        l = ih.map_listing(prop(price_basis="Ambiguous rent/price — period and transaction need confirmation", availability="To let", asking_amount=9360.0, asking_text="£9,360"), None, TODAY)
        self.assertEqual((l["operation"], l["sale_price"], l["rent"], l["premium"], l["price_text"]), ("rent", None, None, None, "£9,360"))

    def test_negotiable_without_currency(self):
        l = ih.map_listing(prop(price_basis="Business / lease terms negotiable", currency="", asking_amount=None, asking_text="Negotiable"), None, TODAY)
        self.assertEqual((l["currency"], l["premium"], l["price_text"]), (None, None, "Negotiable"))

    def test_sold_not_published_and_legacy_archived(self):
        self.assertEqual(ih.map_listing(prop(availability="Sold"), None, TODAY)["published"], 0)
        legacy = ih.map_listing(prop(property_id="HE-X002", collection="indexed_legacy", catalogue_scope="Indexed legacy — outside current catalogue",
                                     availability="Indexed legacy — withdrawn page", property_type="Shop"), None, TODAY)
        self.assertEqual((legacy["availability"], legacy["published"], legacy["use"]), ("withdrawn", 0, "commercial"))
        self.assertTrue(legacy["archived_at"].startswith(TODAY))

class MediaMapping(unittest.TestCase):
    def test_hampton_photo_public_with_thumb(self):
        m = ih.map_media(asset(), 0, TODAY)
        self.assertEqual((m["origin"], m["kind"], m["public"], m["thumb_key"]), ("hampton", "photo", 1, "thumbs/hampton/x.jpg"))

    def test_external_never_public(self):
        m = ih.map_media(asset(provider="Livingroom", local_path="media/external/y.jpg"), 0, TODAY)
        self.assertEqual((m["origin"], m["public"]), ("external", 0))

    def test_pdf_and_links_are_documents(self):
        self.assertEqual(ih.map_media(asset(provider="Savills", local_path="media/external/b.pdf", asset_type="brochure_pdf"), 0, TODAY)["kind"], "document")
        link = ih.map_media(asset(provider="Vimeo", local_path="", asset_type="video_tour"), 0, TODAY)
        self.assertEqual((link["kind"], link["r2_key"], link["public"]), ("document", None, 0))

    def test_floorplan(self):
        self.assertEqual(ih.map_media(asset(asset_type="floor_plan"), 0, TODAY)["kind"], "floorplan")

class SqlQuoting(unittest.TestCase):
    def test_literals(self):
        self.assertEqual([ih.q(None), ih.q(3.0), ih.q(2.5), ih.q("O'Neil")], ["NULL", "3", "2.5", "'O''Neil'"])

def schema_db():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    mig = os.path.join(os.path.dirname(__file__), "..", "migrations")
    for f in sorted(os.listdir(mig)):
        with open(os.path.join(mig, f)) as fh:
            db.executescript(fh.read())
    return db

class Rerun(unittest.TestCase):
    def test_rerun_never_overwrites_panel_edits(self):
        db = schema_db()
        row = ih.map_listing(prop(), None, TODAY); row["cover_media_id"] = None
        sql = ih.insert("listings", row, "id")
        db.execute(sql)
        db.execute("UPDATE listings SET title = 'Edited in panel' WHERE id = 'HE-R001'")
        db.execute(sql)
        self.assertEqual(db.execute("SELECT title FROM listings").fetchone()[0], "Edited in panel")

    def test_rerun_does_not_resurrect_deleted_listings(self):
        db = schema_db()
        row = ih.map_listing(prop(), None, TODAY); row["cover_media_id"] = None
        media = ih.map_media(asset(), 0, TODAY)
        db.execute(ih.insert("listings", row, "id")); db.execute(ih.insert("media", media, "id"))
        db.execute("DELETE FROM media"); db.execute("DELETE FROM listings")
        db.execute("INSERT INTO deleted_listings (id, deleted_at, deleted_by) VALUES ('HE-R001', 'now', 'luis')")
        db.execute(ih.insert("listings", row, "id")); db.execute(ih.insert("media", media, "id"))
        self.assertEqual(db.execute("SELECT COUNT(*) FROM listings").fetchone()[0], 0)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM media").fetchone()[0], 0)

if __name__ == "__main__":
    unittest.main()
