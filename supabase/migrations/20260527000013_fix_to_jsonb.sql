-- Fix: replace to_jsonb(*) with row_to_json()::jsonb in all RPCs
-- Drop all functions that we will redefine
drop function if exists public.abrir_caja(numeric);
drop function if exists public.cerrar_caja(bigint, numeric);
drop function if exists public.obtener_arqueo_abierto();
drop function if exists public.registrar_movimiento_caja(bigint, text, numeric, text);
drop function if exists public.listar_movimientos_caja(bigint);
drop function if exists public.anular_venta(bigint);
drop function if exists public.registrar_venta(numeric, numeric, text, jsonb, bigint, bigint, jsonb);

-- Arqueo: abrir
create or replace function public.abrir_caja(p_fondo_inicial numeric(12,0))
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_existente bigint;
    v_row public.arqueos_caja;
begin
    select id_arqueo into v_existente
      from public.arqueos_caja
     where estado = 'abierta'
     limit 1;
    if v_existente is not null then
        raise exception 'Ya hay una caja abierta (ID: %)', v_existente
            using errcode = 'P0001';
    end if;
    insert into public.arqueos_caja (fondo_inicial)
    values (p_fondo_inicial)
    returning * into v_row;
    return row_to_json(v_row)::jsonb;
end;
$$;

-- Arqueo: cerrar
create or replace function public.cerrar_caja(p_id_arqueo bigint, p_fondo_declarado numeric(12,0))
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_arqueo public.arqueos_caja;
    v_efectivo numeric(12,0) := 0;
    v_tarjeta numeric(12,0) := 0;
    v_transferencia numeric(12,0) := 0;
    v_mixto numeric(12,0) := 0;
    v_total numeric(12,0) := 0;
    v_esperado numeric(12,0);
    v_diferencia numeric(12,0);
    v_row public.arqueos_caja;
begin
    select * into v_arqueo from public.arqueos_caja where id_arqueo = p_id_arqueo;
    if not found then
        raise exception 'Arqueo no encontrado: %', p_id_arqueo using errcode = 'P0001';
    end if;
    if v_arqueo.estado = 'cerrada' then
        raise exception 'La caja % ya está cerrada', p_id_arqueo using errcode = 'P0001';
    end if;
    select
        coalesce(sum(case when tipo_pago = 'efectivo' then total_pagado else 0 end), 0),
        coalesce(sum(case when tipo_pago = 'tarjeta' then total_pagado else 0 end), 0),
        coalesce(sum(case when tipo_pago = 'transferencia' then total_pagado else 0 end), 0),
        coalesce(sum(case when tipo_pago = 'mixto' then total_pagado else 0 end), 0),
        coalesce(sum(total_pagado), 0)
    into v_efectivo, v_tarjeta, v_transferencia, v_mixto, v_total
    from public.ventas
    where fecha_hora >= v_arqueo.fecha_apertura and estado = 'activa';
    v_esperado := v_arqueo.fondo_inicial + v_efectivo;
    v_diferencia := p_fondo_declarado - v_esperado;
    update public.arqueos_caja set
        fecha_cierre = now(), fondo_declarado = p_fondo_declarado,
        total_efectivo = v_efectivo, total_tarjeta = v_tarjeta,
        total_transferencia = v_transferencia, total_mixto = v_mixto,
        total_ventas = v_total, esperado_efectivo = v_esperado,
        diferencia = v_diferencia, estado = 'cerrada'
    where id_arqueo = p_id_arqueo
    returning * into v_row;
    return row_to_json(v_row)::jsonb;
end;
$$;

-- Arqueo: obtener abierto
create or replace function public.obtener_arqueo_abierto()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_row public.arqueos_caja;
begin
    select * into v_row
      from public.arqueos_caja
     where estado = 'abierta'
     limit 1;
    if v_row.id_arqueo is null then return null; end if;
    return row_to_json(v_row)::jsonb;
end;
$$;

-- Movimientos: registrar
create or replace function public.registrar_movimiento_caja(
    p_id_arqueo bigint, p_tipo text, p_monto numeric(12,0), p_concepto text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_row public.movimientos_caja;
begin
    if not exists (select 1 from public.arqueos_caja where id_arqueo = p_id_arqueo and estado = 'abierta') then
        raise exception 'No hay una caja abierta con ID %', p_id_arqueo using errcode = 'P0001';
    end if;
    insert into public.movimientos_caja (id_arqueo, tipo, monto, concepto)
    values (p_id_arqueo, p_tipo, p_monto, p_concepto)
    returning * into v_row;
    return row_to_json(v_row)::jsonb;
end;
$$;

-- Movimientos: listar
create or replace function public.listar_movimientos_caja(p_id_arqueo bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_resultado jsonb;
begin
    select coalesce(jsonb_agg(row_to_json(m.*)::jsonb order by m.fecha), '[]'::jsonb) into v_resultado
    from public.movimientos_caja m
    where m.id_arqueo = p_id_arqueo;
    return v_resultado;
end;
$$;

-- Ventas: anular
create or replace function public.anular_venta(p_id_venta bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_linea record;
    v_row public.ventas;
begin
    select * into v_row from public.ventas where id_venta = p_id_venta;
    if not found then raise exception 'Venta no encontrada' using errcode = 'P0001'; end if;
    if v_row.estado != 'activa' then raise exception 'La venta no está activa' using errcode = 'P0001'; end if;
    for v_linea in select codigo_barras, cantidad from public.detalle_ventas where id_venta = p_id_venta loop
        update public.productos set stock = stock + v_linea.cantidad, actualizado_en = now()
        where codigo_barras = v_linea.codigo_barras;
    end loop;
    update public.ventas set estado = 'anulada' where id_venta = p_id_venta returning * into v_row;
    return row_to_json(v_row)::jsonb;
end;
$$;

-- Registrar venta: main RPC
create or replace function public.registrar_venta(
    p_total_pagado numeric(12,0),
    p_monto_recibido numeric(12,0),
    p_tipo_pago text,
    p_pagos jsonb default '[]',
    p_id_usuario bigint default null,
    p_id_cliente bigint default null,
    p_lineas jsonb default '[]'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_id_venta bigint;
    v_codigo_barras text;
    v_cantidad numeric(10,3);
    v_precio_unitario numeric(12,0);
    v_stock_actual numeric(10,3);
    v_idx int;
    v_elem jsonb;
    v_resultado jsonb;
    v_venta_row public.ventas;
    v_linea_rows jsonb;
begin
    ------------------------------------------------------------------
    -- 1. Validar y crear cabecera
    ------------------------------------------------------------------
    if p_total_pagado is null or p_total_pagado <= 0 then
        raise exception 'Total inválido: %', p_total_pagado using errcode = 'P0001';
    end if;
    if p_monto_recibido < p_total_pagado then
        raise exception 'Monto recibido (%) insuficiente, total (%)',
            p_monto_recibido, p_total_pagado using errcode = 'P0001';
    end if;
    if p_tipo_pago is null then
        raise exception 'tipo_pago es requerido' using errcode = 'P0001';
    end if;

    insert into public.ventas (total_pagado, monto_recibido, tipo_pago, id_usuario, id_cliente)
    values (p_total_pagado, p_monto_recibido, p_tipo_pago, p_id_usuario, p_id_cliente)
    returning * into v_venta_row;

    v_id_venta := v_venta_row.id_venta;

    ------------------------------------------------------------------
    -- 2. Insertar pagos individuales
    ------------------------------------------------------------------
    if p_pagos is not null and jsonb_array_length(p_pagos) > 0 then
        for v_idx in 0..jsonb_array_length(p_pagos) - 1
        loop
            v_elem := p_pagos->v_idx;
            insert into public.pagos_venta (id_venta, medio_pago, monto)
            values (
                v_id_venta,
                (v_elem->>'medio_pago')::text,
                (v_elem->>'monto')::numeric(12,0)
            );
        end loop;
    else
        insert into public.pagos_venta (id_venta, medio_pago, monto)
        values (v_id_venta, 'efectivo', p_monto_recibido);
    end if;

    ------------------------------------------------------------------
    -- 3. Procesar líneas
    ------------------------------------------------------------------
    if p_lineas is null then
        raise exception 'Lineas es requerido' using errcode = 'P0001';
    end if;

    for v_idx in 0..jsonb_array_length(p_lineas) - 1
    loop
        v_elem := p_lineas->v_idx;
        v_codigo_barras   := (v_elem->>'codigo_barras')::text;
        v_cantidad        := (v_elem->>'cantidad')::numeric(10,3);
        v_precio_unitario := (v_elem->>'precio_unitario')::numeric(12,0);

        if v_codigo_barras is null or v_cantidad is null or v_precio_unitario is null then
            raise exception 'Cada linea debe tener codigo_barras, cantidad y precio_unitario'
                using errcode = 'P0001';
        end if;
        if v_cantidad <= 0 then
            raise exception 'Cantidad inválida para %: %', v_codigo_barras, v_cantidad
                using errcode = 'P0001';
        end if;

        select stock into v_stock_actual
          from public.productos
         where codigo_barras = v_codigo_barras;

        if v_stock_actual is null then
            raise exception 'Producto no encontrado: %', v_codigo_barras
                using errcode = 'P0002';
        end if;
        if v_stock_actual <= 0 then
            raise exception 'Stock agotado para % (disponible: %)', v_codigo_barras, v_stock_actual
                using errcode = 'P0004';
        end if;
        if v_stock_actual < v_cantidad then
            raise exception 'Stock insuficiente para % (disponible: %, solicitado: %)',
                v_codigo_barras, v_stock_actual, v_cantidad
                using errcode = 'P0004',
                      hint = 'Refrescar stock en pantalla antes de cobrar';
        end if;

        insert into public.detalle_ventas (id_venta, codigo_barras, cantidad, precio_unitario)
        values (v_id_venta, v_codigo_barras, v_cantidad, v_precio_unitario);

        update public.productos
           set stock = stock - v_cantidad, actualizado_en = now()
         where codigo_barras = v_codigo_barras;
    end loop;

    ------------------------------------------------------------------
    -- 4. Construir respuesta: venta + líneas en una sola jsonb.
    ------------------------------------------------------------------
    select coalesce(jsonb_agg(row_to_json(d.*)::jsonb order by d.id_detalle), '[]'::jsonb) into v_linea_rows
      from public.detalle_ventas d
     where d.id_venta = v_id_venta;

    v_resultado := jsonb_build_object(
        'venta', row_to_json(v_venta_row)::jsonb,
        'lineas', v_linea_rows
    );

    return v_resultado;
end;
$$;

-- Re-grants
grant execute on function public.abrir_caja(numeric) to service_role;
grant execute on function public.cerrar_caja(bigint, numeric) to service_role;
grant execute on function public.obtener_arqueo_abierto() to service_role;
grant execute on function public.registrar_movimiento_caja(bigint, text, numeric, text) to service_role;
grant execute on function public.listar_movimientos_caja(bigint) to service_role;
grant execute on function public.anular_venta(bigint) to service_role;
grant execute on function public.registrar_venta(
    numeric, numeric, text, jsonb, bigint, bigint, jsonb
) to service_role;
