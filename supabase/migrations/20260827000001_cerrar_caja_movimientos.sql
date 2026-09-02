-- cerrar_caja: el esperado en el cajon tiene que contemplar los movimientos
-- manuales del turno.
--
-- Hasta esta migracion la funcion calculaba
--
--     esperado = fondo_inicial + efectivo_ventas
--
-- y nunca leia movimientos_caja, aunque la app viene registrando entradas y
-- retiros de efectivo desde 20260527000003. El resultado es que cualquier
-- turno con un retiro cierra con un faltante inventado del mismo monto: con
-- 500.000 de fondo, 1.250.000 de efectivo vendido y un retiro de 200.000, el
-- cajon tiene 1.550.000, el cajero declara 1.550.000 y el sistema registra
-- 200.000 de faltante contra un esperado de 1.750.000.
--
-- La formula correcta es la que ya usa la pantalla de arqueo:
--
--     esperado = fondo_inicial + efectivo_ventas + entradas - retiros
--
-- Es aditiva: misma firma, mismo tipo de retorno, ningun DROP. Solo cambia el
-- valor de esperado_efectivo y, por arrastre, el de diferencia. Los arqueos ya
-- cerrados no se tocan: quedan con la cuenta vieja.

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

    -- Sumar ventas del usuario desde la apertura
    SELECT
        COALESCE(SUM(CASE WHEN tipo_pago = 'efectivo' THEN total_pagado ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN tipo_pago = 'tarjeta' THEN total_pagado ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN tipo_pago = 'transferencia' THEN total_pagado ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN tipo_pago = 'mixto' THEN total_pagado ELSE 0 END), 0),
        COALESCE(SUM(total_pagado), 0)
    INTO v_efectivo, v_tarjeta, v_transferencia, v_mixto, v_total
    FROM public.ventas
    WHERE fecha_hora >= v_arqueo.fecha_apertura
      AND estado = 'activa'
      AND (id_usuario = p_id_usuario OR id_usuario IS NULL);

    -- Sumar los movimientos manuales del turno. Van por id_arqueo, no por
    -- fecha: son de esta caja y de ninguna otra.
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

-- CREATE OR REPLACE conserva los privilegios, pero se reafirman para que la
-- migracion valga tambien si alguien recrea la funcion a mano.
REVOKE ALL ON FUNCTION public.cerrar_caja(bigint, numeric, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.cerrar_caja(bigint, numeric, bigint) TO service_role;

COMMENT ON FUNCTION public.cerrar_caja(bigint, numeric, bigint) IS
    'Cierra caja validando pertenencia al usuario. El esperado incluye los movimientos del turno.';

COMMENT ON COLUMN public.arqueos_caja.esperado_efectivo IS
    'fondo_inicial + total_efectivo + entradas - retiros de movimientos_caja';
