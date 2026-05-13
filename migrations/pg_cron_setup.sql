-- ============================================================
-- pg_cron Setup: Deadline-Überwachung für Sammelbestellungen
-- ============================================================
-- Voraussetzung: pg_cron Extension muss im Supabase Dashboard
-- unter Database → Extensions aktiviert sein.
-- Die http Extension wird ebenfalls benötigt.
-- ============================================================

-- 1. Extensions sicherstellen
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- 2. Hilfsfunktion: abgelaufene Sammelbestellungen schließen
--    und die Edge Function per HTTP-Call auslösen
CREATE OR REPLACE FUNCTION close_expired_group_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  go_record RECORD;
  payload   text;
BEGIN
  -- Alle offenen Sammelbestellungen mit abgelaufener Deadline holen
  FOR go_record IN
    SELECT id
    FROM group_orders
    WHERE status = 'open'
      AND deadline < now()
  LOOP
    -- Status auf 'closed' setzen
    UPDATE group_orders
       SET status = 'closed'
     WHERE id = go_record.id;

    -- Edge Function aufrufen (HTTP-Extension)
    -- Ersetze <dein-projekt> mit deiner Supabase-Projekt-URL
    payload := json_build_object('group_order_id', go_record.id)::text;

    PERFORM http_post(
      'https://fniweelbmnsrdmotkmzu.supabase.co/functions/v1/resend-group-email',
      payload,
      'application/json'
    );
  END LOOP;
END;
$$;

-- 3. pg_cron Job: stündlich prüfen
--    Syntax: '0 * * * *'  = jede Stunde zur vollen Stunde
SELECT cron.schedule(
  'close-expired-group-orders',   -- Job-Name (eindeutig)
  '0 * * * *',                    -- Cron-Ausdruck: stündlich
  'SELECT close_expired_group_orders();'
);

-- Zum Entfernen des Jobs (falls nötig):
-- SELECT cron.unschedule('close-expired-group-orders');
