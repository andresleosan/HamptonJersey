// Set by a page with a form (listing editor, new applicant); read by the header so leaving the page can ask first.
export let unsaved = false;
export const setUnsaved = v => { unsaved = v; };
export const confirmLeave = e => {
  if (unsaved && !confirm("You have unsaved changes. Leave without saving them?")) { e?.preventDefault(); return false; }
  return true;
};
