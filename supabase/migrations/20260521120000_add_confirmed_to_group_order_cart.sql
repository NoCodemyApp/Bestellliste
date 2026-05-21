-- Add confirmed flag to group_order_cart.
--
-- confirmed = false  -> Eintrag liegt im Warenkorb (Area 1 "Warenkorb")
-- confirmed = true   -> Eintrag wurde vom Nutzer der Bestellung hinzugefuegt
--                       (Area 2 "Meine Bestellung"); bleibt editier-/loeschbar
--                       bis group_orders.status = 'closed' bzw. deadline ueberschritten.

alter table public.group_order_cart
  add column if not exists confirmed boolean not null default false;

-- Vorhandene Zeilen explizit als unbestaetigt markieren (Defensive default).
update public.group_order_cart
   set confirmed = false
 where confirmed is null;

create index if not exists group_order_cart_user_go_confirmed_idx
  on public.group_order_cart (user_id, group_order_id, confirmed);
