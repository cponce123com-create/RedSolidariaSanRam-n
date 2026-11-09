export const facebookContentMigrationSql = String.raw`
ALTER TABLE facebook_publications DROP CONSTRAINT IF EXISTS facebook_publications_source_check;
ALTER TABLE facebook_publications ADD CONSTRAINT facebook_publications_source_check
  CHECK(source_type IN ('news','campaign','donation','pet','report','update','campaign_result'));
ALTER TABLE facebook_publications DROP CONSTRAINT IF EXISTS facebook_publications_status_check;
ALTER TABLE facebook_publications ADD CONSTRAINT facebook_publications_status_check
  CHECK(status IN ('pending','pending_v2','processing','published','failed','uncertain','cancelled'));

-- Old instances only claim 'pending'. New kinds stay invisible to old workers
-- during a rolling deployment, so a donation ID cannot be treated as a campaign.
CREATE OR REPLACE FUNCTION enqueue_facebook_publication(kind text, content_id integer) RETURNS void AS $$
BEGIN
  INSERT INTO facebook_publications(source_type, source_id, status)
    VALUES(kind, content_id, CASE WHEN kind IN ('news','campaign') THEN 'pending' ELSE 'pending_v2' END)
  ON CONFLICT (source_type, source_id) DO UPDATE
    SET status=EXCLUDED.status, next_attempt_at=now(), updated_at=now(), last_error=NULL
    WHERE facebook_publications.status='cancelled' AND facebook_publications.post_id IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION capture_donation_facebook_publication() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('approved','reconciled')
    AND ((NEW.collaboration_type='dinero' AND NEW.amount>0 AND NEW.fulfillment_status<>'rechazada_cancelada')
      OR (NEW.collaboration_type IN ('productos','servicios','logistica') AND NEW.fulfillment_status='verificada'))
    AND (NEW.campaign_id IS NULL OR EXISTS(SELECT 1 FROM campaigns c WHERE c.id=NEW.campaign_id
      AND c.status IN ('active','paused','completed') AND NOT coalesce(c.is_demo,false))) THEN
    PERFORM enqueue_facebook_publication('donation',NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS donation_facebook_publication ON donations;
CREATE TRIGGER donation_facebook_publication AFTER INSERT OR UPDATE OF status, fulfillment_status ON donations
FOR EACH ROW EXECUTE FUNCTION capture_donation_facebook_publication();

CREATE OR REPLACE FUNCTION capture_pet_facebook_publication() RETURNS trigger AS $$
BEGIN
  IF NEW.status='available' THEN PERFORM enqueue_facebook_publication('pet',NEW.id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS pet_facebook_publication ON pets;
CREATE TRIGGER pet_facebook_publication AFTER INSERT OR UPDATE OF status, name, description, photos ON pets
FOR EACH ROW EXECUTE FUNCTION capture_pet_facebook_publication();

CREATE OR REPLACE FUNCTION capture_report_facebook_publication() RETURNS trigger AS $$
BEGIN
  IF NEW.status='approved' THEN PERFORM enqueue_facebook_publication('report',NEW.id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS report_facebook_publication ON community_reports;
CREATE TRIGGER report_facebook_publication AFTER INSERT OR UPDATE OF status, title, description, photos ON community_reports
FOR EACH ROW EXECUTE FUNCTION capture_report_facebook_publication();

CREATE OR REPLACE FUNCTION capture_update_facebook_publication() RETURNS trigger AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM campaigns c WHERE c.id=NEW.campaign_id AND c.status IN ('active','paused','completed') AND NOT coalesce(c.is_demo,false)) THEN
    PERFORM enqueue_facebook_publication('update',NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_facebook_publication ON campaign_updates;
CREATE TRIGGER update_facebook_publication AFTER INSERT OR UPDATE ON campaign_updates
FOR EACH ROW EXECUTE FUNCTION capture_update_facebook_publication();

CREATE OR REPLACE FUNCTION capture_campaign_facebook_publication() RETURNS trigger AS $$
BEGIN
  IF NOT coalesce(NEW.is_demo,false) THEN
    IF NEW.status='active' THEN PERFORM enqueue_facebook_publication('campaign',NEW.id);
    ELSIF NEW.status='completed' THEN PERFORM enqueue_facebook_publication('campaign_result',NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;
