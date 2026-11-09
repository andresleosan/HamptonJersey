export const HISTORY_VISIBLE_LIMIT=10000;

export function mergeHistoryPage(current,next) {
  const items=current?.items?.length?[...new Map([...current.items,...next.items]
    .map(i=>[i.id,i])).values()]:next.items;
  return {...next,items:items.slice(-HISTORY_VISIBLE_LIMIT),
    trimmed:!!current?.trimmed||items.length>HISTORY_VISIBLE_LIMIT};
}
