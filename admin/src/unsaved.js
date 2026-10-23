// Set by a page with a form (listing editor, new applicant, applicant record); read when leaving the page (header and
// page links, App.jsx) and when closing or reloading the tab (below), which then ask first.
export let unsaved = false;
export const setUnsaved = v => { unsaved = v; };
export const confirmLeave = e => {
  if (unsaved && !confirm("You have unsaved changes. Leave without saving them?")) { e?.preventDefault(); return false; }
  return true;
};
addEventListener("beforeunload", e => { if (unsaved) { e.preventDefault(); e.returnValue = ""; } });
