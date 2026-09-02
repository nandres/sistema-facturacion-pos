-- Agregar columna estado a ventas para soportar anulación lógica
alter table "public"."ventas" add column if not exists "estado" text default 'activa' not null;
comment on column "public"."ventas"."estado" is 'activa | anulada';

-- Función para anular una venta y reponer stock atómicamente
create or replace function public.anular_venta(p_id_venta bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_venta public.ventas;
    v_linea record;
begin
    -- Validar que la venta exista y esté activa
    select * into v_venta from public.ventas where id_venta = p_id_venta;
    if not found then
        raise exception 'Venta no encontrada: %', p_id_venta
            using errcode = 'P0001';
    end if;

    if v_venta.estado = 'anulada' then
        raise exception 'La venta % ya está anulada', p_id_venta
            using errcode = 'P0001';
    end if;

    -- Reponer stock de cada línea
    for v_linea in
        select codigo_barras, cantidad
          from public.detalle_ventas
         where id_venta = p_id_venta
    loop
        update public.productos
           set stock          = stock + v_linea.cantidad,
               actualizado_en = now()
         where codigo_barras = v_linea.codigo_barras;
    end loop;

    -- Marcar venta como anulada
    update public.ventas
       set estado = 'anulada'
     where id_venta = p_id_venta;

    -- Devolver la venta actualizada
    return (select to_jsonb(v.*) from public.ventas v where v.id_venta = p_id_venta);
end;
$$;

comment on function public.anular_venta(bigint) is
    'Anula una venta activa: repone stock y marca estado = anulada';

revoke all on function public.anular_venta(bigint) from public;
grant execute on function public.anular_venta(bigint) to service_role;
