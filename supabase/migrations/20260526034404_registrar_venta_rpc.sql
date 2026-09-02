-- Función transaccional para registrar una venta completa:
-- inserta cabecera, líneas y descuenta stock atómicamente.
-- Si cualquier paso falla (stock insuficiente, producto inexistente,
-- total inconsistente), toda la operación hace rollback.
--
-- Payload esperado en p_venta:
-- {
--   "cabecera": {
--     "total_pagado":   numeric,  -- requerido, debe igualar Σ(cantidad*precio)
--     "monto_recibido": numeric,  -- requerido, debe ser >= total_pagado
--     "tipo_pago":      text,     -- 'efectivo'|'tarjeta'|'transferencia'|'mixto'
--     "id_usuario":     bigint?,  -- opcional (NULL = venta sin cajero identificado)
--     "id_cliente":     bigint?   -- opcional (NULL = consumidor final)
--   },
--   "lineas": [
--     { "codigo_barras": text, "cantidad": numeric, "precio_unitario": numeric },
--     ...
--   ]
-- }

create or replace function public.registrar_venta(p_venta jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_id_venta            bigint;
    v_total_declarado     numeric(12,0);
    v_total_calculado     numeric(12,0) := 0;
    v_linea               jsonb;
    v_codigo_barras       text;
    v_cantidad            numeric(10,3);
    v_precio_unitario     numeric(12,0);
    v_stock_actual        numeric(10,3);
    v_lineas_count        int;
    v_resultado           jsonb;
begin
    ------------------------------------------------------------------
    -- 1. Validar estructura mínima del payload
    ------------------------------------------------------------------
    if not (p_venta ? 'cabecera') then
        raise exception 'El payload debe incluir el objeto "cabecera"'
            using errcode = 'P0001';
    end if;

    if not (p_venta ? 'lineas') or jsonb_typeof(p_venta->'lineas') <> 'array' then
        raise exception 'El payload debe incluir el arreglo "lineas"'
            using errcode = 'P0001';
    end if;

    v_lineas_count := jsonb_array_length(p_venta->'lineas');
    if v_lineas_count = 0 then
        raise exception 'La venta debe tener al menos una línea'
            using errcode = 'P0001';
    end if;

    ------------------------------------------------------------------
    -- 2. Defensa en profundidad: recalcular total y compararlo con
    --    el total declarado por el cliente. Si no matchean, abort.
    ------------------------------------------------------------------
    for v_linea in select * from jsonb_array_elements(p_venta->'lineas')
    loop
        v_cantidad        := (v_linea->>'cantidad')::numeric(10,3);
        v_precio_unitario := (v_linea->>'precio_unitario')::numeric(12,0);
        v_total_calculado := v_total_calculado + (v_cantidad * v_precio_unitario);
    end loop;

    v_total_declarado := (p_venta->'cabecera'->>'total_pagado')::numeric(12,0);

    if v_total_calculado <> v_total_declarado then
        raise exception 'Total declarado (%) no coincide con suma de líneas (%)',
                        v_total_declarado, v_total_calculado
            using errcode = 'P0002',
                  hint = 'Recalcular el carrito antes de cobrar';
    end if;

    ------------------------------------------------------------------
    -- 3. Insertar cabecera y obtener id_venta autogenerado
    ------------------------------------------------------------------
    insert into public.ventas (
        total_pagado,
        monto_recibido,
        tipo_pago,
        id_usuario,
        id_cliente
    ) values (
        v_total_declarado,
        (p_venta->'cabecera'->>'monto_recibido')::numeric(12,0),
        p_venta->'cabecera'->>'tipo_pago',
        nullif(p_venta->'cabecera'->>'id_usuario', '')::bigint,
        nullif(p_venta->'cabecera'->>'id_cliente', '')::bigint
    )
    returning id_venta into v_id_venta;

    ------------------------------------------------------------------
    -- 4. Por cada línea: lock producto, validar stock, insertar
    --    detalle y descontar stock. El SELECT FOR UPDATE serializa
    --    ventas concurrentes del mismo producto (anti-oversell).
    ------------------------------------------------------------------
    for v_linea in select * from jsonb_array_elements(p_venta->'lineas')
    loop
        v_codigo_barras   := v_linea->>'codigo_barras';
        v_cantidad        := (v_linea->>'cantidad')::numeric(10,3);
        v_precio_unitario := (v_linea->>'precio_unitario')::numeric(12,0);

        select stock into v_stock_actual
          from public.productos
         where codigo_barras = v_codigo_barras
           for update;

        if not found then
            raise exception 'Producto no encontrado: %', v_codigo_barras
                using errcode = 'P0003';
        end if;

        if v_stock_actual < v_cantidad then
            raise exception 'Stock insuficiente para %: disponible %, requerido %',
                            v_codigo_barras, v_stock_actual, v_cantidad
                using errcode = 'P0004',
                      hint = 'Refrescar stock en pantalla antes de cobrar';
        end if;

        insert into public.detalle_ventas (id_venta, codigo_barras, cantidad, precio_unitario)
        values (v_id_venta, v_codigo_barras, v_cantidad, v_precio_unitario);

        update public.productos
           set stock          = stock - v_cantidad,
               actualizado_en = now()
         where codigo_barras = v_codigo_barras;
    end loop;

    ------------------------------------------------------------------
    -- 5. Construir respuesta: venta + líneas en una sola jsonb.
    ------------------------------------------------------------------
    v_resultado := jsonb_build_object(
        'venta', (
            select to_jsonb(v.*)
              from public.ventas v
             where v.id_venta = v_id_venta
        ),
        'lineas', (
            select coalesce(jsonb_agg(to_jsonb(d.*) order by d.id_detalle), '[]'::jsonb)
              from public.detalle_ventas d
             where d.id_venta = v_id_venta
        )
    );

    return v_resultado;
end;
$$;

comment on function public.registrar_venta(jsonb) is
    'Registra una venta atómicamente: cabecera + líneas + descuento de stock. '
    'Errores: P0001 payload inválido, P0002 total inconsistente, '
    'P0003 producto no existe, P0004 stock insuficiente.';

-- Solo el rol service_role puede invocarla. authenticated/anon quedan bloqueados
-- por defecto (en línea con el modelo de auth actual del proyecto).
revoke all on function public.registrar_venta(jsonb) from public;
grant execute on function public.registrar_venta(jsonb) to service_role;
