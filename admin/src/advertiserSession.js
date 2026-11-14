// Coordination lives above section navigation. It never stores advertiser data: only the IDs whose personal data
// was removed (AGE-14), so an older response for them is discarded. Other tabs learn those IDs by BroadcastChannel;
// a missed message is covered by revalidation on resume and by the server, which never returns removed data.
export function createAdvertiserSession(Channel = globalThis.BroadcastChannel) {
  let owner = null, revision = 0, epoch = 0;
  const listeners = new Set(), gone = new Set();
  const publish = () => { revision++; for (const listener of listeners) listener(); };
  const mark = id => { if (gone.has(String(id))) return; gone.add(String(id)); epoch++; publish(); };
  const channel = Channel ? new Channel('hampton-advertiser-privacy') : null;
  if (channel) channel.onmessage = e => { const id = e.data?.suppressed; if (Number.isInteger(id)) mark(id); };
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => revision,
    get busy() { return owner !== null; },
    get epoch() { return epoch; },
    begin() { if (owner) return null; owner = {}; publish(); return owner; },
    end(token) { if (owner === token) { owner = null; publish(); } },
    removed(id) { if (gone.has(String(id))) return; mark(id); channel?.postMessage({ suppressed: Number(id) }); },
    fresh: record => !gone.has(String(record.id)) || !!record.suppressed_at,
  };
}
