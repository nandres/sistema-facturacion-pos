-- ============================================================================
-- CRITICO — Blindar las funciones de autenticacion.
--
-- ---------------------------------------------------------------------------
-- EL PROBLEMA
--
-- 20260527000009_usuarios_auth.sql creo verificar_usuario() y crear_usuario()
-- y nunca les revoco EXECUTE. En PostgreSQL una funcion nueva nace con
-- EXECUTE otorgado al pseudo-rol PUBLIC, y anon es miembro de PUBLIC. Son las
-- dos unicas funciones del proyecto sin REVOKE: todas las demas (registrar_venta,
-- abrir_caja, cerrar_caja, anular_venta, registrar_movimiento_caja,
-- listar_movimientos_caja, obtener_arqueo_abierto) lo tienen explicito.
--
-- Consecuencia, con la anon key --que es publica por diseno y viaja en
-- cualquier cliente-- y la URL del proyecto:
--
--   POST /rest/v1/rpc/crear_usuario
--   {"p_nombre":"atacante","p_password":"...","p_rol":"admin"}
--
-- devolvia un usuario administrador recien creado. Es un bypass completo de
-- autenticacion, sin tocar la app ni la PC de la caja. Y con
--
--   POST /rest/v1/rpc/verificar_usuario
--
-- se podian probar credenciales a ritmo de red, sin pasar por la pantalla de
-- login y sin dejar rastro en la aplicacion.
--
-- Ademas las dos son SECURITY DEFINER **sin SET search_path**. Una funcion
-- definer con search_path mutable es la via clasica de escalada: quien pueda
-- crear objetos en algun schema del path puede hacer sombra a `crypt` o a
-- `usuarios` y ejecutar codigo propio con los privilegios del dueno de la
-- funcion. El resto de las funciones del repo ya fija search_path; estas dos
-- quedaron afuera.
--
-- ---------------------------------------------------------------------------
-- QUE HACE
--
--   1. Recrea las dos funciones con SET search_path = public, pg_temp.
--   2. Revoca EXECUTE a PUBLIC, anon y authenticated.
--      REVOKE ... FROM anon NO alcanza: el permiso esta en PUBLIC, y anon lo
--      hereda. Hay que nombrar PUBLIC explicitamente.
--   3. Se lo otorga solo a service_role, que es con lo que entra el proceso
--      main de la aplicacion.
--   4. Sube el costo de bcrypt de 6 (el default de gen_salt) a 12 para las
--      contrasenas nuevas. Las existentes siguen validando igual: crypt()
--      lee el costo del propio hash almacenado.
--
-- Aditiva y sin perdida de datos: no toca la tabla usuarios, no borra filas,
-- no altera columnas. Solo cambia definiciones de funcion y privilegios.
--
-- ---------------------------------------------------------------------------
-- EFECTO SOBRE LA APP: NINGUNO
--
-- El login entra por el proceso main con service_role. Lo que se cierra es el
-- acceso desde el REST publico.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. verificar_usuario — login
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verificar_usuario(p_nombre TEXT, p_password TEXT)
RETURNS TABLE(id_usuario BIGINT, nombre_empleado TEXT, rol TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id_usuario, u.nombre_empleado, u.rol
  FROM public.usuarios u
  WHERE u.nombre_empleado = p_nombre
    AND u.contrasena_encriptada = crypt(p_password, u.contrasena_encriptada);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. crear_usuario — alta de cajeros y administradores
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_usuario(p_nombre TEXT, p_password TEXT, p_rol TEXT DEFAULT 'cajero')
RETURNS TABLE(id_usuario BIGINT, nombre_empleado TEXT, rol TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.usuarios (nombre_empleado, contrasena_encriptada, rol)
  VALUES (p_nombre, crypt(p_password, gen_salt('bf', 12)), p_rol)
  RETURNING usuarios.id_usuario, usuarios.nombre_empleado, usuarios.rol;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Privilegios. PUBLIC va nombrado explicitamente: es donde estaba el
--    permiso, y revocarselo solo a anon no lo saca.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.verificar_usuario(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verificar_usuario(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.verificar_usuario(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_usuario(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.crear_usuario(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crear_usuario(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.crear_usuario(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.crear_usuario(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.verificar_usuario(TEXT, TEXT) IS
    'Login del POS. Solo service_role. Verifica bcrypt contra usuarios.contrasena_encriptada.';
COMMENT ON FUNCTION public.crear_usuario(TEXT, TEXT, TEXT) IS
    'Alta de usuario con bcrypt cost 12. Solo service_role: nunca debe ser alcanzable desde el REST publico.';

COMMIT;

-- ============================================================================
-- VERIFICACION POSTERIOR
--
-- 1. Que ya no queden privilegios para PUBLIC / anon / authenticated:
--
--      SELECT p.proname, p.proacl
--        FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname IN ('verificar_usuario','crear_usuario');
--
--    En proacl no debe aparecer "=X/" (que es PUBLIC) ni anon ni authenticated.
--
-- 2. Que search_path quede fijado:
--
--      SELECT proname, proconfig FROM pg_proc
--       WHERE proname IN ('verificar_usuario','crear_usuario');
--
--    proconfig debe decir {"search_path=public, pg_temp"}.
--
-- 3. Desde afuera, con la anon key del proyecto, esto tiene que fallar:
--
--      curl -X POST "https://<proyecto>.supabase.co/rest/v1/rpc/crear_usuario" \
--           -H "apikey: <anon key>" -H "Content-Type: application/json" \
--           -d '{"p_nombre":"prueba","p_password":"x","p_rol":"admin"}'
--
-- 4. En la app: iniciar sesion con un usuario existente. Tiene que entrar
--    igual que siempre.
-- ============================================================================
