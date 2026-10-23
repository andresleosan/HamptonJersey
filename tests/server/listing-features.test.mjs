import test from "node:test";
import assert from "node:assert/strict";
import { extractFeatures, parseParish } from "../../server/listing-features.js";

const row = (o = {}) => ({ title: "Property", property_type: null, location: null, road_name: null,
  summary: null, description: null, specs: "[]", ...o });
const feats = o => extractFeatures(row(o));
const evidence = o => JSON.parse(feats(o).feat_evidence);

test("parish from location, aliases and localities", () => {
  assert.equal(parseParish("St. Helier, Jersey"), "St Helier");
  assert.equal(parseParish("Saint Brelade"), "St Brelade");
  assert.equal(parseParish("ST LAWRENCE"), "St Lawrence");
  assert.equal(parseParish("St Aubin"), "St Brelade");
  assert.equal(parseParish("Grouville"), "Grouville");
  assert.equal(parseParish("St Saviours Road, St Helier"), "St Helier");
  assert.equal(parseParish("St Helier / St Clement"), null);
  assert.equal(parseParish("London"), null);
  assert.equal(parseParish(null), null);
  // Localities, possessives and streets named after a parish.
  for (const [s, p] of [["Red Houses", "St Brelade"], ["Les Quennevais", "St Brelade"], ["First Tower", "St Helier"],
    ["Havre des Pas", "St Helier"], ["Millbrook", "St Lawrence"], ["Bel Royal", "St Lawrence"], ["Five Oaks", "St Saviour"],
    ["St Aubin, St Brelade", "St Brelade"], ["St Brelade’s Bay", "St Brelade"], ["Trinity Hill, St Helier", "St Helier"]])
    assert.equal(parseParish(s), p, s);
  // Real agency addresses: a road named after a parish is not the parish; two parishes is unknown.
  assert.equal(parseParish("Park Heights, Old St. Johns Road"), null);
  assert.equal(parseParish("St Helier, St Lawrence"), null);
  assert.equal(parseParish("St Aubin's Road"), null);

  assert.equal(feats({ location: "St Ouen", road_name: "La Route de Vinchelez, St Mary" }).parish, "St Ouen");
  assert.equal(feats({ location: null, road_name: "La Rue de la Mare, St Martin" }).parish, "St Martin");
  assert.equal(feats({ location: "London", road_name: "Rue des Pres, Trinity" }).parish, "Trinity");
  assert.equal(feats({ location: "St Helier, St Lawrence", road_name: "Rue de Haut, St Lawrence" }).parish, null);
});

test("pets, parking, furnished, outdoor and type from text", () => {
  const pets = s => feats({ description: s }).feat_pets;
  for (const s of ["No pets.", "Pets not permitted", "pets not allowed", "Pets not accepted",
    "Regret no pets", "Smoking and pets are not permitted", "No pets allowed", "Regret no pets accepted"])
    assert.equal(pets(s), "no", s);
  for (const s of ["Pets considered", "pets allowed", "Pets welcome", "Pet friendly", "pet-friendly garden",
    "Pets are considered by arrangement"]) assert.equal(pets(s), "yes", s);
  assert.equal(pets("There are no pets restrictions"), null, "no restriction is not a refusal");
  assert.equal(pets("No pets restriction applies"), null);
  const mixed = { description: "Pets considered for the garden flat. No pets in the main house." };
  assert.equal(feats(mixed).feat_pets, null, "yes and no together say neither");
  assert.equal(evidence(mixed).pets, "No pets in the main house");
  assert.equal(evidence({ summary: "Two bedrooms\nPets considered\nAllocated parking" }).pets, "Pets considered");

  const parking = (s, specs = "[]") => feats({ description: s, specs }).feat_parking;
  for (const [s, n] of [["Parking for 3 cars", 3], ["parking for one car", 1], ["2 parking spaces", 2],
    ["Two allocated parking spaces", 2], ["3-car garage", 3], ["Double garage", 2], ["Garage", 1], ["Parking", 1],
    ["Parking space", 1], ["No parking", 0], ["Regret no parking", 0], ["Double garage & parking for 2/3 cars", 2],
    ["Single garage. Parking for 4 cars.", 4], ["Private garage for 5 cars", 5], ["There is no on-site parking", 0]])
    assert.equal(parking(s), n, s);
  assert.equal(parking(null, JSON.stringify([{ group: "", label: "Parking Spaces", value: "2" }])), 2);
  assert.equal(parking("Visitor parking available"), null, "visitors' parking is not the listing's");
  assert.equal(parking("Rented parking available nearby"), null);
  assert.equal(parking("Nearby paid parking. Single garage."), 1);
  assert.equal(evidence({ description: "A lovely cottage. Parking for 3 cars. Sea views." }).parking, "Parking for 3 cars");

  const furnished = s => feats({ description: s }).feat_furnished;
  assert.equal(furnished("The terms state that the accommodation is unfurnished"), "no");
  assert.equal(furnished("Fully furnished"), "yes");
  assert.equal(furnished("Part furnished"), null);
  assert.equal(furnished("The apartment is part-furnished"), null);
  assert.equal(furnished("Available unfurnished or furnished"), null);
  for (const s of ["Partly furnished", "Partially furnished", "Semi-furnished", "semi furnished"])
    assert.equal(furnished(s), null, s);
  assert.equal(evidence({ description: "Fully furnished" }).furnished, "Fully furnished");

  // A specs row whose label names the feature is read as a key and its value, not as prose.
  const spec = (label, value) => feats({ specs: JSON.stringify([{ group: "", label, value }]) });
  for (const [label, value, col, want] of [["Pets Allowed", "No", "feat_pets", "no"], ["Pets", "none", "feat_pets", "no"],
    ["Pets", "Yes", "feat_pets", "yes"], ["Pets", "Allowed", "feat_pets", "yes"], ["Furnished", "No", "feat_furnished", "no"],
    ["Furnished", "YES", "feat_furnished", "yes"], ["Garage", "No", "feat_parking", 0], ["Parking", "None", "feat_parking", 0],
    ["Parking Spaces", "0", "feat_parking", 0], ["Parking", "Yes", "feat_parking", 1]])
    assert.equal(spec(label, value)[col], want, `${label}: ${value}`);
  assert.equal(JSON.parse(spec("Pets Allowed", "No").feat_evidence).pets, "Pets Allowed: No");
  // Only a label that states permission is a pets answer; "Pet Deposit: 0" says nothing about whether pets may come.
  for (const [label, value] of [["Pet Restrictions", "None"], ["Pets Restrictions", "No"], ["Pet Deposit", "0"],
    ["Pet Deposit", "None"]]) assert.equal(spec(label, value).feat_pets, null, `${label}: ${value}`);
  for (const label of ["pets permitted", " Pet Accepted ", "Pets Considered"]) assert.equal(spec(label, "No").feat_pets, "no", label);
  // A keyed no never hides a count stated elsewhere: the most spaces said wins.
  const rows = (...r) => JSON.stringify(r.map(([label, value]) => ({ group: "", label, value })));
  assert.equal(feats({ specs: rows(["Garage", "No"], ["Parking Spaces", "2"]) }).feat_parking, 2);
  assert.equal(feats({ specs: rows(["Garage", "No"]), description: "Parking for 2 cars" }).feat_parking, 2);
  assert.equal(feats({ specs: rows(["Garage", "No"], ["Parking", "Yes"]) }).feat_parking, 1);
  assert.equal(feats({ specs: rows(["Garage", "No"]), description: "Sea views" }).feat_parking, 0);

  const outdoor = s => feats({ description: s }).feat_outdoor;
  assert.equal(outdoor("South facing garden"), '["garden"]');
  assert.equal(outdoor("Roof terrace"), '["terrace"]');
  assert.equal(outdoor("Ground-floor studio with a private patio"), '["terrace"]');
  assert.equal(outdoor("Large balcony"), '["balcony"]');
  assert.equal(outdoor("Balconies, a sun terrace and communal gardens"), '["garden","terrace","balcony"]');
  assert.equal(outdoor("First-floor apartment with a Juliette balcony"), null);
  assert.equal(outdoor("A two-bedroom end-terrace townhouse"), null);
  assert.equal(evidence({ summary: "Roof terrace\nLarge balcony" }).outdoor, "Roof terrace · Large balcony");
  assert.equal(evidence({ summary: "Large garden and terraces" }).outdoor, "Large garden and terraces");

  const type = (property_type, title = "Property") => feats({ property_type, title }).feat_type;
  for (const [t, v] of [["Apartment", "flat"], ["Flat", "flat"], ["Maisonette", "flat"], ["Penthouse Apartment", "flat"],
    ["House", "house"], ["Detached Bungalow", "house"], ["villa", "house"], ["TOWNHOUSE", "house"],
    ["Farmhouse", "house"], ["Chateau", "house"], ["Cottage", "cottage"], ["Studio", "studio"]])
    assert.equal(type(t), v, t);
  assert.equal(type(null, "Granite Cottage with Paved Garden"), "cottage");
  assert.equal(type("Detached Home", "Four-Bedroom St Helier House with a Garden"), "house");
  assert.equal(type(null, "Private Coastal Home with Cinema and Guest Apartment"), null, "what it comes with is not its type");
  assert.equal(evidence({ property_type: "Detached Bungalow" }).type, "Detached Bungalow");
});

test("evidence is the phrase, at most 120 characters", () => {
  const long = `${"A wide hall leads to the reception rooms and a kitchen with an island and views over the bay, ".repeat(2)}`
    + "and the garden is south facing and walled on every side, with mature beds and a lawn";
  const e = evidence({ description: long }).outdoor;
  assert.ok(e.length <= 120, e);
  assert.match(e, /garden/);
});

test("nothing said means null, never no", () => {
  assert.deepEqual(feats({ title: "Bright home", description: "Sea views from every room." }), {
    parish: null, feat_pets: null, feat_parking: null, feat_furnished: null, feat_outdoor: null,
    feat_type: null, feat_evidence: null,
  });
  assert.deepEqual(extractFeatures({ title: "Plot", specs: "[]" }), {
    parish: null, feat_pets: null, feat_parking: null, feat_furnished: null, feat_outdoor: null,
    feat_type: null, feat_evidence: null,
  });
});
