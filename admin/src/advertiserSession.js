// Coordination lives above section navigation. It never stores advertiser data.
export function createAdvertiserSession() {
  let owner = null, revision = 0;
  const listeners = new Set();
  const publish = () => { revision++; for (const listener of listeners) listener(); };
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => revision,
    get busy() { return owner !== null; },
    begin() { if (owner) return null; owner = {}; publish(); return owner; },
    end(token) { if (owner === token) { owner = null; publish(); } },
  };
}
