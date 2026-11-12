import { validateCatalog } from '../catalog.mjs';
import { publicBoard } from './public-board.mjs';

export const CATALOG_URL = 'https://raw.githubusercontent.com/andresleosan/HamptonJersey/main/docs/roadmap/catalog.json';
const MAX_BYTES = 2_000_000;

// Public source only: a failed or invalid fetch never becomes an empty or falsely current board.
export async function catalogBoard(fetcher = fetch, now = () => new Date()) {
  const response = await fetcher(CATALOG_URL, { headers: { 'User-Agent': 'Hampton-Public-Board' },
    redirect: 'manual', signal: AbortSignal.timeout(8000) });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > MAX_BYTES || !response.body) throw Error('Catalogue unavailable');
  const reader = response.body.getReader(), chunks = []; let total = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length;
      if (total > MAX_BYTES) { await reader.cancel(); throw Error('Catalogue too large'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const catalog = JSON.parse(new TextDecoder().decode(bytes));
  if (validateCatalog(catalog).length) throw Error('Invalid catalogue');
  const board = publicBoard({ ...catalog, claims: [], serverTime: now().toISOString(), revision: 0 });
  return { ...board, source: 'github', lists: board.lists.map(x => ({ ...x, activeCount: null })),
    tasks: board.tasks.map(x => ({ ...x, activity: 'unavailable' })) };
}
