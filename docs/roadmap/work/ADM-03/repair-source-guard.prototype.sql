-- DISCONNECTED PROTOTYPE: not a migration, not authorization, not used by the clock.
-- ?1 repair, ?2 rental, ?3 tenancy or NULL, ?4 status, ?5 urgency, ?6 updated_at.
-- The caller must validate the snapshot and recheck authorization in the same transaction.
EXISTS (
  SELECT 1 FROM repairs p JOIN rentals r ON r.id=p.rental_id
  WHERE p.id=?1 AND p.rental_id=?2 AND p.tenancy_id IS ?3
    AND p.status=?4 AND p.urgency=?5 AND p.updated_at=?6
    AND r.archived_at IS NULL AND p.urgency='emergency'
    AND p.status NOT IN ('done','cancelled')
    AND (p.tenancy_id IS NULL OR EXISTS (
      SELECT 1 FROM tenancies t WHERE t.id=p.tenancy_id AND t.rental_id=p.rental_id
    ))
)
