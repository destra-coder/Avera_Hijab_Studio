-- AVERA HIJAB STUDIO — MULTI-PRODUCT DATABASE
-- Target: Supabase PostgreSQL
-- Safe migration approach: keeps the existing public.colors and public.orders tables.
-- Run once in Supabase SQL Editor after creating the Supabase project.
-- IMPORTANT: this schema prepares the database; the existing website APIs must still be
-- upgraded before multi-product checkout and the admin dashboard can work.

begin;

-- ---------------------------------------------------------------------------
-- 0. Legacy colors table (kept temporarily for migration/backward compatibility)
-- ---------------------------------------------------------------------------
create table if not exists public.colors (
  slug text primary key,
  name text not null,
  hex text,
  image text,
  stock integer check (stock is null or stock >= 0),
  active boolean not null default true,
  featured boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed the original 12 pashmina colors only when missing.
-- Existing stock values and manual changes are not overwritten.
insert into public.colors (slug, name, hex, image, featured, sort) values
  ('white',         'White',         '#f7f6f3', '/img/colors/white.jpg',         true,  10),
  ('moss',          'Moss',          '#d6d5cc', '/img/colors/moss.jpg',          false, 20),
  ('jasmine-white', 'Jasmine White', '#efe9dc', '/img/colors/jasmine-white.jpg', true,  30),
  ('soft-blue',     'Soft Blue',     '#b4def3', '/img/colors/soft-blue.jpg',     false, 40),
  ('nude',          'Nude',          '#d7beb4', '/img/colors/nude.jpg',          false, 50),
  ('tempered-grey', 'Tempered Grey', '#a9c6ea', '/img/colors/tempered-grey.jpg', true,  60),
  ('coral',         'Coral',         '#f2b5b8', '/img/colors/coral.jpg',         true,  70),
  ('camille-pink',  'Camille Pink',  '#f1d8ea', '/img/colors/camille-pink.jpg',  false, 80),
  ('peach-beige',   'Peach Beige',   '#e4d3c8', '/img/colors/peach-beige.jpg',   true,  90),
  ('lavender',      'Lavender',      '#f4c9df', '/img/colors/lavender.jpg',      false, 100),
  ('latte',         'Latte',         '#cea29c', '/img/colors/latte.jpg',         false, 110),
  ('black',         'Black',         '#161323', '/img/colors/black.jpg',         false, 120)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Products: one row per hijab type / product model
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  price bigint not null check (price >= 0),
  compare_price bigint,
  cost_price bigint check (cost_price is null or cost_price >= 0),
  weight_gram integer not null default 200 check (weight_gram > 0),
  image text,
  active boolean not null default true,
  featured boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_compare_price_check check (compare_price is null or compare_price >= price)
);
create index if not exists products_active_sort_idx on public.products (active, sort);

-- ---------------------------------------------------------------------------
-- 2. Product variants: colors/options and stock belong to a specific product
-- ---------------------------------------------------------------------------
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  slug text not null,
  sku text unique,
  name text not null,
  color_hex text,
  image text,
  stock integer check (stock is null or stock >= 0),
  active boolean not null default true,
  featured boolean not null default false,
  sort integer not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_product_slug_key unique (product_id, slug)
);
create index if not exists product_variants_product_active_sort_idx
  on public.product_variants (product_id, active, sort);

-- ---------------------------------------------------------------------------
-- 3. Orders: preserve existing order columns and extend them for admin workflow
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  status text not null default 'baru'
    check (status in ('baru','menunggu_pembayaran','dibayar','dikirim','selesai','batal')),
  customer_name text not null,
  customer_phone text not null,
  address text not null,
  destination_id bigint,
  destination_label text,
  note text,
  items jsonb not null default '[]'::jsonb,
  total_qty integer not null check (total_qty > 0),
  subtotal bigint not null check (subtotal >= 0),
  courier text,
  courier_service text,
  shipping_cost bigint check (shipping_cost is null or shipping_cost >= 0),
  shipping_etd text,
  total bigint not null check (total >= 0),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists discount_amount bigint not null default 0 check (discount_amount >= 0);
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_paid_at_idx on public.orders (paid_at desc);

-- ---------------------------------------------------------------------------
-- 4. Order items: immutable product/variant/price/cost snapshots for reporting
-- ---------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  unit_cost bigint check (unit_cost is null or unit_cost >= 0),
  line_total bigint generated always as (quantity * unit_price) stored,
  line_cost bigint generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- 5. Team access: Supabase Auth user + role
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'staff' check (role in ('owner','admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Security-definer helpers avoid recursive RLS checks on admin_users.
create or replace function public.is_active_admin()
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.active = true
  );
$$;

create or replace function public.has_admin_role(required_roles text[])
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
      and au.active = true
      and au.role = any(required_roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists colors_updated_at on public.colors;
create trigger colors_updated_at before update on public.colors
for each row execute function public.set_updated_at();

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists product_variants_updated_at on public.product_variants;
create trigger product_variants_updated_at before update on public.product_variants
for each row execute function public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at before update on public.admin_users
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Migrate the existing Pashmina Avera product and its 12 color variants
-- ---------------------------------------------------------------------------
insert into public.products (slug, name, description, price, compare_price, weight_gram, active, featured, sort)
values ('pashmina-avera', 'Pashmina Avera', 'Pashmina Avera', 59000, 65000, 200, true, true, 10)
on conflict (slug) do update set
  name = excluded.name,
  description = coalesce(public.products.description, excluded.description);
-- Intentionally do not overwrite manually maintained product price, cost, weight, or active state on rerun.

insert into public.product_variants
  (product_id, slug, name, color_hex, image, stock, active, featured, sort)
select p.id, c.slug, c.name, c.hex, c.image, c.stock, c.active, c.featured, c.sort
from public.products p
cross join public.colors c
where p.slug = 'pashmina-avera'
on conflict (product_id, slug) do update set
  name = excluded.name,
  color_hex = excluded.color_hex,
  image = excluded.image,
  active = excluded.active,
  featured = excluded.featured,
  sort = excluded.sort;
-- Stock is deliberately not overwritten on rerun, preserving stock edits in product_variants.

-- ---------------------------------------------------------------------------
-- 8. Row Level Security and grants
-- All customer-facing API calls use the server-side service role.
-- Admin browser sessions may access data only after admin_users membership is verified.
-- ---------------------------------------------------------------------------
alter table public.colors enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.admin_users enable row level security;

revoke all on public.colors, public.products, public.product_variants,
  public.orders, public.order_items, public.admin_users from anon;

-- Authenticated users receive SQL privileges, but RLS limits them to active admins.
grant select, insert, update, delete on public.products, public.product_variants,
  public.orders, public.order_items to authenticated;
grant select on public.admin_users to authenticated;
grant insert, update, delete on public.admin_users to authenticated;

-- Remove named policies first so this script can be rerun.
drop policy if exists admin_manage_products on public.products;
drop policy if exists admin_read_products on public.products;
drop policy if exists manager_manage_products on public.products;
drop policy if exists admin_manage_product_variants on public.product_variants;
drop policy if exists admin_read_product_variants on public.product_variants;
drop policy if exists manager_manage_product_variants on public.product_variants;
drop policy if exists admin_manage_orders on public.orders;
drop policy if exists admin_read_orders on public.orders;
drop policy if exists manager_manage_orders on public.orders;
drop policy if exists admin_manage_order_items on public.order_items;
drop policy if exists admin_read_order_items on public.order_items;
drop policy if exists manager_manage_order_items on public.order_items;
drop policy if exists admin_read_own_or_owner_admin_users on public.admin_users;
drop policy if exists owner_manage_admin_users on public.admin_users;

-- All active team members may view operational data. Only owner/admin can
-- change catalog and financial records directly. Staff changes must go through
-- a server endpoint that validates the requested action and role.
create policy admin_read_products on public.products
for select to authenticated using (public.is_active_admin());
create policy manager_manage_products on public.products
for all to authenticated
using (public.has_admin_role(array['owner','admin']))
with check (public.has_admin_role(array['owner','admin']));

create policy admin_read_product_variants on public.product_variants
for select to authenticated using (public.is_active_admin());
create policy manager_manage_product_variants on public.product_variants
for all to authenticated
using (public.has_admin_role(array['owner','admin']))
with check (public.has_admin_role(array['owner','admin']));

create policy admin_read_orders on public.orders
for select to authenticated using (public.is_active_admin());
create policy manager_manage_orders on public.orders
for all to authenticated
using (public.has_admin_role(array['owner','admin']))
with check (public.has_admin_role(array['owner','admin']));

create policy admin_read_order_items on public.order_items
for select to authenticated using (public.is_active_admin());
create policy manager_manage_order_items on public.order_items
for all to authenticated
using (public.has_admin_role(array['owner','admin']))
with check (public.has_admin_role(array['owner','admin']));

create policy admin_read_own_or_owner_admin_users on public.admin_users
for select to authenticated
using (user_id = auth.uid() or public.has_admin_role(array['owner']));

create policy owner_manage_admin_users on public.admin_users
for all to authenticated
using (public.has_admin_role(array['owner']))
with check (public.has_admin_role(array['owner']));

-- Keep legacy colors inaccessible directly; the server service role can still use it during migration.
revoke all on public.colors from authenticated;


-- ---------------------------------------------------------------------------
-- 10. Inventory movement ledger + atomic stock adjustments (Stage 5)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  movement_type text not null check (movement_type in ('in','out','adjust')),
  quantity integer not null check (quantity > 0),
  stock_before integer,
  stock_after integer,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_created_idx on public.inventory_movements(created_at desc);
create index if not exists inventory_movements_variant_idx on public.inventory_movements(variant_id,created_at desc);
alter table public.inventory_movements enable row level security;
revoke all on public.inventory_movements from anon, authenticated;
grant select on public.inventory_movements to authenticated;
drop policy if exists admin_read_inventory_movements on public.inventory_movements;
create policy admin_read_inventory_movements on public.inventory_movements for select to authenticated using (public.is_active_admin());

create or replace function public.avera_adjust_stock(
 p_variant_id uuid, p_type text, p_quantity integer, p_note text default null, p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v public.product_variants%rowtype; v_before integer; v_after integer;
begin
 if auth.uid() is not null and not public.has_admin_role(array['owner','admin']) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if p_type not in ('in','out','adjust') or p_quantity is null or p_quantity<=0 then
   raise exception 'invalid_movement' using errcode='22023';
 end if;
 select * into v from public.product_variants where id=p_variant_id for update;
 if not found then raise exception 'variant_not_found' using errcode='P0002'; end if;
 if v.stock is null then raise exception 'stock_not_tracked' using errcode='P0001'; end if;
 v_before:=v.stock;
 if p_type='in' then v_after:=v_before+p_quantity;
 elsif p_type='out' then v_after:=v_before-p_quantity;
 else v_after:=p_quantity; end if;
 if v_after<0 then raise exception 'insufficient_stock' using errcode='P0001'; end if;
 update public.product_variants set stock=v_after where id=p_variant_id;
 insert into public.inventory_movements(product_id,variant_id,movement_type,quantity,stock_before,stock_after,note,actor_user_id)
 values(v.product_id,v.id,p_type,p_quantity,v_before,v_after,left(p_note,500),coalesce(p_actor,auth.uid()));
 return jsonb_build_object('variant_id',v.id,'stock_before',v_before,'stock_after',v_after,'movement_type',p_type);
end; $$;
revoke all on function public.avera_adjust_stock(uuid,text,integer,text,uuid) from public,anon;
grant execute on function public.avera_adjust_stock(uuid,text,integer,text,uuid) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- AFTER RUNNING THIS SCRIPT — MANUAL OWNER BOOTSTRAP
-- 1. Create the owner's login in Supabase Dashboard > Authentication > Users.
-- 2. Copy that user's UUID.
-- 3. Run this separately, replacing the UUID and name:
--
-- insert into public.admin_users (user_id, full_name, role, active)
-- values ('PASTE-AUTH-USER-UUID-HERE', 'Avera Owner', 'owner', true);
--
-- 4. Add team members in Supabase Auth, then insert each UUID into admin_users
--    with role 'admin' or 'staff'. Never give the service-role key to team members.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 9. Atomic multi-product checkout: order, line snapshots, and stock deduction
-- This RPC is called only from the server using the Supabase service role.
-- ---------------------------------------------------------------------------
create or replace function public.avera_create_order_atomic(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_stock integer;
  v_product_id uuid;
  v_result jsonb;
begin
  if jsonb_typeof(p_order->'items') <> 'array' or jsonb_array_length(p_order->'items') < 1 then
    raise exception 'empty_order_items' using errcode = 'P0001';
  end if;

  insert into public.orders (
    order_code, customer_name, customer_phone, address, destination_id,
    destination_label, note, items, total_qty, subtotal, courier,
    courier_service, shipping_cost, shipping_etd, total
  ) values (
    p_order->>'order_code', p_order->>'customer_name', p_order->>'customer_phone',
    p_order->>'address', nullif(p_order->>'destination_id','')::bigint,
    p_order->>'destination_label', p_order->>'note', p_order->'items',
    (p_order->>'total_qty')::integer, (p_order->>'subtotal')::bigint,
    p_order->>'courier', p_order->>'courier_service',
    nullif(p_order->>'shipping_cost','')::bigint, p_order->>'shipping_etd',
    (p_order->>'total')::bigint
  ) returning id into v_order_id;


  for v_item in select value from jsonb_array_elements(p_order->'items') loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 then
      raise exception 'invalid_quantity' using errcode = 'P0001';
    end if;

    -- Lock the variant row and verify it still exists and is active.
    select stock into v_stock
    from public.product_variants
    where id = v_variant_id and product_id = v_product_id and active = true
    for update;
    if not found then
      raise exception 'variant_unavailable' using errcode = 'P0001';
    end if;

    -- Finite stock is deducted atomically. NULL means inventory is not tracked.
    if v_stock is not null then
      update public.product_variants
      set stock = stock - v_qty
      where id = v_variant_id and stock >= v_qty;
      if not found then
        raise exception 'insufficient_stock' using errcode = 'P0001';
      end if;
    end if;

    insert into public.order_items (
      order_id, product_id, variant_id, product_name, variant_name, sku,
      quantity, unit_price, unit_cost
    ) values (
      v_order_id, v_product_id, v_variant_id, v_item->>'product_name',
      v_item->>'variant_name', v_item->>'sku', v_qty,
      (v_item->>'unit_price')::bigint, nullif(v_item->>'unit_cost','')::bigint
    );
  end loop;

  return jsonb_build_object('order_id',v_order_id,'order_code',p_order->>'order_code');
end;
$$;


revoke all on function public.avera_create_order_atomic(jsonb) from public, anon, authenticated;
grant execute on function public.avera_create_order_atomic(jsonb) to service_role;


-- AVERA HIJAB STUDIO — Stage 7.1 stability migration
-- Run once in Supabase SQL Editor after the Stage 1–7 schema.
begin;

-- Prevent browser-side direct order writes from bypassing atomic stock/status logic.
revoke insert, update, delete on public.orders from authenticated;
revoke insert, update, delete on public.order_items from authenticated;
drop policy if exists manager_manage_orders on public.orders;
drop policy if exists manager_manage_order_items on public.order_items;

create or replace function public.avera_admin_update_order(
  p_order_id uuid,
  p_action text,
  p_actor uuid,
  p_status text default null,
  p_courier text default null,
  p_courier_service text default null,
  p_tracking_number text default null,
  p_shipping_cost bigint default null,
  p_shipping_etd text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_stock integer;
  v_next text;
begin
  if p_action not in ('status','shipping') then
    raise exception 'invalid_action' using errcode='P0001';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode='P0001'; end if;

  if p_action='shipping' then
    if v_order.status in ('batal','selesai') then
      raise exception 'invalid_transition' using errcode='P0001';
    end if;
    if p_shipping_cost is null or p_shipping_cost < 0 then
      raise exception 'invalid_shipping_cost' using errcode='22023';
    end if;
    if nullif(trim(coalesce(p_courier,'')),'') is null then
      raise exception 'invalid_courier' using errcode='22023';
    end if;
    if nullif(trim(coalesce(p_tracking_number,'')),'') is not null and nullif(trim(coalesce(p_courier,'')),'') is null then
      raise exception 'invalid_courier' using errcode='22023';
    end if;
    update public.orders set
      courier=coalesce(nullif(left(trim(coalesce(p_courier,'')),30),''),courier),
      courier_service=coalesce(nullif(left(trim(coalesce(p_courier_service,'')),40),''),courier_service),
      tracking_number=coalesce(nullif(left(trim(coalesce(p_tracking_number,'')),100),''),tracking_number),
      shipping_cost=p_shipping_cost,
      shipping_etd=coalesce(nullif(left(trim(coalesce(p_shipping_etd,'')),80),''),shipping_etd),
      total=greatest(0,subtotal-discount_amount+coalesce(p_shipping_cost,0))
    where id=p_order_id returning * into v_order;
    return jsonb_build_object('id',v_order.id,'order_code',v_order.order_code,'status',v_order.status,'tracking_number',v_order.tracking_number,'shipping_cost',v_order.shipping_cost,'total',v_order.total);
  end if;

  v_next:=p_status;
  if v_next not in ('baru','menunggu_pembayaran','dibayar','dikirim','selesai','batal') then
    raise exception 'invalid_transition' using errcode='P0001';
  end if;
  if v_next=v_order.status then
    return jsonb_build_object('id',v_order.id,'order_code',v_order.order_code,'status',v_order.status,'tracking_number',v_order.tracking_number);
  end if;
  if not (
    (v_order.status='baru' and v_next in ('menunggu_pembayaran','dibayar','batal')) or
    (v_order.status='menunggu_pembayaran' and v_next in ('dibayar','batal')) or
    (v_order.status='dibayar' and v_next in ('dikirim','batal')) or
    (v_order.status='dikirim' and v_next='selesai')
  ) then
    raise exception 'invalid_transition' using errcode='P0001';
  end if;
  if v_next='dikirim' and (nullif(trim(coalesce(v_order.tracking_number,'')),'') is null or nullif(trim(coalesce(v_order.courier,'')),'') is null) then
    raise exception 'tracking_required' using errcode='P0001';
  end if;
  if v_next='batal' and v_order.status='dikirim' then
    raise exception 'cannot_cancel_shipped' using errcode='P0001';
  end if;

  -- Cancellation restores finite stock exactly once because status transitions are locked
  -- and cancelled orders cannot transition back into an active state.
  if v_next='batal' then
    for v_item in
      select oi.product_id,oi.variant_id,oi.quantity,oi.product_name,oi.variant_name
      from public.order_items oi where oi.order_id=p_order_id and oi.variant_id is not null
    loop
      select stock into v_stock from public.product_variants where id=v_item.variant_id for update;
      if found and v_stock is not null then
        update public.product_variants set stock=stock+v_item.quantity where id=v_item.variant_id;
        insert into public.inventory_movements(product_id,variant_id,movement_type,quantity,stock_before,stock_after,note,actor_user_id)
        values(v_item.product_id,v_item.variant_id,'in',v_item.quantity,v_stock,v_stock+v_item.quantity,
          left('Pengembalian stok pesanan dibatalkan: '||v_order.order_code,500),p_actor);
      end if;
    end loop;
  end if;

  update public.orders set
    status=v_next,
    paid_at=case when v_next='dibayar' then coalesce(paid_at,now()) else paid_at end,
    shipped_at=case when v_next='dikirim' then coalesce(shipped_at,now()) else shipped_at end,
    completed_at=case when v_next='selesai' then coalesce(completed_at,now()) else completed_at end,
    cancelled_at=case when v_next='batal' then coalesce(cancelled_at,now()) else cancelled_at end
  where id=p_order_id returning * into v_order;
  return jsonb_build_object('id',v_order.id,'order_code',v_order.order_code,'status',v_order.status,'paid_at',v_order.paid_at,'shipped_at',v_order.shipped_at,'completed_at',v_order.completed_at,'cancelled_at',v_order.cancelled_at);
end;
$$;

revoke all on function public.avera_admin_update_order(uuid,text,uuid,text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.avera_admin_update_order(uuid,text,uuid,text,text,text,text,bigint,text) to service_role;
commit;

