-- ============================================================================
-- Fase 5, paso 2: qué puede hacer un cajero autenticado (C-01)
--
-- ---------------------------------------------------------------------------
-- LO PRIMERO: SACAR LAS POLITICAS VIEJAS
--
-- `20260525151019_habilitar_rls_y_politicas.sql` dejo 15 politicas
-- `authenticated_*` que permiten SELECT, INSERT y UPDATE sobre `productos`,
-- `ventas`, `detalle_ventas`, `clientes` y `usuarios` a cualquier autenticado.
--
-- En PostgreSQL las politicas de un mismo comando son PERMISIVAS: se evaluan
-- con OR. Agregar una politica restrictiva al lado no restringe nada; mientras
-- una permita, se permite. Cualquier regla nueva que se escriba sin borrar
-- esas 15 es decorativa.
--
-- La peor es `authenticated_update_usuarios`: con el login viejo daba igual
-- --nadie se autenticaba como `authenticated`--, pero en cuanto los cajeros
-- entren por Supabase Auth, esa politica les deja hacer
-- `UPDATE usuarios SET rol='admin' WHERE id_usuario = <el suyo>`. Es el mismo
-- bypass de C-06 por otra puerta.
--
-- ---------------------------------------------------------------------------
-- EL MODELO QUE QUEDA
--
--   * **Leer**: directo, con politica. La caja consulta catalogo, clientes,
--     ventas y arqueos todo el tiempo.
--   * **Escribir**: por funcion, nunca directo. Las RPC son el unico lugar
--     donde se valida que el total cierre, que haya stock o que la devolucion
--     no exceda lo vendido. Con INSERT directo sobre `ventas` todo eso se
--     saltea escribiendo la fila a mano.
--   * Excepcion: `clientes`, porque dar de alta a alguien de fiado en el
--     mostrador es parte del trabajo del cajero.
--
-- ---------------------------------------------------------------------------
-- ADMIN VS CAJERO NO SE SEPARA CON GRANT
--
-- Los dos son el mismo rol de base de datos (`authenticated`): Supabase solo
-- tiene anon, authenticated y service_role. Un `REVOKE ... FROM authenticated`
-- le saca la funcion al administrador tambien.
--
-- La distincion va DENTRO: `exigir_admin()` lee el rol del JWT y corta. Las
-- operaciones de administracion se exponen como funciones `_sesion` que hacen
-- ese chequeo antes de delegar.
--
-- ---------------------------------------------------------------------------
-- DE DONDE SALE EL ROL
--
-- Del JWT. La migracion anterior guardo `rol` e `id_usuario` en
-- `raw_app_meta_data`, que Supabase copia al token. `app_metadata` no lo puede
-- modificar el usuario --a diferencia de `user_metadata`--, asi que sirve para
-- decidir permisos.
-- ============================================================================

-- ── 1. Leer el token ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS text LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb
           -> 'app_metadata' ->> 'rol';
$$;

CREATE OR REPLACE FUNCTION public.id_usuario_actual()
RETURNS bigint LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb
            -> 'app_metadata' ->> 'id_usuario')::bigint;
$$;

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(public.rol_actual() = 'admin', false);
$$;

-- Sin token --service_role, el proceso main de siempre-- no corta: es lo que
-- mantiene andando la instalacion que todavia no migro el login.
CREATE OR REPLACE FUNCTION public.exigir_admin()
RETURNS void LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.rol_actual() IS NOT NULL AND NOT public.es_admin() THEN
        RAISE EXCEPTION 'Esta operación es solo para administradores'
            USING ERRCODE = 'P0007';
    END IF;
END;
$$;

COMMENT ON FUNCTION public.rol_actual() IS
    'Rol del cajero que hizo la peticion, de app_metadata del JWT. NULL con service_role.';

GRANT EXECUTE ON FUNCTION
    public.rol_actual(), public.id_usuario_actual(), public.es_admin(), public.exigir_admin()
    TO authenticated, service_role;

-- ── 2. Barrer las politicas permisivas viejas ───────────────────────────────

DO $$
DECLARE p record; v_n int := 0;
BEGIN
    FOR p IN
        SELECT tablename, policyname FROM pg_policies
         WHERE schemaname = 'public' AND policyname LIKE 'authenticated%'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
        v_n := v_n + 1;
    END LOOP;
    RAISE NOTICE 'Politicas permisivas viejas eliminadas: %', v_n;
END$$;

-- Y los GRANT amplios que venian del snapshot inicial.
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'productos','categorias','envases','proveedores','clientes','usuarios',
        'ventas','detalle_ventas','pagos_venta','detalle_envases_venta',
        'devoluciones','detalle_devoluciones','arqueos_caja','movimientos_caja',
        'compras','detalle_compras','cuentas_pagar','cuentas_recibir','pagos_cliente']
    LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END LOOP;
END$$;

-- ── 3. Lectura ──────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'productos','categorias','envases','proveedores','clientes',
        'ventas','detalle_ventas','pagos_venta','detalle_envases_venta',
        'devoluciones','detalle_devoluciones','arqueos_caja','movimientos_caja',
        'compras','detalle_compras','cuentas_pagar','cuentas_recibir','pagos_cliente']
    LOOP
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'leer_' || t, t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
            'leer_' || t, t);
    END LOOP;
END$$;

-- `usuarios` va aparte: guarda los hashes de contrasena. Solo las columnas que
-- la aplicacion muestra, y nada de escritura.
GRANT SELECT (id_usuario, nombre_empleado, rol, activo, creado_en, auth_user_id)
    ON public.usuarios TO authenticated;

DROP POLICY IF EXISTS leer_usuarios ON public.usuarios;
CREATE POLICY leer_usuarios ON public.usuarios
    FOR SELECT TO authenticated
    USING (activo OR public.es_admin());

-- ── 4. La unica escritura directa: clientes ─────────────────────────────────

GRANT INSERT, UPDATE ON public.clientes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.clientes_id_cliente_seq TO authenticated;

DROP POLICY IF EXISTS alta_clientes ON public.clientes;
CREATE POLICY alta_clientes ON public.clientes
    FOR INSERT TO authenticated
    WITH CHECK (saldo_deudor = 0 OR public.es_admin());

-- El saldo y el limite los mueven registrar_compra_fiado y
-- registrar_amortizacion, que llevan la cuenta. Un cajero que pueda editar
-- `saldo_deudor` puede borrar una deuda.
REVOKE UPDATE ON public.clientes FROM authenticated;
GRANT UPDATE (nombre, ruc, email, telefono, direccion, activo, actualizado_en)
    ON public.clientes TO authenticated;
GRANT UPDATE (limite_credito) ON public.clientes TO authenticated;

DROP POLICY IF EXISTS editar_clientes ON public.clientes;
CREATE POLICY editar_clientes ON public.clientes
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── 5. Catalogo: administradores ────────────────────────────────────────────
--
-- Politicas PERMISIVAS, una por comando.
--
-- El primer intento uso RESTRICTIVE, y estaba mal: una politica restrictiva
-- solo *recorta* lo que otra permitio; no habilita nada por si sola. Sin una
-- permisiva al lado, RLS deniega a todos --incluido el administrador--, y el
-- UPDATE no falla con error sino que afecta cero filas, que es la forma mas
-- silenciosa de romperse.
--
-- Van por comando y no `FOR ALL`, porque `FOR ALL` alcanzaria tambien al
-- SELECT y el cajero necesita leer el catalogo.
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['productos','categorias','proveedores','envases']
    LOOP
        EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admin_alta_' || t, t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
            'WITH CHECK (public.es_admin())', 'admin_alta_' || t, t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admin_edit_' || t, t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
            'USING (public.es_admin()) WITH CHECK (public.es_admin())', 'admin_edit_' || t, t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admin_baja_' || t, t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated '
            'USING (public.es_admin())', 'admin_baja_' || t, t);
    END LOOP;
END$$;

-- Las secuencias que necesita el alta de catalogo.
DO $$
DECLARE sq text;
BEGIN
    FOR sq IN
        SELECT c.relname FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'S'
           AND (c.relname LIKE 'categorias%' OR c.relname LIKE 'proveedores%'
                OR c.relname LIKE 'envases%')
    LOOP
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', sq);
    END LOOP;
END$$;

-- ── 6. Las funciones de escritura ───────────────────────────────────────────
--
-- SECURITY DEFINER: corren con los permisos del dueño, asi que el cajero no
-- necesita escribir en las tablas, solo ejecutar la funcion. Todas tienen
-- `SET search_path` fijo, que es la precaucion que corresponde cuando una
-- funcion corre elevada.

ALTER FUNCTION public.registrar_venta(jsonb)                          SECURITY DEFINER;
ALTER FUNCTION public.anular_venta(bigint)                            SECURITY DEFINER;
ALTER FUNCTION public.crear_devolucion(jsonb)                         SECURITY DEFINER;
ALTER FUNCTION public.registrar_compra(jsonb)                         SECURITY DEFINER;
ALTER FUNCTION public.registrar_compra_fiado(bigint, bigint, numeric) SECURITY DEFINER;
ALTER FUNCTION public.registrar_amortizacion(bigint, numeric)         SECURITY DEFINER;
ALTER FUNCTION public.abrir_caja(numeric, bigint)                     SECURITY DEFINER;
ALTER FUNCTION public.cerrar_caja(bigint, numeric, bigint)            SECURITY DEFINER;

-- Lo que hace un cajero.
GRANT EXECUTE ON FUNCTION
    public.crear_devolucion(jsonb),
    public.registrar_compra_fiado(bigint, bigint, numeric),
    public.registrar_amortizacion(bigint, numeric),
    public.abrir_caja(numeric, bigint),
    public.cerrar_caja(bigint, numeric, bigint)
    TO authenticated;

-- Las crudas quedan fuera de su alcance: se llaman por los envoltorios de
-- abajo, que son los que atan la operacion al token.
REVOKE ALL ON FUNCTION public.registrar_venta(jsonb)   FROM authenticated;
REVOKE ALL ON FUNCTION public.registrar_compra(jsonb)  FROM authenticated;
REVOKE ALL ON FUNCTION public.anular_venta(bigint)     FROM authenticated;

-- ── 7. Envoltorios que atan la operacion a quien la hace ────────────────────

-- La venta se registra a nombre de quien la hizo, no de quien diga el payload.
-- Con service_role daba igual --el main era el unico que llamaba--; con un
-- cajero autenticado, dejar que el cliente elija el id_usuario es dejarle
-- ensuciar el arqueo de otro.
CREATE OR REPLACE FUNCTION public.registrar_venta_sesion(p_venta jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id bigint := public.id_usuario_actual();
BEGIN
    IF v_id IS NOT NULL THEN
        p_venta := jsonb_set(p_venta, '{cabecera,id_usuario}', to_jsonb(v_id), true);
    END IF;
    RETURN public.registrar_venta(p_venta);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_compra_sesion(p_compra jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id bigint := public.id_usuario_actual();
BEGIN
    PERFORM public.exigir_admin();
    IF v_id IS NOT NULL THEN
        p_compra := jsonb_set(p_compra, '{id_usuario}', to_jsonb(v_id), true);
    END IF;
    RETURN public.registrar_compra(p_compra);
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_venta_sesion(p_id_venta bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.exigir_admin();
    RETURN public.anular_venta(p_id_venta);
END;
$$;

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.registrar_venta_sesion(jsonb)',
        'public.registrar_compra_sesion(jsonb)',
        'public.anular_venta_sesion(bigint)']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END$$;

COMMENT ON FUNCTION public.registrar_venta_sesion(jsonb) IS
    'registrar_venta forzando el id_usuario del token. Sin token respeta el del payload.';
COMMENT ON FUNCTION public.registrar_compra_sesion(jsonb) IS
    'registrar_compra solo para administradores. Sin token no corta (service_role).';
COMMENT ON FUNCTION public.anular_venta_sesion(bigint) IS
    'anular_venta solo para administradores. Sin token no corta (service_role).';

-- ── 8. Lo que sigue cerrado ─────────────────────────────────────────────────
--
-- El login pasa por Supabase Auth y el alta de empleados es una operacion del
-- proceso main: ningun cajero necesita estas dos.
REVOKE ALL ON FUNCTION public.verificar_usuario(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.crear_usuario(text, text, text) FROM authenticated;
