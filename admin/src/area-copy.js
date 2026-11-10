// Keep the submitted answer and its parishes together; exclusions already in the draft are never replaced.
export function areaCopy(current, sent, confirm) {
  const explicit = ["selected", "any", "unknown"].includes(sent.area_answer);
  const hasArea = explicit || !!sent.parishes_wanted?.length;
  const wanted = hasArea ? sent.parishes_wanted ?? [] : current.parishes_wanted;
  const preferred = hasArea ? sent.preferred_parish ?? "" : current.preferred_parish;
  const excluded = [...new Set([...current.parishes_excluded, ...(sent.parishes_excluded ?? [])])];
  if (wanted.some(p => excluded.includes(p)))
    return { error: "Resolve the conflict between selected and excluded parishes before copying these areas." };
  const removes = current.parishes_wanted.some(p => !wanted.includes(p))
    || (current.preferred_parish && current.preferred_parish !== preferred);
  if (removes && !confirm("Copying these areas will remove selected or preferred parishes from the form. Continue?"))
    return { cancelled: true };
  return { patch: { ...(hasArea ? { area_answer: explicit ? sent.area_answer : "", parishes_wanted: wanted, preferred_parish: preferred } : {}),
    ...(excluded.length !== current.parishes_excluded.length ? { parishes_excluded: excluded } : {}) } };
}
