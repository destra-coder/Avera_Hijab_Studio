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
