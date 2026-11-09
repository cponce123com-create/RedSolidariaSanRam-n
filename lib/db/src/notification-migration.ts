// Transactional events: only changes committed in PostgreSQL become public alerts.
// No donor names, contact details or receipts are stored here.
export const notificationMigrationSql = String.raw`
CREATE TABLE IF NOT EXISTS public_notifications (
  id serial PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('campaign', 'donation', 'urgent', 'result')),
  campaign_id integer REFERENCES campaigns(id) ON DELETE CASCADE,
  report_id integer REFERENCES community_reports(id) ON DELETE CASCADE,
  donation_id integer REFERENCES donations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_notifications_recent ON public_notifications (id DESC);

CREATE OR REPLACE FUNCTION capture_campaign_notification() RETURNS trigger AS $$
BEGIN
  IF NEW.is_demo THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      INSERT INTO public_notifications(event_key, kind, campaign_id)
      VALUES ('campaign:' || NEW.id, 'campaign', NEW.id) ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    IF NEW.status = 'active' AND OLD.status = 'draft' THEN
      INSERT INTO public_notifications(event_key, kind, campaign_id)
      VALUES ('campaign:' || NEW.id, 'campaign', NEW.id) ON CONFLICT DO NOTHING;
    ELSIF NEW.status = 'completed' AND OLD.status IN ('active', 'paused') THEN
      INSERT INTO public_notifications(event_key, kind, campaign_id)
      VALUES ('result:' || NEW.id, 'result', NEW.id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS campaign_public_notification ON campaigns;
CREATE TRIGGER campaign_public_notification AFTER INSERT OR UPDATE ON campaigns
FOR EACH ROW EXECUTE FUNCTION capture_campaign_notification();

CREATE OR REPLACE FUNCTION capture_donation_notification() RETURNS trigger AS $$
BEGIN
  IF NEW.status NOT IN ('approved', 'reconciled') THEN
    DELETE FROM public_notifications WHERE donation_id = NEW.id;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('approved', 'reconciled') THEN RETURN NEW; END IF;
  END IF;
  IF NEW.campaign_id IS NOT NULL THEN
    INSERT INTO public_notifications(event_key, kind, campaign_id, donation_id)
    SELECT 'donation:' || NEW.id, 'donation', c.id, NEW.id FROM campaigns c
    WHERE c.id = NEW.campaign_id AND c.status NOT IN ('draft', 'archived') AND NOT c.is_demo
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS donation_public_notification ON donations;
CREATE TRIGGER donation_public_notification AFTER INSERT OR UPDATE ON donations
FOR EACH ROW EXECUTE FUNCTION capture_donation_notification();

CREATE OR REPLACE FUNCTION capture_urgent_notification() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.urgency IN ('high', 'critical') THEN
    INSERT INTO public_notifications(event_key, kind, report_id)
    VALUES ('urgent:' || NEW.id, 'urgent', NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS urgent_public_notification ON community_reports;
CREATE TRIGGER urgent_public_notification AFTER INSERT OR UPDATE ON community_reports
FOR EACH ROW EXECUTE FUNCTION capture_urgent_notification();
`;
