// The proposed schema is applied only to a synthetic, in-memory fixture.
import { readFileSync } from 'node:fs';
export function applyListingHealthProposal(env) {
  env.DB.raw.exec(readFileSync(new URL('../../docs/roadmap/work/PUB-17/proposed-listing-health.sql', import.meta.url), 'utf8'));
  return env;
}
