-- ============================================================
-- Migration: Sammelbestellung (group_orders)
-- ============================================================

CREATE TABLE IF NOT EXISTS group_orders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id),
  deadline   timestamptz NOT NULL,
  status     text DEFAULT 'open', -- open | closed | sent
  created_at timestamptz DEFAULT now()
);

-- Verknüpfung bestehender orders mit einer Sammelbestellung
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS group_order_id uuid REFERENCES group_orders(id);

-- RLS aktivieren
ALTER TABLE group_orders ENABLE ROW LEVEL SECURITY;

-- Jeder eingeloggte User kann eine Sammelbestellung lesen (für das Banner)
CREATE POLICY "group_orders_select_authenticated"
  ON group_orders FOR SELECT
  USING (auth.role() = 'authenticated');

-- Jeder eingeloggte User kann eine Sammelbestellung erstellen
CREATE POLICY "group_orders_insert_authenticated"
  ON group_orders FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Nur der Ersteller darf status ändern (oder pg_cron via service_role)
CREATE POLICY "group_orders_update_creator"
  ON group_orders FOR UPDATE
  USING (
    created_by = auth.uid()
    OR auth.role() = 'service_role'
  );
