-- ============================================================
-- MIGRATION: group_order_cart
-- Zweck: Temporärer Warenkorb für Sammelbestellungen.
--        Verhält sich wie cart_items, ist aber an eine
--        group_order (inkl. Deadline) gebunden.
--        Nach Deadline-Ablauf werden die Items automatisch
--        per pg_cron in order_items verschoben.
--
-- HINWEIS: group_orders.id ist uuid (nicht bigint)!
-- ============================================================

-- 1. Tabelle erstellen
create table if not exists public.group_order_cart (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  group_order_id    uuid        not null references public.group_orders(id) on delete cascade,
  product_id        bigint      not null references public.products(id) on delete cascade,
  quantity          int         not null default 1 check (quantity >= 1),
  clothing_size_id  bigint      references public.sizes_clothing(id) on delete set null,
  weight_size_id    bigint      references public.sizes_weight(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, group_order_id, product_id, clothing_size_id, weight_size_id)
);

-- 2. updated_at Trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_group_order_cart_updated_at on public.group_order_cart;
create trigger trg_group_order_cart_updated_at
  before update on public.group_order_cart
  for each row execute function public.set_updated_at();

-- 3. Indizes
create index if not exists idx_goc_user_go
  on public.group_order_cart (user_id, group_order_id);

create index if not exists idx_goc_group_order
  on public.group_order_cart (group_order_id);

-- 4. Row Level Security
alter table public.group_order_cart enable row level security;

create policy "goc_select_own"
  on public.group_order_cart for select
  using (user_id = auth.uid());

create policy "goc_insert_own"
  on public.group_order_cart for insert
  with check (user_id = auth.uid());

create policy "goc_update_own"
  on public.group_order_cart for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "goc_delete_own"
  on public.group_order_cart for delete
  using (user_id = auth.uid());

-- ============================================================
-- 5. Flush-Funktion: group_order_cart → order_items
--    Wird per pg_cron alle 5 Minuten nach Deadline ausgeführt.
-- ============================================================
create or replace function public.flush_expired_group_order_carts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r_go   record;
  r_user record;
  v_order_id bigint;
begin
  for r_go in
    select distinct goc.group_order_id
    from   group_order_cart goc
    join   group_orders go on go.id = goc.group_order_id
    where  go.deadline < now()
  loop
    for r_user in
      select distinct user_id
      from   group_order_cart
      where  group_order_id = r_go.group_order_id
    loop
      select id into v_order_id
      from   orders
      where  user_id        = r_user.user_id
        and  group_order_id = r_go.group_order_id
        and  status         = 'submitted'
      limit 1;

      if v_order_id is null then
        insert into orders (user_id, group_order_id, status)
        values (r_user.user_id, r_go.group_order_id, 'submitted')
        returning id into v_order_id;
      end if;

      insert into order_items (
        order_id, product_id, product_name, product_sku,
        quantity, unit_price_netto,
        clothing_size_id, weight_size_id, size_label
      )
      select
        v_order_id,
        goc.product_id,
        p.name,
        p.sku,
        goc.quantity,
        coalesce(p.price_netto, 0),
        goc.clothing_size_id,
        goc.weight_size_id,
        coalesce(sc.code, sw.code)
      from  group_order_cart goc
      join  products         p  on p.id  = goc.product_id
      left join sizes_clothing sc on sc.id = goc.clothing_size_id
      left join sizes_weight   sw on sw.id = goc.weight_size_id
      where goc.user_id        = r_user.user_id
        and goc.group_order_id = r_go.group_order_id
      on conflict do nothing;

      delete from group_order_cart
      where user_id        = r_user.user_id
        and group_order_id = r_go.group_order_id;
    end loop;
  end loop;
end;
$$;

-- ============================================================
-- 6. pg_cron Job (alle 5 Minuten)
--    Voraussetzung: pg_cron unter Database → Extensions aktivieren.
-- ============================================================
select cron.schedule(
  'flush-expired-go-carts',
  '*/5 * * * *',
  $$select public.flush_expired_group_order_carts()$$
);
