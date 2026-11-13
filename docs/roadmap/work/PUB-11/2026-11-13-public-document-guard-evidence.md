# PUB-11: local guard for known public documents

## Scope

This is a local, synthetic-fixture change. It is not a deployment, production verification, complete document workflow, or a claim that PUB-11 is finished. No migration, production account, external service or cache purge was used.

`isPublicMedia` now requires a visual kind and rejects known document types and filename extensions, including a document row whose public flag is set or whose kind was changed to a visual kind while its recorded type remains documentary. Unknown, empty and generic MIME types remain eligible so legacy photos are not rejected solely for missing type information. The public listing DTO and anonymous `/media/:id` use the same row-level rule. The Insights health projection includes the fields needed to apply it consistently, using compact media arrays to retain its existing transport cap and 10,000-candidate behavior.

The media handler additionally checks the actual object's declared content type and a prefix of at most 1,024 bytes for recognizable PDF or common office-container signatures before serving a public response. It checks original and thumbnail responses independently. A rejected anonymous request returns 404 with `private, no-store`; an authenticated staff request continues under the existing private, no-store behavior. This does not add a private document route, attachment policy, or permission to publish documents.

The probe inspects at most 1,024 bytes and then replays the bytes already read before streaming the remainder. It does not deliberately load the whole object; a single chunk supplied by the upstream stream can exceed the prefix and is held until it is forwarded. On cancellation, the source stream is cancelled and buffered chunks are released. Tests check that a valid photo returns before the whole stream is read, arrives unchanged, and cancels its source when the client stops.

## Limits and compatibility

- This is a guard for known signals, not full file validation, a full document detector, malware detection, metadata removal, or a guarantee that an intentionally mislabeled object contains no document. Unknown MIME remains accepted for compatibility. Content outside the inspected prefix and formats without a recognized signal remain outside this guard.
- A valid photo with a misleading document kind, type, filename, object type, or document signature in the inspected prefix can be hidden. Existing legacy photos with null or generic MIME and no known document signal remain eligible; no production inventory was inspected, so the prevalence of conflicting labels is unknown.
- A document whose only recognizable signal is in the stored object's headers or bytes may still have a link in the public DTO because the DTO does not fetch every object; the anonymous media response is denied when that signal is found. This does not establish the identity of all object contents.
- Existing admin photo counts and some publication-readiness SQL still use their own kind/visibility checks; a mislabeled document can therefore be counted as a photo even though this public DTO and media guard deny it. Aligning those decisions is separate from this guard.
- Public images retain their existing `public, max-age=86400` policy. Previously cached responses may remain available according to the cache's existing lifetime or configuration. A fresh origin 404 cannot recall cached copies; no purge was attempted or verified.
- Upload signature/dimension verification, EXIF/GPS handling for direct API uploads, durable cleanup and the separate private PDF workflow remain pending. The original upstream stream can still deliver one large chunk. No claim about existing production files is made.

## Local verification

- Red/green tests reproduce public DTO and anonymous media exposure for known document labels, object types and recognizable body signatures; positive controls preserve synthetic JPEG, PNG, WebP, thumbnail and legacy null/generic MIME behavior.
- `node --test tests/server/media-document-privacy.test.mjs tests/server/public.test.mjs tests/server/listing.test.mjs tests/server/listing-health.test.mjs tests/server/listing-health-scale.test.mjs`: 58 passed, 0 failed, including the bounded 10,000-candidate check with synthetic media types and thumbnails.
- `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/pub11-public-media.e2e.cjs npm run test:e2e:isolated`: passed in the local networkless Worker and R2 fixture at 1280/390, covering valid photo bytes, legacy null MIME, public DTO, fresh anonymous requests and private staff access. This does not test production or existing caches.
- `npm test`: 1,559 Node tests passed, 0 failed; the Python unittest phase reported `OK`.
- `npm run build` and `npm run check:release`: passed; the build retained its existing large-chunk advisory.
- The earlier broad `tests/e2e.cjs` admin run remained blocked before the photo tests on an external iframe in the networkless container; this change does not claim that run passed.
