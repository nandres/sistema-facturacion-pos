-- Parche aditivo: revocar permisos de ejecución que el default privilege
-- del snapshot inicial (20260525142906_remote_schema.sql líneas 498-501)
-- otorgó automáticamente a anon y authenticated sobre toda función nueva
-- en el schema public.
--
-- registrar_venta() es invocable únicamente por service_role, en línea con
-- el modelo de auth del proyecto: la app Electron (main process) actúa como
-- backend privado con service_role; anon/authenticated no deben poder
-- crear ventas ni descontar stock por el endpoint REST de Supabase.
--
-- Nota para el futuro: si alguien hace DROP + CREATE de la función (no
-- CREATE OR REPLACE), los default privileges volverán a aplicar y este
-- REVOKE habrá que repetirlo. CREATE OR REPLACE preserva los grants.

revoke execute on function public.registrar_venta(jsonb) from anon, authenticated;
