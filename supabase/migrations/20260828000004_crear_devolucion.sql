-- ============================================================================
-- Las devoluciones se hacian con cuatro operaciones sueltas y sin validar nada.
--
-- ---------------------------------------------------------------------------
-- EL PROBLEMA
--
-- `crearDevolucion` insertaba la cabecera, insertaba el detalle, reponia el
-- stock y --si se devolvia todo-- marcaba la venta como anulada. Cuatro viajes
-- independientes, sin transaccion: una falla a la mitad dejaba una devolucion
-- registrada sin reponer stock, o stock repuesto sin devolucion.
--
-- 1. **La reposicion de stock tenia tres estrategias en cascada, y las dos
--    primeras no podian funcionar.** Llamaba a `incrementar_stock`, que
--    **nunca existio** en ninguna migracion; al fallar, intentaba
--    `update({ stock: supabase.rpc('increment', ...) })`, que pasa un objeto
--    de consulta como valor de columna y estaba silenciado con `as any`; recien
--    el tercero --leer el stock y volver a escribirlo-- hacia el trabajo. O
--    sea: funcionaba de casualidad, por el ultimo recurso, y con un
--    read-modify-write que dos devoluciones simultaneas del mismo producto se
--    pisan entre si.
--
-- 2. **Si los tres fallaban, nadie se enteraba.** El ultimo recurso no miraba
--    el error y el `if (prod)` no tenia `else`: la devolucion quedaba
--    registrada, el stock sin reponer, y la funcion devolvia exito.
--
-- 3. **No se validaba cuanto se estaba devolviendo.** Las lineas venian del
--    renderer y nada impedia devolver mas unidades de las vendidas, ni
--    devolver dos veces lo mismo. Cada devolucion de mas inflaba el stock con
--    mercaderia que no existe.
--
-- 4. **La anulacion se hacia con un UPDATE directo** sobre `ventas`, salteando
--    `anular_venta`. Por eso una venta fiada devuelta por completo quedaba
--    anulada con la deuda intacta en la cuenta corriente.
--
-- ---------------------------------------------------------------------------
-- COMO QUEDA
--
-- Una sola funcion transaccional: valida, inserta, repone stock con la fila
-- bloqueada y, si se devolvio todo, delega en `anular_venta` --que ademas
-- revierte la cuenta corriente--. O pasa todo, o no pasa nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.crear_devolucion(p_devolucion jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_venta      bigint;
    v_venta         public.ventas;
    v_id_devolucion bigint;
    v_total         numeric(12,0) := 0;
    v_linea         jsonb;
    v_codigo        text;
    v_cantidad      numeric(10,3);
    v_precio        numeric(12,0);
    v_vendido       numeric(10,3);
    v_ya_devuelto   numeric(10,3);
    v_pendiente     numeric(10,3);
    v_todo          boolean;
BEGIN
    v_id_venta := (p_devolucion->>'id_venta')::bigint;

    IF NOT (p_devolucion ? 'lineas')
       OR jsonb_typeof(p_devolucion->'lineas') <> 'array'
       OR jsonb_array_length(p_devolucion->'lineas') = 0 THEN
        RAISE EXCEPTION 'La devolución debe tener al menos una línea'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_venta FROM public.ventas WHERE id_venta = v_id_venta;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta no encontrada: %', v_id_venta
            USING ERRCODE = 'P0001';
    END IF;
    IF v_venta.estado = 'anulada' THEN
        RAISE EXCEPTION 'La venta % está anulada: no admite devoluciones', v_id_venta
            USING ERRCODE = 'P0001';
    END IF;

    -- Cabecera. El total se recalcula acá y no se toma del cliente.
    FOR v_linea IN SELECT * FROM jsonb_array_elements(p_devolucion->'lineas')
    LOOP
        v_total := v_total
                 + (v_linea->>'cantidad')::numeric(10,3)
                 * (v_linea->>'precio_unitario')::numeric(12,0);
    END LOOP;

    INSERT INTO public.devoluciones (id_venta, id_usuario, motivo, total_devuelto)
    VALUES (
        v_id_venta,
        nullif(p_devolucion->>'id_usuario', '')::bigint,
        nullif(p_devolucion->>'motivo', ''),
        v_total
    )
    RETURNING id_devolucion INTO v_id_devolucion;

    FOR v_linea IN SELECT * FROM jsonb_array_elements(p_devolucion->'lineas')
    LOOP
        v_codigo   := v_linea->>'codigo_barras';
        v_cantidad := (v_linea->>'cantidad')::numeric(10,3);
        v_precio   := (v_linea->>'precio_unitario')::numeric(12,0);

        IF v_cantidad <= 0 THEN
            RAISE EXCEPTION 'La cantidad devuelta de % debe ser mayor que cero', v_codigo
                USING ERRCODE = 'P0001';
        END IF;

        -- Cuanto se vendio de este producto en esta venta.
        SELECT COALESCE(SUM(d.cantidad), 0) INTO v_vendido
          FROM public.detalle_ventas d
         WHERE d.id_venta = v_id_venta AND d.codigo_barras = v_codigo;

        IF v_vendido = 0 THEN
            RAISE EXCEPTION 'El producto % no está en la venta %', v_codigo, v_id_venta
                USING ERRCODE = 'P0006';
        END IF;

        -- Cuanto ya se habia devuelto antes (esta devolucion no cuenta: su
        -- detalle todavia no se inserto).
        SELECT COALESCE(SUM(dd.cantidad), 0) INTO v_ya_devuelto
          FROM public.detalle_devoluciones dd
          JOIN public.devoluciones dv ON dv.id_devolucion = dd.id_devolucion
         WHERE dv.id_venta = v_id_venta
           AND dd.codigo_barras = v_codigo
           AND dv.id_devolucion <> v_id_devolucion;

        v_pendiente := v_vendido - v_ya_devuelto;

        IF v_cantidad > v_pendiente THEN
            RAISE EXCEPTION 'Se intenta devolver % de %, pero solo quedan % sin devolver',
                            v_cantidad, v_codigo, v_pendiente
                USING ERRCODE = 'P0006',
                      HINT = 'Revisar las devoluciones anteriores de esta venta';
        END IF;

        INSERT INTO public.detalle_devoluciones
            (id_devolucion, codigo_barras, cantidad, precio_unitario)
        VALUES (v_id_devolucion, v_codigo, v_cantidad, v_precio);

        -- Con la fila bloqueada, y sumando por expresión: dos devoluciones del
        -- mismo producto ya no se pisan.
        PERFORM 1 FROM public.productos WHERE codigo_barras = v_codigo FOR UPDATE;

        UPDATE public.productos
           SET stock = stock + v_cantidad,
               actualizado_en = now()
         WHERE codigo_barras = v_codigo;
    END LOOP;

    -- ¿Quedó algo sin devolver en toda la venta?
    SELECT NOT EXISTS (
        SELECT 1
          FROM (
              SELECT d.codigo_barras, SUM(d.cantidad) AS vendido
                FROM public.detalle_ventas d
               WHERE d.id_venta = v_id_venta
               GROUP BY d.codigo_barras
          ) v
          LEFT JOIN (
              SELECT dd.codigo_barras, SUM(dd.cantidad) AS devuelto
                FROM public.detalle_devoluciones dd
                JOIN public.devoluciones dv ON dv.id_devolucion = dd.id_devolucion
               WHERE dv.id_venta = v_id_venta
               GROUP BY dd.codigo_barras
          ) r ON r.codigo_barras = v.codigo_barras
         WHERE COALESCE(r.devuelto, 0) < v.vendido
    ) INTO v_todo;

    -- Si se devolvió todo, la venta se anula por la función que corresponde:
    -- ahí es donde además se revierte la cuenta corriente si estaba fiada.
    -- `anular_venta` repone stock, así que se descuenta de nuevo lo que esta
    -- devolución ya repuso; si no, entraría dos veces.
    IF v_todo THEN
        FOR v_linea IN SELECT * FROM jsonb_array_elements(p_devolucion->'lineas')
        LOOP
            UPDATE public.productos
               SET stock = stock - (v_linea->>'cantidad')::numeric(10,3)
             WHERE codigo_barras = v_linea->>'codigo_barras';
        END LOOP;

        PERFORM public.anular_venta(v_id_venta);
    END IF;

    RETURN jsonb_build_object(
        'id_devolucion', v_id_devolucion,
        'total_devuelto', v_total,
        'venta_anulada', v_todo
    );
END;
$$;

COMMENT ON FUNCTION public.crear_devolucion(jsonb) IS
    'Registra una devolución en una transacción: valida contra lo vendido y lo '
    'ya devuelto, repone stock y anula la venta si se devolvió todo. '
    'P0001 payload/venta inválida, P0006 cantidad devuelta inconsistente.';

REVOKE ALL ON FUNCTION public.crear_devolucion(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.crear_devolucion(jsonb) TO service_role;
