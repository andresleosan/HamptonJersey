// PUB-11: staff routes for private listing documents, mounted only with PUB11_DOCUMENTS_READY=1.
import { json } from "../http.js";
import { loadListing } from "./listings.js";
import { addDocument, downloadDocument, listDocuments, removeDocument } from "../listing-documents.js";

const BASE = "^/admin/listings/(HE-[A-Z]\\d{3,})/documents";
const DOC = "/(D[0-9a-f]{16})$";

export default [
  ["GET", new RegExp(`${BASE}$`), async ({ env, params: [id] }) => {
    await loadListing(env, id);
    return json({ documents: await listDocuments(env, id) });
  }, true],
  ["POST", new RegExp(`${BASE}$`), async ({ request, env, admin, params: [id] }) => {
    await loadListing(env, id);
    return json({ document: await addDocument(env, request, id, admin) }, 201);
  }, true],
  ["GET", new RegExp(BASE + DOC), ({ env, params: [id, doc] }) => downloadDocument(env, id, doc), true],
  ["DELETE", new RegExp(BASE + DOC), ({ env, admin, params: [id, doc] }) => removeDocument(env, id, doc, admin), true],
];
