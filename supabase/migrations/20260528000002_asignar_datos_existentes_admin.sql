-- Asignar todos los datos existentes al admin (id_usuario = 1)
-- Solo tiene efecto si hay registros sin id_usuario

UPDATE public.compras SET id_usuario = 1 WHERE id_usuario IS NULL;
UPDATE public.arqueos_caja SET id_usuario = 1 WHERE id_usuario IS NULL;

-- Volver obligatorio el campo una vez migrados los datos existentes
ALTER TABLE public.compras ALTER COLUMN id_usuario SET NOT NULL;
ALTER TABLE public.arqueos_caja ALTER COLUMN id_usuario SET NOT NULL;

-- Actualizar comentarios de tabla
COMMENT ON COLUMN public.compras.id_usuario IS 'Usuario que registró la compra';
COMMENT ON COLUMN public.arqueos_caja.id_usuario IS 'Usuario al que pertenece el arqueo';
