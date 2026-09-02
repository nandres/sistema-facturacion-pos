-- Tabla de devoluciones (parciales o totales)
CREATE TABLE IF NOT EXISTS public.devoluciones (
    id_devolucion  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_venta       bigint NOT NULL REFERENCES public.ventas(id_venta) ON DELETE CASCADE,
    fecha_hora     timestamptz NOT NULL DEFAULT now(),
    id_usuario     bigint REFERENCES public.usuarios(id_usuario),
    motivo         text,
    total_devuelto numeric(12,0) NOT NULL
);

-- Detalle de cada producto devuelto
CREATE TABLE IF NOT EXISTS public.detalle_devoluciones (
    id_detalle_devolucion bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_devolucion         bigint NOT NULL REFERENCES public.devoluciones(id_devolucion) ON DELETE CASCADE,
    codigo_barras         text NOT NULL REFERENCES public.productos(codigo_barras) ON DELETE RESTRICT,
    cantidad              numeric(10,3) NOT NULL CHECK (cantidad > 0),
    precio_unitario       numeric(12,0) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_detalle_devoluciones_id_devolucion ON public.detalle_devoluciones(id_devolucion);
CREATE INDEX IF NOT EXISTS idx_devoluciones_id_venta ON public.devoluciones(id_venta);
