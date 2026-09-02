-- Categorías de productos (almacén, lácteos, bebidas, etc.)

CREATE TABLE IF NOT EXISTS public.categorias (
    id_categoria SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#059669',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.categorias OWNER TO postgres;

-- Agregar columna id_categoria a productos
ALTER TABLE public.productos
    ADD COLUMN IF NOT EXISTS id_categoria INT REFERENCES public.categorias(id_categoria) ON DELETE SET NULL;

-- Categorías por defecto
INSERT INTO public.categorias (nombre, color) VALUES
    ('Almacén', '#059669'),
    ('Lácteos', '#0284C7'),
    ('Bebidas', '#7C3AED'),
    ('Carnicería', '#DC2626'),
    ('Panadería', '#D97706'),
    ('Limpieza', '#0891B2'),
    ('Higiene', '#BE185D'),
    ('Congelados', '#2563EB'),
    ('Snacks', '#EA580C'),
    ('Otros', '#6B7280')
ON CONFLICT (nombre) DO NOTHING;
