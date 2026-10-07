// Set by the listing editor; read by the header so leaving the page can ask first.
export let unsaved = false;
export const setUnsaved = v => { unsaved = v; };
export const confirmLeave = e => {
  if (unsaved && !confirm("Hay cambios sin guardar en la ficha. ¿Salir sin guardarlos?")) { e?.preventDefault(); return false; }
  return true;
};
