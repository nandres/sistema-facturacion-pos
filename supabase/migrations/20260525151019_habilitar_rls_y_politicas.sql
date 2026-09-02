-- ================================================================
-- Habilitar RLS y aplicar politicas restrictivas para 5 tablas
-- Decision arquitectonica: la app usa SUPABASE_SERVICE_ROLE_KEY,
-- que bypassa RLS automaticamente (atributo BYPASSRLS del rol).
-- anon queda sin GRANTs ni politicas -> acceso 0.
-- authenticated tiene SELECT/INSERT/UPDATE (DELETE bloqueado intencionalmente).
-- ================================================================

-- 1. Habilitar RLS en las 5 tablas del esquema public
ALTER TABLE "public"."clientes"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."productos"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ventas"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."detalle_ventas"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."usuarios"        ENABLE ROW LEVEL SECURITY;

-- 2. Revocar acceso de anon (defensa en profundidad)
REVOKE ALL ON TABLE "public"."clientes"        FROM "anon";
REVOKE ALL ON TABLE "public"."productos"       FROM "anon";
REVOKE ALL ON TABLE "public"."ventas"          FROM "anon";
REVOKE ALL ON TABLE "public"."detalle_ventas"  FROM "anon";
REVOKE ALL ON TABLE "public"."usuarios"        FROM "anon";

-- Revocar acceso a sequences (necesarias para INSERT con DEFAULT nextval)
REVOKE ALL ON SEQUENCE "public"."clientes_id_cliente_seq"        FROM "anon";
REVOKE ALL ON SEQUENCE "public"."usuarios_id_usuario_seq"        FROM "anon";
REVOKE ALL ON SEQUENCE "public"."ventas_id_venta_seq"            FROM "anon";
REVOKE ALL ON SEQUENCE "public"."detalle_ventas_id_detalle_seq"  FROM "anon";

-- 3. Politicas para rol "authenticated" (SELECT/INSERT/UPDATE; DELETE no incluido)
-- Politicas permisivas: cualquier usuario autenticado puede operar sobre toda fila.
-- Granularidad por-usuario se puede agregar despues sin tocar esta migracion.

-- clientes
CREATE POLICY "authenticated_select_clientes" ON "public"."clientes"
    FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "authenticated_insert_clientes" ON "public"."clientes"
    FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "authenticated_update_clientes" ON "public"."clientes"
    FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);

-- productos
CREATE POLICY "authenticated_select_productos" ON "public"."productos"
    FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "authenticated_insert_productos" ON "public"."productos"
    FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "authenticated_update_productos" ON "public"."productos"
    FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);

-- ventas
CREATE POLICY "authenticated_select_ventas" ON "public"."ventas"
    FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "authenticated_insert_ventas" ON "public"."ventas"
    FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "authenticated_update_ventas" ON "public"."ventas"
    FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);

-- detalle_ventas
CREATE POLICY "authenticated_select_detalle_ventas" ON "public"."detalle_ventas"
    FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "authenticated_insert_detalle_ventas" ON "public"."detalle_ventas"
    FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "authenticated_update_detalle_ventas" ON "public"."detalle_ventas"
    FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);

-- usuarios
CREATE POLICY "authenticated_select_usuarios" ON "public"."usuarios"
    FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "authenticated_insert_usuarios" ON "public"."usuarios"
    FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "authenticated_update_usuarios" ON "public"."usuarios"
    FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
