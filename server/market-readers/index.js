// BUS-09: the automatic readers the daily sweep (BUS-08) may use, by source_ref. A channel is read only when BUS-19
// reviewed it as allowed over HTTP; a source with no reader here is recorded as no_reader. Deferred channels: BUS-24.
import { gaudinReader } from './gaudin.js';

export const MARKET_READERS = Object.freeze({ 'src-gaudin-co': gaudinReader() });
