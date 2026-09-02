CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP FUNCTION IF EXISTS verificar_usuario(TEXT, TEXT);
DROP FUNCTION IF EXISTS crear_usuario(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION verificar_usuario(p_nombre TEXT, p_password TEXT)
RETURNS TABLE(id_usuario BIGINT, nombre_empleado TEXT, rol TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT u.id_usuario, u.nombre_empleado, u.rol
  FROM usuarios u
  WHERE u.nombre_empleado = p_nombre
    AND u.contrasena_encriptada = crypt(p_password, u.contrasena_encriptada);
END;
$$;

CREATE OR REPLACE FUNCTION crear_usuario(p_nombre TEXT, p_password TEXT, p_rol TEXT DEFAULT 'cajero')
RETURNS TABLE(id_usuario BIGINT, nombre_empleado TEXT, rol TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  INSERT INTO usuarios (nombre_empleado, contrasena_encriptada, rol)
  VALUES (p_nombre, crypt(p_password, gen_salt('bf')), p_rol)
  RETURNING usuarios.id_usuario, usuarios.nombre_empleado, usuarios.rol;
END;
$$;
