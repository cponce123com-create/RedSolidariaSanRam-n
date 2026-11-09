export const notificationFeedSql = String.raw`
      WITH visible AS (
        SELECT n.*, c.title AS campaign_title
        FROM public_notifications n
        LEFT JOIN campaigns c ON c.id = n.campaign_id
        LEFT JOIN community_reports r ON r.id = n.report_id
        LEFT JOIN donations d ON d.id = n.donation_id
        WHERE n.created_at >= now() - interval '90 days'
          AND ((n.kind = 'urgent' AND r.status = 'approved' AND r.urgency IN ('high', 'critical'))
            OR (n.kind <> 'urgent' AND c.status NOT IN ('draft', 'archived') AND NOT c.is_demo
              AND (n.kind <> 'donation' OR (d.status IN ('approved', 'reconciled') AND d.campaign_id = c.id))))
          AND (n.kind <> 'result' OR c.status = 'completed')
      ), grouped AS (
        SELECT max(id) AS id, kind, campaign_id,
          CASE WHEN kind = 'donation' THEN 'donation:' || campaign_id || ':' || date_trunc('hour', max(created_at) AT TIME ZONE 'UTC')::text
            ELSE min(event_key) END AS key,
          max(campaign_title) AS campaign_title, count(*)::int AS count,
          max(created_at) AS created_at
        FROM visible
        GROUP BY kind, campaign_id,
          CASE WHEN kind = 'donation' THEN date_trunc('hour', created_at AT TIME ZONE 'UTC')::text ELSE event_key END
      )
      SELECT * FROM grouped WHERE id > $1 ORDER BY id DESC LIMIT 100
    `;
