// Transactional outbox: only committed public content can be sent to Facebook.
// Installing this migration does not enqueue pre-existing content.
export const facebookMigrationSql = String.raw`
CREATE TABLE IF NOT EXISTS facebook_publications (
  id serial PRIMARY KEY,
  source_type text NOT NULL,
  source_id integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  page_id text,
  post_id text,
  post_url text,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facebook_publications_source_unique UNIQUE(source_type, source_id),
  CONSTRAINT facebook_publications_source_check CHECK(source_type IN ('news', 'campaign')),
  CONSTRAINT facebook_publications_status_check CHECK(status IN ('pending','processing','published','failed','uncertain','cancelled'))
);
CREATE INDEX IF NOT EXISTS facebook_publications_pending_idx ON facebook_publications(status, next_attempt_at);

CREATE OR REPLACE FUNCTION enqueue_facebook_publication(kind text, content_id integer) RETURNS void AS $$
BEGIN
  INSERT INTO facebook_publications(source_type, source_id) VALUES(kind, content_id)
  ON CONFLICT (source_type, source_id) DO UPDATE
    SET status='pending', next_attempt_at=now(), updated_at=now(), last_error=NULL
    WHERE facebook_publications.status='cancelled' AND facebook_publications.post_id IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION capture_news_facebook_publication() RETURNS trigger AS $$
BEGIN
  PERFORM enqueue_facebook_publication('news', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS news_facebook_publication ON news;
CREATE TRIGGER news_facebook_publication AFTER INSERT OR UPDATE ON news
FOR EACH ROW EXECUTE FUNCTION capture_news_facebook_publication();

CREATE OR REPLACE FUNCTION capture_campaign_facebook_publication() RETURNS trigger AS $$
BEGIN
  IF NEW.status='active' AND NOT coalesce(NEW.is_demo, false) THEN
    PERFORM enqueue_facebook_publication('campaign', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS campaign_facebook_publication ON campaigns;
CREATE TRIGGER campaign_facebook_publication AFTER INSERT OR UPDATE OF status, is_demo ON campaigns
FOR EACH ROW EXECUTE FUNCTION capture_campaign_facebook_publication();
`;
