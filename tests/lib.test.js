// Run: node --test tests/lib.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../site/lib.js");

const P = o => ({ id: "HE-R001", title: "Home", status: "For Sale", region: "jersey", use: "residential", operation: "sale",
  currency: "GBP", salePrice: null, rent: null, rentPeriod: null, premium: null, beds: 3, ...o });
const sale = P({ salePrice: 500000 });
const rent = P({ id: "HE-R002", operation: "rent", rent: 1900, rentPeriod: "month" });
const biz = P({ id: "HE-C001", use: "commercial", operation: "business", premium: 90000 });
const eur = P({ id: "HE-I001", region: "international", currency: "EUR", salePrice: 110000 });
const uk = P({ id: "HE-R018", region: "uk", salePrice: 520000 });
const near = P({ id: "HE-R003", salePrice: 600000 });
const sold = P({ id: "HE-R004", salePrice: 550000, status: "Sold" });
const noPrice = P({ id: "HE-R005" });
const ALL = [sale, rent, biz, eur, uk, near, sold, noPrice];

test("unknown prices are labelled, never shown as zero", () => {
  assert.equal(L.priceLabel(noPrice), "Price not published");
  assert.equal(L.amount(noPrice), null);
});

test("sale, rent and business premium are separate fields", () => {
  assert.equal(L.priceLabel(rent), "£1,900 pcm");
  assert.equal(L.priceLabel(biz), "£90,000");
  assert.equal(L.priceLabel(eur), "€110,000");
  assert.equal(L.money(500000, null), "500,000", "unknown currency: no 'null ' prefix");
});

test("comparables never mix operations, uses, regions or currencies, and skip sold", () => {
  assert.deepEqual(L.comparables(sale, ALL).map(x => x.id), ["HE-R003"]);
  assert.deepEqual(L.comparables(uk, ALL), []);
  assert.deepEqual(L.comparables(noPrice, ALL), []);
});

test("max-price filter compares like with like", () => {
  const f = { region: "all", op: "sale", beds: 0, max: 600000 };
  assert.ok(!L.matches(rent, f));
  assert.ok(!L.matches(eur, f), "EUR price is not compared with a GBP limit");
  assert.ok(L.matches(sale, f));
  assert.ok(L.matches(rent, { region: "jersey", op: "rent", beds: 2, max: 2500 }));
});

test("only safe URLs reach attributes", () => {
  assert.equal(L.safeUrl("javascript:alert(1)", L.IMG_HOST), null);
  assert.equal(L.safeUrl("https://evil.example/media/x.jpg", L.IMG_HOST), null);
  assert.equal(L.safeMedia("/media/A00001"), "/media/A00001");
  assert.equal(L.safeMedia("/media/A00001?thumb"), "/media/A00001?thumb");
  for (const bad of ["https://evil/media/A1", "/media/../x", "/media/A1\" onerror=x", null, 5]) assert.equal(L.safeMedia(bad), null);
  assert.equal(L.safeHttps("http://x.com"), null);
  assert.equal(L.safeHttps("https://x.com/a"), "https://x.com/a");
  assert.equal(L.embedUrl("https://my.matterport.com/show/?m=abc"), "https://my.matterport.com/show/?m=abc");
  assert.equal(L.embedUrl("https://spec.co/properties/1"), null);   // offered as a link instead
  assert.equal(L.esc(`"><img onerror=x>`), "&quot;&gt;&lt;img onerror=x&gt;");
});

test("M3: today follows Jersey's calendar", () => {
  assert.equal(L.jerseyToday(new Date("2026-07-01T23:30:00Z")), "2026-07-02");
});

// GET /api/availability as the booking form reads it: negotiator 1 is fully booked on the 26th, 2 is off that day.
const DAYS = [
  {date: "2026-10-26", slots: {1: [{time: "10:00", booked: true}, {time: "10:30", booked: true}], 2: []}},
  {date: "2026-10-27", slots: {1: [{time: "10:00", booked: true}, {time: "10:30", booked: false}, {time: "11:00", booked: false}],
    2: [{time: "10:00", booked: false}]}},
  {date: "2026-10-28", slots: {1: [{time: "10:00", booked: false}, {time: "10:30", booked: false}], 2: [{time: "14:00", booked: false}]}},
];

test("free times are a negotiator's unbooked slots that day", () => {
  assert.deepEqual(L.freeTimes(DAYS[1], 1), ["10:30", "11:00"]);
  assert.deepEqual(L.freeTimes(DAYS[0], 1), [], "fully booked");
  assert.deepEqual(L.freeTimes(DAYS[0], 2), [], "day off");
  assert.deepEqual(L.freeTimes(DAYS[0], 9), [], "someone not in the answer");
});

test("the form starts on the first free day and the first free time", () => {
  assert.deepEqual(L.pickSlot(DAYS, 1), {date: "2026-10-27", time: "10:30"});
  assert.deepEqual(L.pickSlot(DAYS, 2), {date: "2026-10-27", time: "10:00"});
  assert.deepEqual(L.pickSlot(DAYS.slice(0, 1), 1), {date: null, time: null}, "nothing free: nothing chosen");
});

test("a chosen day and time stay while they are free; a taken time is left for the visitor to choose", () => {
  assert.deepEqual(L.pickSlot(DAYS, 1, {date: "2026-10-28", time: "10:30"}), {date: "2026-10-28", time: "10:30"});
  assert.deepEqual(L.pickSlot(DAYS, 1, {date: "2026-10-27", time: "10:00"}), {date: "2026-10-27", time: null}, "booked since");
  assert.deepEqual(L.pickSlot(DAYS, 2, {date: "2026-10-28", time: "10:30"}), {date: "2026-10-28", time: null}, "not one of theirs");
  assert.deepEqual(L.pickSlot(DAYS, 1, {date: "2026-10-26", time: "10:00"}), {date: "2026-10-27", time: null}, "a full day moves on");
  assert.deepEqual(L.pickSlot(DAYS, 2, {date: "2026-10-28", time: null}), {date: "2026-10-28", time: null});
});

// Anything but booked: false counts as booked: the form never offers a slot it isn't sure about.
test("availability from the API is checked before it reaches the page", () => {
  assert.equal(L.parseAvailability(null), null);
  assert.equal(L.parseAvailability({negotiators: "x", days: []}), null);
  const a = L.parseAvailability({slot_minutes: 30,
    negotiators: [{id: 1, name: "Joshua Franco", role: "Negotiator"}, {id: "2", name: "Bad id"}, {id: 3, name: ""}, {id: 4, name: "No role"}],
    days: [{date: "2026-10-27", slots: {1: [{time: "10:00", booked: true}, {time: "1000", booked: false}, {time: "10:30", booked: "yes"}]}},
      {date: "27/10/2026", slots: {}}, {date: "2026-10-28"}]});
  assert.deepEqual(a.negotiators, [{id: 1, name: "Joshua Franco", role: "Negotiator"}, {id: 4, name: "No role", role: null}]);
  assert.deepEqual(a.days, [{date: "2026-10-27", slots: {1: [{time: "10:00", booked: true}, {time: "10:30", booked: true}], 4: []}},
    {date: "2026-10-28", slots: {1: [], 4: []}}]);
});

test("mortgage repayment", () => {
  assert.equal(Math.round(L.pmt(200000, 0.05, 25)), 1169);
  assert.equal(L.pmt(120000, 0, 10), 1000);
});

test("open viewing lines hide themselves after the day", () => {
  const lines = ["Open viewing: Saturday 10 October, 10:30 to 12:00", "Three bedrooms"];
  assert.deepEqual(L.liveSummary(lines, "2026-10-10"), lines, "still shown on the day");
  assert.deepEqual(L.liveSummary(lines, "2026-10-11"), ["Three bedrooms"], "gone the day after");
  assert.deepEqual(L.liveSummary(["Open viewing: by appointment", "x"], "2026-10-11"), ["Open viewing: by appointment", "x"], "no date, kept");
});

test("the website shows a listing only with a public photo of its own (shared with the sitemap and /p/<id>)", () => {
  assert.equal(L.shownOnSite({image: "/media/A00001"}), true);
  for (const image of [null, undefined, "", "https://evil.example/x.jpg", "/media/../admin"]) assert.equal(L.shownOnSite({image}), false, String(image));
});
