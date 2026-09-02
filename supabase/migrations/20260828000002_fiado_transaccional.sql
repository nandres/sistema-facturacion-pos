-- ============================================================================
-- La cuenta corriente se actualizaba con un read-modify-write desde el cliente.
--
-- ---------------------------------------------------------------------------
-- EL PROBLEMA
--
-- `registrarCompraFiado` y `registrarAmortizacion` hacian, desde el proceso
-- main, tres viajes sueltos a la base:
--
--     1. INSERT en pagos_cliente
--     2. SELECT saldo_deudor
--     3. UPDATE saldo_deudor = <lo leido> ± monto
--
-- Tres fallas distintas salen de ahi:
--
-- 1. **Se pierden movimientos.** Dos operaciones sobre el mismo cliente que se
--    solapan leen el mismo saldo y la segunda pisa a la primera. Con dos cajas
--    abiertas --que es el caso de uso del sistema-- una compra fiada puede
--    desaparecer del saldo sin dejar rastro, aunque quede su fila en
--    `pagos_cliente`.
--
-- 2. **El movimiento puede quedar sin impactar el saldo.** Si el UPDATE falla
--    despues del INSERT, la compra queda registrada y el cliente debe plata
--    que el sistema no le cuenta. No hay transaccion que lo revierta.
--
-- 3. **Cliente inexistente pasaba en silencio.** El codigo hacia
--    `if (cliente) { ...actualizar... }` sin `else`: con un id que no existe,
--    el INSERT quedaba hecho, el saldo nunca se tocaba y la funcion devolvia
--    exito.
--
-- Las dos operaciones pasan a ser funciones transaccionales, con el saldo
-- actualizado por expresion --`saldo_deudor + monto`, resuelto por la base con
-- la fila bloqueada-- en vez de por un valor leido antes.
--
-- ---------------------------------------------------------------------------
-- EL LIMITE DE CREDITO, TAMBIEN EN LA BASE
--
-- La pantalla ya no deja fiar por encima del disponible, pero esa validacion
-- mira un saldo que leyo antes: dos ventas simultaneas pueden pasarla las dos
-- y dejar al cliente por encima del limite. Se revalida acá, con la fila
-- bloqueada, que es el unico lugar donde la respuesta no puede quedar vieja.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_compra_fiado(
    p_id_cliente bigint,
    p_id_venta   bigint,
    p_monto      numeric(12,0)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_limite  numeric(12,0);
    v_saldo   numeric(12,0);
    v_nuevo   numeric(12,0);
BEGIN
    IF p_monto <= 0 THEN
        RAISE EXCEPTION 'El monto de la compra a crédito debe ser mayor que cero'
            USING ERRCODE = 'P0001';
    END IF;

    -- FOR UPDATE: el resto de las operaciones sobre este cliente esperan acá.
    SELECT limite_credito, saldo_deudor INTO v_limite, v_saldo
      FROM public.clientes
     WHERE id_cliente = p_id_cliente
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente no encontrado: %', p_id_cliente
            USING ERRCODE = 'P0001';
    END IF;

    v_nuevo := v_saldo + p_monto;

    IF v_nuevo > v_limite THEN
        RAISE EXCEPTION 'La compra supera el límite de crédito: disponible %, requerido %',
                        (v_limite - v_saldo), p_monto
            USING ERRCODE = 'P0005',
                  HINT = 'Cobrar al contado o ampliar el límite del cliente';
    END IF;

    INSERT INTO public.pagos_cliente (id_cliente, id_venta, monto, concepto)
    VALUES (p_id_cliente, p_id_venta, p_monto, 'Compra a crédito');

    UPDATE public.clientes
       SET saldo_deudor = v_nuevo
     WHERE id_cliente = p_id_cliente;

    RETURN jsonb_build_object(
        'id_cliente', p_id_cliente,
        'saldo_deudor', v_nuevo,
        'disponible', v_limite - v_nuevo
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_amortizacion(
    p_id_cliente bigint,
    p_monto      numeric(12,0)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_limite numeric(12,0);
    v_saldo  numeric(12,0);
    v_nuevo  numeric(12,0);
BEGIN
    IF p_monto <= 0 THEN
        RAISE EXCEPTION 'El monto de la amortización debe ser mayor que cero'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT limite_credito, saldo_deudor INTO v_limite, v_saldo
      FROM public.clientes
     WHERE id_cliente = p_id_cliente
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente no encontrado: %', p_id_cliente
            USING ERRCODE = 'P0001';
    END IF;

    -- Piso en cero, como hacía el código que reemplaza: pagar de más no deja
    -- al cliente con saldo a favor, que es un concepto que el sistema no tiene.
    v_nuevo := GREATEST(0, v_saldo - p_monto);

    INSERT INTO public.pagos_cliente (id_cliente, monto, concepto)
    VALUES (p_id_cliente, p_monto, 'Amortización de deuda');

    UPDATE public.clientes
       SET saldo_deudor = v_nuevo
     WHERE id_cliente = p_id_cliente;

    RETURN jsonb_build_object(
        'id_cliente', p_id_cliente,
        'saldo_deudor', v_nuevo,
        'disponible', v_limite - v_nuevo
    );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_compra_fiado(bigint, bigint, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_compra_fiado(bigint, bigint, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.registrar_amortizacion(bigint, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_amortizacion(bigint, numeric) TO service_role;

COMMENT ON FUNCTION public.registrar_compra_fiado(bigint, bigint, numeric) IS
    'Carga una compra a la cuenta corriente y actualiza el saldo en una sola '
    'transacción, con la fila del cliente bloqueada. P0005 = supera el límite.';

COMMENT ON FUNCTION public.registrar_amortizacion(bigint, numeric) IS
    'Registra un pago del cliente y descuenta el saldo en una sola transacción.';
