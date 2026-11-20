// BUS-09: one GET for a reader, kept on the reviewed host (with or without www.) and under the reviewed path, with
// manual redirects (3 hops at most) and the sweep's abort signal. HTTP failures map to the sweep's SourceReadError codes.
import { SourceReadError } from '../market-daily-sweep.js';

const UA = 'HamptonEstatesBot/1.0 (+market review; reads allowed pages only)';
const bare = h => h.replace(/^www\./, '');

export async function fetchAllowed(fetchImpl, url, { host, path, signal }) {
  let res;
  for (let hop = 0; hop < 3; hop++) {
    try { res = await fetchImpl(url, { redirect: 'manual', signal, headers: { accept: '*/*', 'user-agent': UA } }); }
    catch { throw new SourceReadError('unavailable'); }
    if (![301, 302, 307, 308].includes(res.status)) break;
    let next; try { next = new URL(res.headers.get('location') ?? '', url); } catch { throw new SourceReadError('invalid_response'); }
    if (next.protocol !== 'https:' || bare(next.hostname) !== bare(host) || !next.pathname.startsWith(path)) throw new SourceReadError('access_denied');
    url = next.href;
  }
  if (res.status === 429) throw new SourceReadError('rate_limited', Number(res.headers.get('retry-after')) || null);
  if ([401, 403].includes(res.status) || [301, 302, 307, 308].includes(res.status)) throw new SourceReadError('access_denied');
  if (!res.ok) throw new SourceReadError('unavailable');
  return res.text();
}
