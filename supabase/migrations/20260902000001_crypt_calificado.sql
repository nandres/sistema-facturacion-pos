-- ============================================================================
-- El blindaje de C-06 rompio el login.
--
-- ---------------------------------------------------------------------------
-- EL SINTOMA
--
--     [ipc.usuarios.autenticar] {
--       code: '42883',
--       hint: 'No function matches the given name and argument types.',
--       message: 'function crypt(text, text) does not exist'
--     }
--
-- Nadie puede entrar al sistema. Empezo el 2026-08-29, cuando se aplico
-- `20260827000002_blindar_funciones_auth.sql`.
--
-- ---------------------------------------------------------------------------
-- LA CAUSA
--
-- Esa migracion hizo lo correcto --fijar `search_path` en dos funciones
-- SECURITY DEFINER que no lo tenian-- pero lo fijo a:
--
--     SET search_path = public, pg_temp
--
-- y en Supabase **pgcrypto no vive en `public`**: vive en `extensions`. Lo dice
-- el propio snapshot inicial del esquema:
--
--     20260525142906_remote_schema.sql:27
--     CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
--
-- Al fijar el path sin `extensions`, `crypt` y `gen_salt` dejaron de ser
-- visibles desde adentro de las funciones. El SQL era correcto y la base ya no
-- encontraba a que apuntaba.
--
-- Es el costo tipico de fijar un `search_path`: deja de funcionar todo lo que
-- se apoyaba en que el path trajera algo. Aca eran las dos funciones de
-- autenticacion, que son justo las que no se pueden probar sin intentar entrar.
--
-- ---------------------------------------------------------------------------
-- LA CORRECCION, Y POR QUE NO ES AGREGAR `extensions` AL PATH
--
-- La salida facil seria `SET search_path = public, extensions, pg_temp`. No se
-- hace, por dos razones:
--
--   1. `public` seguiria yendo **primero**. Quien pudiera crear una funcion
--      `public.crypt(text, text)` volveria a hacerle sombra a la de pgcrypto,
--      que es exactamente el ataque que C-06 vino a cerrar. Hoy no es
--      explotable --desde C-02 nadie tiene CREATE sobre `public`-- pero
--      apoyarse en eso es apoyarse en otra cosa.
--
--   2. Calificar el schema es lo que recomienda la documentacion de PostgreSQL
--      para SECURITY DEFINER, y no depende de ningun path: `extensions.crypt`
--      es `extensions.crypt` pase lo que pase.
--
-- Asi que las llamadas quedan calificadas y el `search_path` no se toca.
--
-- Las tres funciones son `CREATE OR REPLACE` con la misma firma: los GRANT y
-- los REVOKE de `20260827000002` y `20260829000003` se conservan.
--
-- ---------------------------------------------------------------------------
-- EFECTO SOBRE LOS DATOS
--
-- Ninguno. No se toca ninguna tabla y las contrasenas no se re-hashean:
-- `crypt()` lee el costo del propio hash, asi que las que se crearon con costo
-- 6 y las de costo 12 siguen validando igual.
-- ============================================================================

-- ── 0. Que pgcrypto este donde creemos ──────────────────────────────────────
--
-- Si esta en otro schema, esta migracion no arregla nada y conviene enterarse
-- ahora y no cuando el cajero no pueda abrir el local.

DO $verificar$
DECLARE
    v_schema text;
BEGIN
    SELECT n.nspname INTO v_schema
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'pgcrypto';

    IF v_schema IS NULL THEN
        RAISE EXCEPTION
            'pgcrypto no esta instalada. Instalarla con: CREATE EXTENSION pgcrypto WITH SCHEMA extensions;';
    END IF;

    IF v_schema <> 'extensions' THEN
        RAISE EXCEPTION
            'pgcrypto esta en el schema "%" y esta migracion califica las llamadas como extensions.crypt(). Cambiar "extensions." por "%." en este archivo antes de aplicarlo.',
            v_schema, v_schema;
    END IF;

    RAISE NOTICE 'pgcrypto verificada en el schema extensions.';
END
$verificar$;

-- ── 1. verificar_usuario ────────────────────────────────────────────────────
--
-- Es la que rompio el login: el unico cambio es `crypt` -> `extensions.crypt`.

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
    AND u.contrasena_encriptada = extensions.crypt(p_password, u.contrasena_encriptada);
END;
$$;

COMMENT ON FUNCTION public.verificar_usuario(text, text) IS
    'Login del POS. Solo service_role. Verifica bcrypt contra '
    'usuarios.contrasena_encriptada. Llama a extensions.crypt calificado: el '
    'search_path fijo no incluye extensions a proposito.';

-- ── 2. crear_usuario ────────────────────────────────────────────────────────
--
-- Acá hay que tener cuidado: existen DOS definiciones de esta función en el
-- repositorio, y cuál está viva depende de si `20260829000002` se aplicó.
--
--   * Sin esa migración, la vigente es la de `20260827000002`: inserta solo en
--     `public.usuarios`.
--   * Con esa migración, la vigente además crea la identidad en Supabase Auth,
--     y para eso necesita `usuarios.auth_user_id` y `public.email_de_usuario()`.
--
-- Escribir la segunda a ciegas dejaría una función que se crea sin error --el
-- cuerpo de una plpgsql no se resuelve al crearla-- y explota recién cuando
-- alguien da de alta un empleado. Así que se detecta cuál corresponde y se
-- reescribe esa, con lo único que cambia: las llamadas a pgcrypto calificadas.

DO $migrar$
DECLARE
    v_con_auth boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'usuarios'
           AND column_name  = 'auth_user_id'
    ) INTO v_con_auth;

    IF v_con_auth THEN
        RAISE NOTICE 'crear_usuario: version con Supabase Auth (20260829000002 aplicada).';
        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION public.crear_usuario(p_nombre TEXT, p_password TEXT, p_rol TEXT DEFAULT 'cajero')
            RETURNS TABLE(id_usuario BIGINT, nombre_empleado TEXT, rol TEXT)
            LANGUAGE plpgsql SECURITY DEFINER
            SET search_path = public, auth, pg_temp
            AS $cuerpo$
            DECLARE
                v_id    bigint;
                v_hash  text;
                v_uid   uuid := gen_random_uuid();
                v_email text := public.email_de_usuario(p_nombre);
            BEGIN
                v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 12));

                INSERT INTO auth.users (
                    instance_id, id, aud, role, email,
                    encrypted_password, email_confirmed_at,
                    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
                ) VALUES (
                    '00000000-0000-0000-0000-000000000000',
                    v_uid, 'authenticated', 'authenticated', v_email,
                    v_hash, now(),
                    jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'rol',p_rol),
                    jsonb_build_object('nombre_empleado', p_nombre),
                    now(), now()
                );

                INSERT INTO auth.identities (
                    provider_id, user_id, identity_data, provider,
                    last_sign_in_at, created_at, updated_at
                ) VALUES (
                    v_uid::text, v_uid,
                    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
                    'email', now(), now(), now()
                );

                INSERT INTO public.usuarios (nombre_empleado, contrasena_encriptada, rol, auth_user_id)
                VALUES (p_nombre, v_hash, p_rol, v_uid)
                RETURNING usuarios.id_usuario INTO v_id;

                UPDATE auth.users
                   SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('id_usuario', v_id)
                 WHERE id = v_uid;

                RETURN QUERY SELECT v_id, p_nombre, p_rol;
            END;
            $cuerpo$;
        $fn$;
    ELSE
        RAISE NOTICE 'crear_usuario: version simple (20260829000002 NO aplicada).';
        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION public.crear_usuario(p_nombre TEXT, p_password TEXT, p_rol TEXT DEFAULT 'cajero')
            RETURNS TABLE(id_usuario BIGINT, nombre_empleado TEXT, rol TEXT)
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public, pg_temp
            AS $cuerpo$
            BEGIN
              RETURN QUERY
              INSERT INTO public.usuarios (nombre_empleado, contrasena_encriptada, rol)
              VALUES (p_nombre, extensions.crypt(p_password, extensions.gen_salt('bf', 12)), p_rol)
              RETURNING usuarios.id_usuario, usuarios.nombre_empleado, usuarios.rol;
            END;
            $cuerpo$;
        $fn$;
    END IF;
END
$migrar$;

COMMENT ON FUNCTION public.crear_usuario(text, text, text) IS
    'Alta de empleado con bcrypt costo 12, llamando a pgcrypto calificado. '
    'Solo service_role: nunca debe ser alcanzable desde el REST publico.';

-- ── 3. Verificación ─────────────────────────────────────────────────────────
--
-- 1. Que ninguna de las dos quede con `crypt` sin calificar:
--
--      SELECT p.proname
--        FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname IN ('verificar_usuario','crear_usuario')
--         AND p.prosrc ~ '(^|[^.])\ycrypt\y';
--
--    No debe devolver ninguna fila.
--
-- 2. Que el login funcione, que es lo que importa. Con un usuario real:
--
--      SELECT * FROM public.verificar_usuario('ADMIN', '<la contrasena>');
--
--    Tiene que devolver una fila. Si devuelve cero filas, la contrasena esta
--    mal --pero ya no tira 42883--.
--
-- 3. Que los permisos no se hayan movido: `CREATE OR REPLACE` los conserva,
--    pero conviene confirmarlo una vez.
--
--      SELECT p.proname, p.proacl
--        FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname IN ('verificar_usuario','crear_usuario');
--
--    En `proacl` no debe aparecer `=X/` (que es PUBLIC), ni `anon`, ni
--    `authenticated`. Solo `service_role`.
