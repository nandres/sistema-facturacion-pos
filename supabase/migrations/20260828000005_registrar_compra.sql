-- ============================================================================
-- La compra a proveedor entraba en tres pasos sueltos.
--
-- ---------------------------------------------------------------------------
-- EL PROBLEMA
--
-- `registrarCompra` insertaba la cabecera, insertaba el detalle y despues
-- recorria las lineas actualizando el stock. Sin transaccion, y con el mismo
-- read-modify-write que ya se corrigio en la cuenta corriente:
--
--     SELECT stock ... ; UPDATE productos SET stock = <lo leido> + cantidad
--
-- Tres consecuencias:
--
-- 1. **Se pierde mercaderia entre operaciones que se solapan.** Una compra y
--    una venta del mismo producto al mismo tiempo leen el mismo stock y la
--    ultima escribe sobre la otra. `registrar_venta` ya se protegia con
--    `SELECT ... FOR UPDATE`; la compra no, asi que el faltante aparecia
--    igual, del otro lado.
--
-- 2. **El detalle podia quedar sin impactar el stock.** Si el UPDATE fallaba,
--    nadie lo miraba --el resultado no se chequeaba-- y la compra quedaba
--    registrada con la mercaderia sin ingresar.
--
-- 3. **Un producto inexistente pasaba en silencio.** El `if (prod)` no tenia
--    `else`: si el codigo de barras no estaba en el catalogo, la linea entraba
--    en `detalle_compras`, el stock no se movia y la funcion devolvia exito.
--
-- ---------------------------------------------------------------------------
-- COMO QUEDA
--
-- Una sola transaccion, con la fila del producto bloqueada y el stock sumado
-- por expresion. El producto tiene que existir: si no, la compra entera se
-- revierte con un error que dice cual es el codigo.
--
-- El precio de costo se sigue pisando con el de la compra --es el criterio que
-- ya tenia el sistema: vale el ultimo que se pago-- y ahora se actualiza en el
-- mismo UPDATE que el stock.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_compra(p_compra jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_compra bigint;
    v_total     numeric(12,0) := 0;
    v_linea     jsonb;
    v_codigo    text;
    v_cantidad  numeric(10,3);
    v_costo     numeric(12,0);
    v_existe    boolean;
BEGIN
    IF NOT (p_compra ? 'lineas')
       OR jsonb_typeof(p_compra->'lineas') <> 'array'
       OR jsonb_array_length(p_compra->'lineas') = 0 THEN
        RAISE EXCEPTION 'La compra debe tener al menos una línea'
            USING ERRCODE = 'P0001';
    END IF;

    -- El total se recalcula acá y no se toma del cliente.
    FOR v_linea IN SELECT * FROM jsonb_array_elements(p_compra->'lineas')
    LOOP
        v_total := v_total + round(
            (v_linea->>'cantidad')::numeric(10,3)
            * (v_linea->>'precio_costo')::numeric(12,0)
        );
    END LOOP;

    INSERT INTO public.compras (id_proveedor, factura_numero, total, id_usuario)
    VALUES (
        nullif(p_compra->>'id_proveedor', '')::bigint,
        nullif(p_compra->>'factura_numero', ''),
        v_total,
        nullif(p_compra->>'id_usuario', '')::bigint
    )
    RETURNING id_compra INTO v_id_compra;

    FOR v_linea IN SELECT * FROM jsonb_array_elements(p_compra->'lineas')
    LOOP
        v_codigo   := v_linea->>'codigo_barras';
        v_cantidad := (v_linea->>'cantidad')::numeric(10,3);
        v_costo    := (v_linea->>'precio_costo')::numeric(12,0);

        IF v_cantidad <= 0 THEN
            RAISE EXCEPTION 'La cantidad comprada de % debe ser mayor que cero', v_codigo
                USING ERRCODE = 'P0001';
        END IF;

        SELECT true INTO v_existe
          FROM public.productos
         WHERE codigo_barras = v_codigo
           FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_codigo
                USING ERRCODE = 'P0003',
                      HINT = 'Dar de alta el producto antes de cargar la compra';
        END IF;

        INSERT INTO public.detalle_compras (id_compra, codigo_barras, cantidad, precio_costo)
        VALUES (v_id_compra, v_codigo, v_cantidad, v_costo);

        UPDATE public.productos
           SET stock          = stock + v_cantidad,
               precio_costo   = v_costo,
               actualizado_en = now()
         WHERE codigo_barras = v_codigo;
    END LOOP;

    RETURN (SELECT to_jsonb(c.*) FROM public.compras c WHERE c.id_compra = v_id_compra);
END;
$$;

COMMENT ON FUNCTION public.registrar_compra(jsonb) IS
    'Registra una compra a proveedor en una transacción: cabecera, detalle e '
    'ingreso de stock con la fila bloqueada. P0003 = producto inexistente.';

REVOKE ALL ON FUNCTION public.registrar_compra(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_compra(jsonb) TO service_role;
