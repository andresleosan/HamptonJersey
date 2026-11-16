-- BUS-19 · 16-nov-2026: Luis ordenó eliminar los 38 canales denegados (34 directorios, Homely x3, web de Hampton).
-- Aplicado en producción tras el marcador Time Travel 0000046e-00000138-00005125-aea701f060798869b76d3eb405efe8ab.
DELETE FROM market_source_policy_history WHERE (source_ref,channel_id) IN (SELECT source_ref,channel_id FROM market_sources WHERE access_status='denied');
DELETE FROM market_source_activity WHERE (source_ref,channel_id) IN (SELECT source_ref,channel_id FROM market_sources WHERE access_status='denied');
DELETE FROM market_sources WHERE access_status='denied';
