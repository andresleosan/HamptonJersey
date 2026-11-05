# PUB-21 · Properties Queue (Google Drive) — Ledger

Ruling: inline on main, one commit at the end (Luis's /avanzar: code, ESTADO and checklist in one commit on main; no worktree, other branches' previews use the production database) — cost if wrong: no per-task commits to bisect.
Pre-flight: Task 3/4 consume Task 1–2's drive.js (folderIdFrom, folderInfo, walkFolder, photosIn, fileResponse, chooseEdited) — names match. Task 5 consumes setState/deleteListing from listings.js — extracted there.
Task 1: done. migrations/0020_drive_imports.sql, server/drive.js, tests/server/drive.test.mjs (failed first on the missing module), tests/server/fake-drive.mjs. 8/8.
Ruling: the fake Drive lives in tests/server/fake-drive.mjs from Task 1 (the plan moved it there in Task 3) — cost if wrong: none.
Ruling: folders whose name says photo/foto/picture/image are not walked for documents, Edited ones only at the top level (D8 «salvo las carpetas de fotos») — cost if wrong: a document saved inside a photos folder isn't read.
Ruling: a HEIC's thumbnail link is asked of Drive each time the photo is served (the link is short-lived), and only followed on *.googleusercontent.com (it carries the app's token) — cost if wrong: one extra Drive call per HEIC.
Task 2: done. chooseEdited in server/drive.js; test in drive.test.mjs.
Task 3–5: done. server/routes/queue.js (panel routes and Hermes's three door functions), wired in server/api.js and the DOOR of server/routes/hermes.js; listings.js: deleteListing extracted from remove, setState exported with fromQueue (C8), detail returns queue. tests/server/queue.test.mjs 9/9.
Ruling: the review is reserved in two calls, POST /admin/queue/:id/start (ready → review, once) then /listing {listing_id} after the browser created the draft; a start with no draft can be taken again after 10 minutes — the plan's single reserve call needed the listing id before the listing existed — cost if wrong: a closed tab leaves the row «In review» without draft for 10 minutes (Discard still works).
Ruling: the proposal's property_txt is parsed in the panel (readPropertyText, as for a folder), not on the server — the panel shows its notes and warnings like Add new property — cost if wrong: none.
Ruling: over 100 photos in Edited, the first 100 are used with a warning (a folder from the computer is refused) — the queue has no form to send back — cost if wrong: a few photos left out, said in the warning.
Ruling: queue tests were written before the routes and only run after them (the routes were 404 before) — cost if wrong: none seen; every assertion is specific.
Task 7 step 1: done. server/retention.js deletes closed drive_imports 90 days on; retention test failed first (1 fail), then 22/22. npm test 518/518.
Task 6: done. admin/src/Queue.jsx, admin/src/createDraft.js (the PUB-01 upload moved out of NewProperty.jsx, unchanged), ListingEditor.jsx («Approve and publish» while in review), Listings.jsx, App.jsx (#/queue), styles.css; e2e step driveQueue with a fake Drive on port 8799 (.dev.vars, git-ignored, holds a made-up key). The first full run failed at «the bar stays on one line at 1280px».
Ruling: «Properties Queue» is a button in Listings' header (and #/queue lights Listings in the bar), not a ninth link in the bar — the bar no longer fits one line at 1280 px — cost if wrong: one more click from other pages.
Ruling: the proposal lists photo names with «Leave out» instead of thumbnails — thumbnails would download every full-size photo from Drive twice — cost if wrong: the photos are first seen in the editor (where they can still be removed and the cover changed).
Ruling: no count of «Ready to review» rows in the bar — the bar is full and the counts come from openCounts, which Hermes's summary also reads — cost if wrong: the team checks the queue themselves.
Task 7: docs. Checklist PUB-21 parcial (hecho, falta, bloqueo PRE-32, evidence, date 2026-11-05); ESTADO section; architecture §5.10 line and the header note; Hermes spec H9 widened by D2. No ids, emails or document text.
Final review: 4 reviewers (bugs, security and privacy, DESIGN.md, code of more).
Final: fixed a refused or failed draft locking the row 10 minutes, orphan drafts when the link call failed, and linking any unpublished listing to a row and then discarding it (bugs-1, bugs-2, security-2) — one server call POST /admin/queue/:id/draft creates the listing (createListing, extracted from listings.js) and ties it to its row; a refusal puts the row back to ready; /start and /listing removed. Tests «review: one draft per row…» and «a draft the server refuses…» RED→GREEN.
Final: fixed «Unedited»/«Not edited» taken as the Edited folder (bugs-3) — word-bounded match with negations excluded; drive test RED→GREEN.
Final: fixed Records only matched by its exact name (security-1) — any folder or file with the word «record(s)», and a pasted Records folder refused; tests RED→GREEN.
Final: fixed the token being sent to any *.googleusercontent.com or http host (security-3, security-4) — driveFetch itself allows only the API origin or https lhN.googleusercontent.com.
Final: fixed a null body answered with 500 (security-5) — test RED→GREEN.
Final: fixed Drive errors while claiming reported as «Hermes didn't finish» and an unreachable folder skipping the next row (bugs-5) — the Drive error is kept as the reason and the next row is claimed; test RED→GREEN.
Final: fixed Approve publishing before closing the row (bugs-6) — the row closes first and reopens if publishing fails; covered by the approve test (no race test).
Final: fixed a double click starting two drafts (bugs-4) — running ref, as NewProperty; checked by reading (no React test harness).
Final: fixed design-1/2/3/4/5/6/7 — checkbox names the photo, focus moves to the heading when the view changes, 44 px touch target, only link errors mark the field, conflict labels, «Approve and publish» as ghost beside the primary Save, plain-English copy; e2e and build.
Final: fixed excess-1/2/3/6/7 — kindsOf, pickCover, MAX_PHOTO and MAX_PHOTOS from listing-import.js, the open-status list built once, the token test commented.
Final: minor (deferred): excess-4/5 — MAX_NOTE stays in two files with a comment tying them; the 10-minute retake disappeared with the one-call draft.
Final: npm test 521/521 + 14 Python; npm run build OK; check:release OK; full e2e from a fresh database «e2e OK».
Final: fixed a folder pasted from inside Records being accepted (automated commit security review) — insideRecords walks up the parents (10 levels) in send and when Hermes claims; test RED→GREEN, npm test 521/521. Server only: the e2e was not run again.
