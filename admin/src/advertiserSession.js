// Coordination lives above section navigation. It never stores advertiser data.
export function createAdvertiserSession() {
  let owner = null, revision = 0, epoch = 0;
  const removed = new Set(), listeners = new Set();
  const publish = () => { revision++; for (const listener of listeners) listener(); };
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => revision,
    get busy() { return owner !== null; },
    get epoch() { return epoch; },
    isRemoved: id => removed.has(String(id)),
    begin() { if (owner) return null; owner = {}; publish(); return owner; },
    end(token) { if (owner === token) { owner = null; publish(); } },
    erase(id) { removed.add(String(id)); epoch++; publish(); },
  };
}
