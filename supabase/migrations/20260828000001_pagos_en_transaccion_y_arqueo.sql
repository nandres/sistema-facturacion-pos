-- ============================================================================
-- El arqueo de caja contaba mal el efectivo. Tres formas del mismo error.
--
-- ---------------------------------------------------------------------------
-- EL PROBLEMA
--
-- `cerrar_caja` deducia cuanta plata tenia que haber en el cajon mirando
-- `ventas.tipo_pago`, que es un solo valor por venta:
--
--     SUM(CASE WHEN tipo_pago = 'efectivo' THEN total_pagado ELSE 0 END)
--
-- Eso falla en los tres casos en que el medio de pago no es uno solo, o no es
-- el que dice la columna:
--
-- 1. **Las ventas fiadas inflaban el efectivo esperado.** El CHECK de
--    `ventas.tipo_pago` solo admitia efectivo/tarjeta/transferencia/mixto, asi
--    que una venta a credito se registraba como `'efectivo'` con
--    `monto_recibido = total`. El cajon nunca recibio esa plata: el cliente se
--    la llevo fiada. Al cerrar, el sistema reclamaba un faltante igual a todo
--    lo fiado del turno. En un comercio que fia, esto rompe el arqueo todos
--    los dias.
--
-- 2. **El cheque se contabilizaba como efectivo.** `determinarTipoPago` en el
--    renderer no tenia rama para cheque y caia en el `return 'efectivo'` final.
--    Mismo faltante fantasma.
--
-- 3. **Las ventas mixtas no aportaban NADA al efectivo.** Su total iba entero
--    a `total_mixto` y el efectivo contaba cero, aunque la parte en efectivo
--    estuviera fisicamente en el cajon. Sobrante fantasma, el error inverso.
--
-- El desglose real siempre estuvo en `pagos_venta` --una fila por medio de
-- pago--, pero `cerrar_caja` no la miraba.
--
-- ---------------------------------------------------------------------------
-- Y LOS PAGOS PODIAN NO GUARDARSE
--
-- `pagos_venta` se insertaba desde el servicio, DESPUES de la RPC y fuera de
-- su transaccion. Si ese insert fallaba, el error se escribia en consola y la
-- venta se daba por buena igual, sin desglose. Con `cerrar_caja` leyendo de
-- ahi, una fila perdida pasa a ser plata perdida: por eso los pagos pasan a
-- insertarse dentro de `registrar_venta`, en la misma transaccion que la
-- cabecera, las lineas y el descuento de stock.
--
-- ---------------------------------------------------------------------------
-- LO QUE NO CAMBIA
--
-- Los arqueos ya cerrados no se tocan: quedan con la cuenta vieja. Y las
-- ventas anteriores a esta migracion no tienen filas en `pagos_venta`, asi
-- que el calculo cae de nuevo a `tipo_pago` para ellas. Eso mantiene los
-- numeros historicos como estaban en vez de reescribirlos.
-- ============================================================================

-- ── 1. Los medios que faltaban ──────────────────────────────────────────────
--
-- `credito` es la venta fiada: queda registrada como venta, pero no es plata
-- que entro. `cheque` ya existia en `pagos_venta` y en el selector de la
-- pantalla; lo que faltaba era poder decirlo en la cabecera.

ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ventas_tipo_pago_check;
ALTER TABLE public.ventas ADD CONSTRAINT ventas_tipo_pago_check
    CHECK (tipo_pago = ANY (ARRAY[
        'efectivo'::text, 'tarjeta'::text, 'transferencia'::text,
        'cheque'::text, 'credito'::text, 'mixto'::text
    ]));

ALTER TABLE public.pagos_venta DROP CONSTRAINT IF EXISTS pagos_venta_medio_pago_check;
ALTER TABLE public.pagos_venta ADD CONSTRAINT pagos_venta_medio_pago_check
    CHECK (medio_pago IN ('efectivo', 'tarjeta', 'transferencia', 'cheque', 'credito'));

COMMENT ON COLUMN public.ventas.tipo_pago IS
    'Medio de pago de la venta. `mixto` = mas de uno; el desglose esta en '
    'pagos_venta. `credito` = fiado: no entra plata al cajon.';

-- ── 2. Los pagos se insertan dentro de la transaccion de la venta ───────────

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

    insert into public.ventas (
        total_pagado, monto_recibido, tipo_pago, id_usuario, id_cliente
    ) values (
        v_total_declarado,
        (p_venta->'cabecera'->>'monto_recibido')::numeric(12,0),
        p_venta->'cabecera'->>'tipo_pago',
        nullif(p_venta->'cabecera'->>'id_usuario', '')::bigint,
        nullif(p_venta->'cabecera'->>'id_cliente', '')::bigint
    )
    returning id_venta into v_id_venta;

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

    -- NUEVO: los pagos van acá, no en una llamada posterior. Si esto falla,
    -- la venta entera hace rollback en vez de quedar sin desglose.
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
    'pagos. Errores: P0001 payload inválido, P0002 total inconsistente, '
    'P0003 producto no existe, P0004 stock insuficiente.';

REVOKE ALL ON FUNCTION public.registrar_venta(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_venta(jsonb) TO service_role;

-- ── 3. El arqueo cuenta el efectivo real ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.cerrar_caja(p_id_arqueo bigint, p_fondo_declarado numeric(12,0), p_id_usuario bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_arqueo public.arqueos_caja;
    v_efectivo numeric(12,0) := 0;
    v_tarjeta numeric(12,0) := 0;
    v_transferencia numeric(12,0) := 0;
    v_mixto numeric(12,0) := 0;
    v_total numeric(12,0) := 0;
    v_entradas numeric(12,0) := 0;
    v_retiros numeric(12,0) := 0;
    v_esperado numeric(12,0);
    v_diferencia numeric(12,0);
    v_row public.arqueos_caja;
BEGIN
    SELECT * INTO v_arqueo FROM public.arqueos_caja WHERE id_arqueo = p_id_arqueo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Arqueo no encontrado: %', p_id_arqueo
            USING ERRCODE = 'P0001';
    END IF;
    IF v_arqueo.estado = 'cerrada' THEN
        RAISE EXCEPTION 'La caja % ya está cerrada', p_id_arqueo
            USING ERRCODE = 'P0001';
    END IF;
    IF v_arqueo.id_usuario <> p_id_usuario THEN
        RAISE EXCEPTION 'Esta caja no pertenece al usuario actual'
            USING ERRCODE = 'P0001';
    END IF;

    -- El desglose por medio sale de `pagos_venta`, que es donde esta la
    -- verdad: una fila por medio, asi que una venta mixta aporta a cada
    -- casillero lo que le toca, y una fiada no aporta efectivo.
    --
    -- Las ventas anteriores a esta migracion no tienen filas ahi; para esas
    -- se cae al `tipo_pago` de la cabecera, que era el criterio viejo. Asi
    -- los cierres historicos no cambian de numero.
    WITH ventas_turno AS (
        SELECT v.id_venta, v.tipo_pago, v.total_pagado,
               EXISTS (SELECT 1 FROM public.pagos_venta p WHERE p.id_venta = v.id_venta) AS tiene_pagos
          FROM public.ventas v
         WHERE v.fecha_hora >= v_arqueo.fecha_apertura
           AND v.estado = 'activa'
           AND (v.id_usuario = p_id_usuario OR v.id_usuario IS NULL)
    )
    SELECT
        COALESCE(SUM(CASE
            WHEN t.tiene_pagos THEN (
                SELECT COALESCE(SUM(p.monto), 0) FROM public.pagos_venta p
                 WHERE p.id_venta = t.id_venta AND p.medio_pago = 'efectivo')
            WHEN t.tipo_pago = 'efectivo' THEN t.total_pagado
            ELSE 0 END), 0),
        COALESCE(SUM(CASE
            WHEN t.tiene_pagos THEN (
                SELECT COALESCE(SUM(p.monto), 0) FROM public.pagos_venta p
                 WHERE p.id_venta = t.id_venta AND p.medio_pago = 'tarjeta')
            WHEN t.tipo_pago = 'tarjeta' THEN t.total_pagado
            ELSE 0 END), 0),
        COALESCE(SUM(CASE
            WHEN t.tiene_pagos THEN (
                SELECT COALESCE(SUM(p.monto), 0) FROM public.pagos_venta p
                 WHERE p.id_venta = t.id_venta AND p.medio_pago = 'transferencia')
            WHEN t.tipo_pago = 'transferencia' THEN t.total_pagado
            ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN t.tipo_pago = 'mixto' THEN t.total_pagado ELSE 0 END), 0),
        COALESCE(SUM(t.total_pagado), 0)
    INTO v_efectivo, v_tarjeta, v_transferencia, v_mixto, v_total
    FROM ventas_turno t;

    -- Movimientos manuales del turno: van por id_arqueo, no por fecha.
    SELECT
        COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN monto ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN tipo = 'retirada' THEN monto ELSE 0 END), 0)
    INTO v_entradas, v_retiros
    FROM public.movimientos_caja
    WHERE id_arqueo = p_id_arqueo;

    v_esperado := v_arqueo.fondo_inicial + v_efectivo + v_entradas - v_retiros;
    v_diferencia := p_fondo_declarado - v_esperado;

    UPDATE public.arqueos_caja SET
        fecha_cierre = now(),
        fondo_declarado = p_fondo_declarado,
        total_efectivo = v_efectivo,
        total_tarjeta = v_tarjeta,
        total_transferencia = v_transferencia,
        total_mixto = v_mixto,
        total_ventas = v_total,
        esperado_efectivo = v_esperado,
        diferencia = v_diferencia,
        estado = 'cerrada'
    WHERE id_arqueo = p_id_arqueo
    RETURNING * INTO v_row;

    RETURN row_to_json(v_row)::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_caja(bigint, numeric, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.cerrar_caja(bigint, numeric, bigint) TO service_role;

COMMENT ON FUNCTION public.cerrar_caja(bigint, numeric, bigint) IS
    'Cierra caja validando pertenencia al usuario. El efectivo esperado sale '
    'del desglose real de pagos_venta, no del tipo_pago de la cabecera.';

COMMENT ON COLUMN public.arqueos_caja.total_efectivo IS
    'Efectivo cobrado en el turno, por medio de pago real. Una venta mixta '
    'aporta solo su parte en efectivo; una fiada no aporta nada.';

COMMENT ON COLUMN public.arqueos_caja.total_mixto IS
    'Total de las ventas cobradas con mas de un medio. Es informativo y NO se '
    'suma con los otros casilleros: esas ventas ya estan repartidas en ellos.';
