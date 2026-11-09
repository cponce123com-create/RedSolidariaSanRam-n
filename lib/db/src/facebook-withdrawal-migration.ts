/** Cancel only safe, unsent jobs; preserve published and ambiguous outcomes for review. */
export const facebookWithdrawalMigrationSql = String.raw`
CREATE OR REPLACE FUNCTION cancel_withdrawn_donation_facebook() RETURNS trigger AS $$
BEGIN
  IF NEW.status NOT IN ('approved','reconciled') OR NEW.fulfillment_status='rechazada_cancelada'
    OR (NEW.collaboration_type<>'dinero' AND NEW.fulfillment_status<>'verificada') THEN
    UPDATE facebook_publications SET status='cancelled',updated_at=now(),
      last_error='El aporte se anuló, rechazó o retiró antes de publicarse. No se enviará a Facebook.'
      WHERE source_type='donation' AND source_id=NEW.id AND post_id IS NULL
        AND status IN ('pending','pending_v2','failed');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS donation_facebook_withdrawal ON donations;
CREATE TRIGGER donation_facebook_withdrawal AFTER UPDATE OF status,fulfillment_status ON donations
FOR EACH ROW EXECUTE FUNCTION cancel_withdrawn_donation_facebook();
-- Repair safe unsent jobs withdrawn before this deployment; never touch accounting or accepted/ambiguous posts.
UPDATE facebook_publications fp SET status='cancelled',updated_at=now(),
  last_error='El aporte se anuló, rechazó o retiró antes de publicarse. No se enviará a Facebook.'
FROM donations d WHERE fp.source_type='donation' AND fp.source_id=d.id AND fp.post_id IS NULL
  AND fp.status IN ('pending','pending_v2','failed')
  AND (d.status NOT IN ('approved','reconciled') OR d.fulfillment_status='rechazada_cancelada'
    OR (d.collaboration_type<>'dinero' AND d.fulfillment_status<>'verificada'));
`;
