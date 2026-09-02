-- Aislar datos por usuario en compras y arqueos_caja
-- La tabla ventas ya tiene id_usuario (opcional) desde registrar_venta_rpc

-- 1. Agregar columna id_usuario a compras
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS id_usuario bigint;
ALTER TABLE public.compras ADD CONSTRAINT compras_id_usuario_fkey
    FOREIGN KEY (id_usuario) REFERENCES public.usuarios (id_usuario);

-- 2. Agregar columna id_usuario a arqueos_caja
ALTER TABLE public.arqueos_caja ADD COLUMN IF NOT EXISTS id_usuario bigint;
ALTER TABLE public.arqueos_caja ADD CONSTRAINT arqueos_caja_id_usuario_fkey
    FOREIGN KEY (id_usuario) REFERENCES public.usuarios (id_usuario);

-- 3. Modificar abrir_caja para aceptar id_usuario
DROP FUNCTION IF EXISTS public.abrir_caja(numeric);
CREATE OR REPLACE FUNCTION public.abrir_caja(p_fondo_inicial numeric(12,0), p_id_usuario bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existente bigint;
    v_row public.arqueos_caja;
BEGIN
    -- Verificar que no haya una caja abierta para este usuario
    SELECT id_arqueo INTO v_existente
      FROM public.arqueos_caja
     WHERE estado = 'abierta' AND id_usuario = p_id_usuario
     LIMIT 1;
    IF v_existente IS NOT NULL THEN
        RAISE EXCEPTION 'Ya hay una caja abierta (ID: %)', v_existente
            USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.arqueos_caja (fondo_inicial, id_usuario)
    VALUES (p_fondo_inicial, p_id_usuario)
    RETURNING * INTO v_row;

    RETURN row_to_json(v_row)::jsonb;
END;
$$;

-- 4. Modificar cerrar_caja para validar id_usuario
DROP FUNCTION IF EXISTS public.cerrar_caja(bigint, numeric);
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

    v_esperado := v_arqueo.fondo_inicial + v_efectivo;
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

-- 5. Modificar obtener_arqueo_abierto para filtrar por usuario
DROP FUNCTION IF EXISTS public.obtener_arqueo_abierto();
CREATE OR REPLACE FUNCTION public.obtener_arqueo_abierto(p_id_usuario bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.arqueos_caja;
BEGIN
    SELECT * INTO v_row
      FROM public.arqueos_caja
     WHERE estado = 'abierta' AND id_usuario = p_id_usuario
     LIMIT 1;

    IF v_row.id_arqueo IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN row_to_json(v_row)::jsonb;
END;
$$;

-- 6. Actualizar grants para las nuevas firmas de funciones
REVOKE ALL ON FUNCTION public.abrir_caja(numeric, bigint) FROM public;
REVOKE ALL ON FUNCTION public.cerrar_caja(bigint, numeric, bigint) FROM public;
REVOKE ALL ON FUNCTION public.obtener_arqueo_abierto(bigint) FROM public;

GRANT EXECUTE ON FUNCTION public.abrir_caja(numeric, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_caja(bigint, numeric, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_arqueo_abierto(bigint) TO service_role;

COMMENT ON FUNCTION public.abrir_caja(numeric, bigint) IS 'Abre caja para un usuario específico';
COMMENT ON FUNCTION public.cerrar_caja(bigint, numeric, bigint) IS 'Cierra caja validando pertenencia al usuario';
COMMENT ON FUNCTION public.obtener_arqueo_abierto(bigint) IS 'Retorna el arqueo abierto del usuario';
