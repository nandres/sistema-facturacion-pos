-- ============================================================================
-- Fase 2: cerrar el acceso publico al endpoint REST (C-02)
--
-- Promovido desde supabase/auditoria/02_borrador_cerrar_anon.sql el 2026-08-29,
-- despues de probarlo sobre un PostgreSQL limpio con las 28 migraciones
-- aplicadas. Lo que se verifico ahi, en las dos direcciones:
--
--   * anon queda sin nada: no lee ventas, no lee clientes, no escribe
--     productos, no puede llamar a crear_usuario ni a verificar_usuario.
--   * service_role sigue operando igual: login, lectura de catalogo y de
--     clientes, abrir y cerrar caja, registrar venta, devolucion y compra.
--
-- Si el estado real de la base difiere de lo que declaran las migraciones del
-- repo, contrastar antes con la salida de 01_estado_actual.sql.
--
-- ---------------------------------------------------------------------------
-- EL PROBLEMA
--
-- El snapshot inicial (20260525142906_remote_schema.sql, lineas 508-511) dejo
-- vigente un ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon. Toda
-- tabla creada despues nacio con permiso total para anon, y de las 19 tablas
-- del schema solo 5 tienen RLS. Con la anon key --que es publica por diseno--
-- y la URL del proyecto se leen y se modifican arqueos de caja, compras,
-- pagos y cuentas de fiado desde el REST publico.
--
-- ---------------------------------------------------------------------------
-- QUE HACE
--
--   1. Corta los default privileges, para que ninguna tabla futura vuelva a
--      nacer abierta.
--   2. Revoca lo ya otorgado a anon sobre tablas, secuencias y funciones.
--   3. Habilita RLS en todas las tablas del schema public. Sin politicas para
--      anon ni authenticated, el resultado es denegar por defecto.
--   4. Agrega los indices que necesita la busqueda por nombre en caja.
--
-- ---------------------------------------------------------------------------
-- QUE NO HACE, Y POR QUE
--
-- No separa cajero de administrador. Hoy no se puede: la app se autentica
-- contra la tabla usuarios con la RPC verificar_usuario, no con Supabase Auth,
-- y todas las cajas comparten la misma service_role key, que tiene BYPASSRLS.
-- Sin un JWT por usuario no hay ningun claim sobre el cual discriminar, y una
-- politica que no se puede probar es una politica que no sirve. Esa separacion
-- va en la Fase 5, junto con el cambio de autenticacion.
--
-- ---------------------------------------------------------------------------
-- EFECTO SOBRE LA APP: NINGUNO
--
-- El proceso main entra con service_role, que ignora RLS. Lo que se cierra es
-- la puerta de calle, no la que usa la caja. Igual conviene aplicarlo con el
-- local cerrado y verificar pantalla por pantalla.
--
-- Es aditiva y reversible: no toca datos, no altera columnas, no borra filas.
-- La reversion esta en 03_borrador_revertir.sql.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Cortar la raiz: los privilegios por defecto del schema.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM anon;

-- ---------------------------------------------------------------------------
-- 2. Revocar lo ya otorgado a anon.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE USAGE ON SCHEMA public FROM anon;

-- OJO: revocarle a anon no alcanza para las funciones.
--
-- En PostgreSQL toda funcion nueva nace con EXECUTE otorgado al pseudo-rol
-- PUBLIC, y anon es miembro de PUBLIC: el permiso no esta en anon, se hereda.
-- Un `REVOKE ... FROM anon` deja el GRANT de PUBLIC intacto y la funcion sigue
-- siendo llamable con la anon key. Hay que nombrar PUBLIC explicitamente.
--
-- Esto es lo que dejaba crear_usuario() abierto al REST publico (ver
-- 20260827000002_blindar_funciones_auth.sql, que lo cierra puntualmente para
-- las dos funciones de login). Aca se cierra de raiz, para toda funcion futura
-- que alguien cree sin acordarse del REVOKE.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- Y devolverle a service_role lo que el REVOKE de arriba tambien le sacaria
-- por herencia. service_role es el rol con el que entra el proceso main.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO service_role;

-- authenticated conserva sus GRANT y sus politicas actuales: son la base sobre
-- la que se construye la Fase 5. Con RLS habilitado (paso 3), en las tablas sin
-- politica igual queda denegado.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS en todas las tablas del schema. Idempotente: las 5 que ya lo tienen
--    no cambian.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
         ORDER BY c.relname
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
        RAISE NOTICE 'RLS habilitado en public.%', t.relname;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Indices para la busqueda de caja.
--
--    productoService.buscarProductos hace ilike '%termino%' sobre nombre y
--    codigo_barras. Un ilike con comodin al principio no usa el indice btree
--    ni la PK: hace scan completo. Con trigramas si lo usa, y la respuesta se
--    mantiene instantanea aunque el catalogo crezca.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_productos_nombre_trgm
    ON public.productos USING gin (nombre gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras_trgm
    ON public.productos USING gin (codigo_barras gin_trgm_ops);

-- La caja solo consulta productos activos; el indice parcial es chico y cubre
-- el 100% de las lecturas de venta.
CREATE INDEX IF NOT EXISTS idx_productos_activo
    ON public.productos (nombre)
 WHERE activo;

COMMIT;

-- ============================================================================
-- VERIFICACION POSTERIOR
--
-- 1. Volver a correr 01_estado_actual.sql: la seccion 2_grants_tabla no debe
--    devolver ninguna fila con grantee = 'anon', y 1_rls debe dar "RLS ON" en
--    las 19 tablas.
--
-- 2. Desde afuera, con la anon key del proyecto:
--      curl "https://<proyecto>.supabase.co/rest/v1/arqueos_caja?select=*" \
--           -H "apikey: <anon key>"
--    Antes devolvia los arqueos. Ahora tiene que fallar.
--
-- 3. En la app: abrir caja, escanear, cobrar, imprimir, historial, devolucion,
--    compras, fiado, informes y arqueo. Nada deberia cambiar.
-- ============================================================================
