-- Soft-delete para productos (consistente con clientes, proveedores, usuarios)
alter table public.productos
  add column activo boolean not null default true;

comment on column public.productos.activo is
  'Soft-delete: false oculta del listado sin borrar historial de ventas';

-- Index para filtrar productos activos en búsquedas
create index if not exists idx_productos_activo on public.productos (activo);
