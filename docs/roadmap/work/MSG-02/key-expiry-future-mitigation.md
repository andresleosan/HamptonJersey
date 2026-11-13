# MSG-02: mitigation for future key expiry

This local change prevents a human reply from reviving a visitor key that has already expired at the time of the reply. In the same D1 batch as the reply, it replaces that chat's expired `key_hash` with a unique `expired:` marker containing its internal chat ID. The marker cannot match the 64-character hexadecimal SHA-256 digest produced by the current key lookup. The chat, messages and existing thirty-day retention behavior remain; a human reply made before expiry retains and extends the original key.

Visitor read, send and delete recheck both the key hash and its seven-day age in the actual database statement that reads or mutates data. A delayed presence update carries the same check. Expired, invalidated or deleted keys receive the existing generic ended response. The key itself and its digest are not written to application logs or added to response bodies.

The threshold and update timestamps are evaluated by D1 at statement execution, using UTC and the existing inclusive seven-day boundary. These routes use the direct D1 binding: [Cloudflare documents](https://developers.cloudflare.com/d1/best-practices/read-replication/) that queries without the Sessions API run on the primary. If a future change introduces replica sessions, each security-sensitive read must still be routed to an up-to-date primary view. A transaction that has already read data before a later revocation cannot retract that data from an in-flight response. D1's statement time is not evidence of the physical commit time; verify clock skew and the intended serialization boundary before deployment.

## Remaining limits and release gates

- This change only prevents future revival events handled by the new code. A key revived before deployment may already have a recent `last_at`, so the key and timestamp alone cannot identify it. Such cases require separate authorized analysis and a conservative backfill decision; missing history cannot be treated as proof of safety.
- The marker is impossible for a valid SHA-256 digest, but existing database rows and any integrations that assume hexadecimal-only values must be checked before release. A conflicting stored value causes the entire reply batch to roll back; local D1 tests cover that failure.
- Mixed old and new workers can still execute an old unguarded operation during a rollout. Review deployment sequencing and all current and future chat writers before claiming the protection is effective.
- This change adds no migration, does not enable the chat or any provider, bot or WAF, and does not complete MSG-02's shared semantic revision/CAS work. Independent review and any authorized operational checks remain necessary.

Local synthetic D1 tests cover timely and late human replies, key invalidation, held reads/sends/deletes, boundary passage, concurrent messages, rollback, deletion, delayed presence and response privacy. These tests do not demonstrate the state of the remote database or the activation of any channel.
