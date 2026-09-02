-- ============================================================================
-- Fase 5, paso 1: llevar los usuarios de la caja a Supabase Auth (C-01)
--
-- ---------------------------------------------------------------------------
-- POR QUE
--
-- Hoy todas las cajas entran con la misma `service_role` key, que viaja dentro
-- del instalador (`build.extraResources` empaqueta el `.env`). Ese rol tiene
-- BYPASSRLS: ninguna de las politicas que se habilitaron en C-02 lo frena.
-- Cualquiera con acceso a una PC de caja tiene control total del proyecto.
--
-- Rotar la key no lo arregla: la nueva viaja igual. Lo unico que lo cierra es
-- que cada cajero tenga su propia identidad y que la aplicacion opere con el
-- token de esa identidad, no con una llave maestra compartida.
--
-- ---------------------------------------------------------------------------
-- QUE HACE ESTE PASO, Y QUE NO
--
-- Crea en `auth.users` un usuario por cada fila de `public.usuarios`, y los
-- vincula. NO cambia como entra la aplicacion: eso es el paso 2. Despues de
-- esta migracion el sistema sigue funcionando exactamente igual --sigue
-- usando service_role-- y ademas existe la identidad nueva, lista para
-- empezar a usarse.
--
-- Es deliberado que sea asi: el corte se prueba con el fallback puesto, no
-- de una.
--
-- ---------------------------------------------------------------------------
-- LAS CONTRASENAS NO CAMBIAN
--
-- `public.usuarios.contrasena_encriptada` guarda bcrypt (`crypt` con
-- `gen_salt('bf')`), y `auth.users.encrypted_password` tambien es bcrypt. El
-- hash se copia tal cual: cada cajero sigue entrando con la misma contrasena
-- de siempre y nadie tiene que coordinar nada.
--
-- OJO: insertar directo en `auth.users` no es una via documentada por
-- Supabase. Funciona porque el formato es bcrypt estandar, pero si algun dia
-- cambian ese esquema hay que rehacerlo. Por eso la migracion verifica la
-- forma de la tabla antes de tocarla, en vez de asumirla.
--
-- ---------------------------------------------------------------------------
-- EL EMAIL ES SINTETICO
--
-- Supabase Auth necesita un identificador con forma de email; los cajeros solo
-- tienen nombre. Se compone `<nombre>@caja.local`, normalizado. El cajero
-- nunca lo ve ni lo escribe: sigue tipeando su nombre de siempre y la
-- aplicacion arma el email. `.local` no es un dominio ruteable, asi que no
-- puede recibir correo ni sirve para recuperar contrasenas: eso se hace desde
-- la pantalla de usuarios, como hasta ahora.
-- ============================================================================

-- ── 0. No seguir si la tabla no tiene la forma que esperamos ────────────────
DO $$
BEGIN
    IF to_regclass('auth.users') IS NULL THEN
        RAISE EXCEPTION 'No existe auth.users: esta base no tiene Supabase Auth'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'auth' AND table_name = 'users'
           AND column_name = 'encrypted_password'
    ) THEN
        RAISE EXCEPTION 'auth.users no tiene encrypted_password: el esquema de GoTrue cambio'
            USING ERRCODE = 'P0001',
                  HINT = 'Revisar la migracion antes de seguir; no asumir el formato';
    END IF;
END$$;

-- ── 1. Vinculo entre la tabla del negocio y la identidad ────────────────────
ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS auth_user_id uuid;

COMMENT ON COLUMN public.usuarios.auth_user_id IS
    'Identidad en auth.users. NULL = usuario todavia sin migrar; la aplicacion '
    'cae al login viejo para esos.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_auth_user_id
    ON public.usuarios(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ── 2. Como se compone el email a partir del nombre ─────────────────────────
--
-- Tiene que dar siempre lo mismo para el mismo nombre: es lo que la aplicacion
-- va a calcular del lado del cliente para armar el login.
CREATE OR REPLACE FUNCTION public.email_de_usuario(p_nombre text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT lower(regexp_replace(trim(p_nombre), '[^A-Za-z0-9]+', '.', 'g')) || '@caja.local';
$$;

COMMENT ON FUNCTION public.email_de_usuario(text) IS
    'Email sintetico derivado del nombre del empleado. El cajero nunca lo ve.';

-- ── 3. Crear la identidad de cada usuario que no la tenga ───────────────────
DO $$
DECLARE
    u          record;
    v_uid      uuid;
    v_email    text;
    v_creados  int := 0;
    v_saltados int := 0;
BEGIN
    FOR u IN
        SELECT id_usuario, nombre_empleado, rol, contrasena_encriptada
          FROM public.usuarios
         WHERE auth_user_id IS NULL
           AND activo
    LOOP
        v_email := public.email_de_usuario(u.nombre_empleado);

        -- Si ya existe alguien con ese email, se vincula en vez de duplicar.
        SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

        IF v_uid IS NULL THEN
            v_uid := gen_random_uuid();

            INSERT INTO auth.users (
                instance_id, id, aud, role, email,
                encrypted_password, email_confirmed_at,
                raw_app_meta_data, raw_user_meta_data,
                created_at, updated_at
            ) VALUES (
                '00000000-0000-0000-0000-000000000000',
                v_uid, 'authenticated', 'authenticated', v_email,
                u.contrasena_encriptada,   -- bcrypt, tal cual estaba
                now(),                      -- confirmado: no hay correo que abrir
                jsonb_build_object(
                    'provider', 'email',
                    'providers', jsonb_build_array('email'),
                    'rol', u.rol,           -- viaja en el JWT; lo usa RLS
                    'id_usuario', u.id_usuario
                ),
                jsonb_build_object('nombre_empleado', u.nombre_empleado),
                now(), now()
            );

            -- GoTrue necesita la identidad del proveedor, no solo el usuario.
            INSERT INTO auth.identities (
                provider_id, user_id, identity_data, provider,
                last_sign_in_at, created_at, updated_at
            ) VALUES (
                v_uid::text, v_uid,
                jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
                'email', now(), now(), now()
            );

            v_creados := v_creados + 1;
        ELSE
            v_saltados := v_saltados + 1;
        END IF;

        UPDATE public.usuarios SET auth_user_id = v_uid WHERE id_usuario = u.id_usuario;
    END LOOP;

    RAISE NOTICE 'Identidades creadas: %, ya existentes y vinculadas: %', v_creados, v_saltados;
END$$;

-- ── 4. Que los usuarios nuevos nazcan con identidad ─────────────────────────
--
-- `crear_usuario` seguia insertando solo en public.usuarios. Si se deja asi,
-- todo empleado dado de alta despues de esta migracion queda sin poder entrar
-- cuando el login pase a Supabase Auth.
CREATE OR REPLACE FUNCTION public.crear_usuario(p_nombre TEXT, p_password TEXT, p_rol TEXT DEFAULT 'cajero')
RETURNS TABLE(id_usuario BIGINT, nombre_empleado TEXT, rol TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_id    bigint;
    v_hash  text;
    v_uid   uuid := gen_random_uuid();
    v_email text := public.email_de_usuario(p_nombre);
BEGIN
    v_hash := crypt(p_password, gen_salt('bf'));

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

    -- El id_usuario recien se conoce despues del INSERT de arriba.
    UPDATE auth.users
       SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('id_usuario', v_id)
     WHERE id = v_uid;

    RETURN QUERY SELECT v_id, p_nombre, p_rol;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_usuario(text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.crear_usuario(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.crear_usuario(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.email_de_usuario(text) FROM public;
GRANT EXECUTE ON FUNCTION public.email_de_usuario(text) TO service_role, authenticated;

COMMENT ON FUNCTION public.crear_usuario(text, text, text) IS
    'Alta de empleado: crea la identidad en auth.users y la fila de negocio en '
    'public.usuarios, vinculadas, con el mismo hash bcrypt.';
