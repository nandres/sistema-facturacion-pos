-- ============================================================================
-- El reintento de una venta offline podia registrarla dos veces.
--
-- ---------------------------------------------------------------------------
-- EL PROBLEMA
--
-- La caja vende sin conexion por diseno: las ventas se encolan en
-- `offline-cache.json` y se reintentan hasta cinco veces cuando vuelve la red.
-- `registrar_venta` no tenia forma de reconocer una venta que ya habia
-- registrado: sin restriccion unica, sin referencia externa, sin nada.
--
-- El modo de falla no es exotico, es *exactamente* como falla una conexion
-- intermitente: la transaccion se confirma en el servidor y la respuesta se
-- pierde en el camino de vuelta. El cliente ve un error, deja la venta en la
-- cola, y en el proximo intento la manda de nuevo. Resultado:
--
--   * la venta queda duplicada,
--   * el stock se descuenta dos veces,
--   * y el arqueo del turno reclama plata que nunca entro al cajon.
--
-- ---------------------------------------------------------------------------
-- LA CORRECCION
--
-- Una `referencia_externa` opcional en la cabecera del payload. El cliente ya
-- genera un `idTemp` (uuid) al encolar la venta, asi que la referencia existe
-- desde antes: solo faltaba mandarla y que la base la mirara.
--
--   * Si la venta llega con referencia y ya hay una con esa referencia, se
--     devuelve la que existe. No se inserta nada, no se toca stock.
--   * Si no llega con referencia --toda venta normal, en linea-- el
--     comportamiento es identico al de siempre.
--
-- El indice unico parcial es lo que hace que esto aguante dos reintentos
-- simultaneos: si los dos pasan la consulta previa, el segundo choca contra el
-- indice y el bloque `exception` devuelve la venta del primero en vez de
-- fallar. Sin el indice, la consulta previa sola es una condicion de carrera.
--
-- ---------------------------------------------------------------------------
-- EFECTO SOBRE LAS VENTAS YA REGISTRADAS
--
-- Ninguno. La columna nace NULL para las filas existentes y el indice unico es
-- parcial (`WHERE referencia_externa IS NOT NULL`), asi que admite tantos NULL
-- como haga falta. Es aditivo: no hay DROP ni ALTER COLUMN sobre datos.
-- ============================================================================

-- ── 1. La columna y el indice ───────────────────────────────────────────────

ALTER TABLE public.ventas
    ADD COLUMN IF NOT EXISTS referencia_externa text;

COMMENT ON COLUMN public.ventas.referencia_externa IS
    'Identificador que trae el cliente para que un reintento no duplique la '
    'venta. Hoy lo llena la cola offline con su idTemp. NULL en las ventas '
    'en linea, que no se reintentan.';

CREATE UNIQUE INDEX IF NOT EXISTS ventas_referencia_externa_uniq
    ON public.ventas (referencia_externa)
    WHERE referencia_externa IS NOT NULL;

-- ── 2. registrar_venta, con la referencia ───────────────────────────────────
--
-- Mismo cuerpo que en `20260828000001`, con tres agregados marcados NUEVO.
-- CREATE OR REPLACE: misma firma, sin DROP, para no invalidar los GRANT ni la
-- funcion `registrar_venta_sesion` que la envuelve.

CREATE OR REPLACE FUNCTION public.registrar_venta(p_venta jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
declare
    v_id_venta            bigint;
    v_total_declarado     numeric(12,0);
    v_total_calculado     numeric(12,0) := 0;
    v_linea               jsonb;
    v_pago                jsonb;
    v_codigo_barras       text;
    v_cantidad            numeric(10,3);
    v_precio_unitario     numeric(12,0);
    v_stock_actual        numeric(10,3);
    v_lineas_count        int;
    v_resultado           jsonb;
    v_ref                 text;    -- NUEVO
    v_ya_existia          boolean := false;  -- NUEVO
begin
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

    -- NUEVO: si esta venta ya se registro, se devuelve la que existe.
    --
    -- Va antes de cualquier escritura y antes de revalidar el total: para un
    -- reintento el total ya se valido cuando la venta entro la primera vez, y
    -- lo que corresponde es devolver lo que hay, no volver a juzgarlo.
    v_ref := nullif(p_venta->'cabecera'->>'referencia_externa', '');

    if v_ref is not null then
        select id_venta into v_id_venta
          from public.ventas
         where referencia_externa = v_ref;
        v_ya_existia := found;
    end if;

    if not v_ya_existia then
        -- Defensa en profundidad: recalcular el total y compararlo con el
        -- declarado por el cliente.
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

        -- NUEVO: el bloque `exception` cubre la carrera de dos reintentos
        -- simultaneos. Es la primera escritura de la funcion, asi que si el
        -- indice rechaza el insert no queda nada a medio hacer: la
        -- subtransaccion revierte solo esta sentencia.
        begin
            insert into public.ventas (
                total_pagado, monto_recibido, tipo_pago, id_usuario, id_cliente,
                referencia_externa
            ) values (
                v_total_declarado,
                (p_venta->'cabecera'->>'monto_recibido')::numeric(12,0),
                p_venta->'cabecera'->>'tipo_pago',
                nullif(p_venta->'cabecera'->>'id_usuario', '')::bigint,
                nullif(p_venta->'cabecera'->>'id_cliente', '')::bigint,
                v_ref
            )
            returning id_venta into v_id_venta;
        exception when unique_violation then
            select id_venta into v_id_venta
              from public.ventas
             where referencia_externa = v_ref;
            if not found then
                -- No fue la referencia: que suba, porque es otra cosa.
                raise;
            end if;
            v_ya_existia := true;
        end;
    end if;

    if not v_ya_existia then
        -- Lock por producto: serializa ventas concurrentes del mismo articulo.
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

        -- Los pagos van acá, no en una llamada posterior. Si esto falla, la
        -- venta entera hace rollback en vez de quedar sin desglose.
        if p_venta->'cabecera' ? 'pagos'
           and jsonb_typeof(p_venta->'cabecera'->'pagos') = 'array' then
            for v_pago in select * from jsonb_array_elements(p_venta->'cabecera'->'pagos')
            loop
                if (v_pago->>'monto')::numeric(12,0) > 0 then
                    insert into public.pagos_venta (id_venta, medio_pago, monto)
                    values (
                        v_id_venta,
                        v_pago->>'medio_pago',
                        (v_pago->>'monto')::numeric(12,0)
                    );
                end if;
            end loop;
        end if;
    end if;

    -- La respuesta es la misma se haya insertado ahora o hace una hora: el
    -- cliente no tiene que distinguir un alta de un reintento.
    v_resultado := jsonb_build_object(
        'venta', (
            select to_jsonb(v.*) from public.ventas v where v.id_venta = v_id_venta
        ),
        'lineas', (
            select coalesce(jsonb_agg(to_jsonb(d.*) order by d.id_detalle), '[]'::jsonb)
              from public.detalle_ventas d where d.id_venta = v_id_venta
        )
    );

    return v_resultado;
end;
$$;

COMMENT ON FUNCTION public.registrar_venta(jsonb) IS
    'Registra una venta atómicamente: cabecera + líneas + descuento de stock + '
    'pagos. Idempotente si el payload trae cabecera.referencia_externa: una '
    'segunda llamada con la misma referencia devuelve la venta ya registrada '
    'sin volver a descontar stock. Errores: P0001 payload inválido, P0002 '
    'total inconsistente, P0003 producto inexistente, P0004 stock insuficiente.';

-- ── 3. Verificación ─────────────────────────────────────────────────────────
--
-- Con el local cerrado, en el SQL Editor:
--
--   -- 1. Un alta normal, con referencia.
--   select public.registrar_venta('{
--     "cabecera": {"total_pagado": 1000, "monto_recibido": 1000,
--                  "tipo_pago": "efectivo", "pagos": [],
--                  "referencia_externa": "prueba-idem-1"},
--     "lineas": [{"codigo_barras": "<uno real>", "cantidad": 1,
--                 "precio_unitario": 1000}]
--   }'::jsonb);
--
--   -- 2. La misma llamada otra vez. Tiene que devolver el MISMO id_venta.
--   --    Y el stock del producto no puede haber bajado una segunda vez.
--
--   -- 3. Limpieza:
--   --    delete from public.ventas where referencia_externa = 'prueba-idem-1';
--
-- En la app: cortar la conexión, cobrar una venta, reconectar y dejar que
-- sincronice. Tiene que aparecer una sola vez en el historial.
