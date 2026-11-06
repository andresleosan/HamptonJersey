// The full-resolution copy of a photo (6-nov-2026): kept whole unless the browser's canvas limit says otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fullScale, MAX_PIXELS } from "../../admin/src/image.js";

test("fullScale: a 12 MP photo stays whole; a 48 MP one shrinks just enough for the canvas limit", () => {
  assert.equal(fullScale(4032, 3024), 1);
  const s = fullScale(8064, 6048);
  assert.ok(s < 1 && s > 0.5);
  assert.ok(8064 * s * 6048 * s <= MAX_PIXELS + 1);
});
