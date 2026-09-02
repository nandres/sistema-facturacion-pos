


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."detalle_ventas" (
    "id_detalle" bigint NOT NULL,
    "id_venta" bigint NOT NULL,
    "codigo_barras" "text" NOT NULL,
    "cantidad" numeric(10,3) NOT NULL,
    "precio_unitario" numeric(12,0) NOT NULL,
    CONSTRAINT "detalle_ventas_cantidad_check" CHECK (("cantidad" > (0)::numeric)),
    CONSTRAINT "detalle_ventas_precio_unitario_check" CHECK (("precio_unitario" >= (0)::numeric))
);


ALTER TABLE "public"."detalle_ventas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."detalle_ventas"."precio_unitario" IS 'Precio congelado al momento de la venta; no cambia si el catálogo se actualiza luego';



CREATE SEQUENCE IF NOT EXISTS "public"."detalle_ventas_id_detalle_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."detalle_ventas_id_detalle_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."detalle_ventas_id_detalle_seq" OWNED BY "public"."detalle_ventas"."id_detalle";



CREATE TABLE IF NOT EXISTS "public"."productos" (
    "codigo_barras" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "precio_venta" numeric(12,0) NOT NULL,
    "precio_costo" numeric(12,0) NOT NULL,
    "stock" numeric(10,3) DEFAULT 0 NOT NULL,
    "iva" numeric(5,2) DEFAULT 10.00 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "productos_iva_check" CHECK ((("iva" >= (0)::numeric) AND ("iva" <= (100)::numeric))),
    CONSTRAINT "productos_precio_costo_check" CHECK (("precio_costo" >= (0)::numeric)),
    CONSTRAINT "productos_precio_venta_check" CHECK (("precio_venta" >= (0)::numeric)),
    CONSTRAINT "productos_stock_check" CHECK (("stock" >= (0)::numeric))
);


ALTER TABLE "public"."productos" OWNER TO "postgres";


COMMENT ON TABLE "public"."productos" IS 'Catálogo de productos del supermercado';



COMMENT ON COLUMN "public"."productos"."codigo_barras" IS 'EAN-13/UPC-A/EAN-8 — clave primaria natural';



COMMENT ON COLUMN "public"."productos"."precio_venta" IS 'Guaraníes enteros (PYG no usa decimales)';



COMMENT ON COLUMN "public"."productos"."stock" IS 'Decimales permitidos para productos por peso';



COMMENT ON COLUMN "public"."productos"."iva" IS 'Porcentaje IVA: 10.00 / 5.00 / 0.00 (exento)';



CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id_usuario" bigint NOT NULL,
    "nombre_empleado" "text" NOT NULL,
    "rol" "text" NOT NULL,
    "contrasena_encriptada" "text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usuarios_rol_check" CHECK (("rol" = ANY (ARRAY['admin'::"text", 'cajero'::"text", 'supervisor'::"text"])))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


COMMENT ON COLUMN "public"."usuarios"."contrasena_encriptada" IS 'Hash bcrypt/argon2 — jamás texto plano';



CREATE SEQUENCE IF NOT EXISTS "public"."usuarios_id_usuario_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."usuarios_id_usuario_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."usuarios_id_usuario_seq" OWNED BY "public"."usuarios"."id_usuario";



CREATE TABLE IF NOT EXISTS "public"."ventas" (
    "id_venta" bigint NOT NULL,
    "fecha_hora" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_pagado" numeric(12,0) NOT NULL,
    "monto_recibido" numeric(12,0) NOT NULL,
    "vuelto" numeric(12,0) GENERATED ALWAYS AS (("monto_recibido" - "total_pagado")) STORED NOT NULL,
    "tipo_pago" "text" NOT NULL,
    "id_usuario" bigint,
    CONSTRAINT "ventas_check" CHECK (("monto_recibido" >= "total_pagado")),
    CONSTRAINT "ventas_monto_recibido_check" CHECK (("monto_recibido" >= (0)::numeric)),
    CONSTRAINT "ventas_tipo_pago_check" CHECK (("tipo_pago" = ANY (ARRAY['efectivo'::"text", 'tarjeta'::"text", 'transferencia'::"text", 'mixto'::"text"]))),
    CONSTRAINT "ventas_total_pagado_check" CHECK (("total_pagado" >= (0)::numeric))
);


ALTER TABLE "public"."ventas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ventas"."vuelto" IS 'Calculado automáticamente: monto_recibido - total_pagado';



COMMENT ON COLUMN "public"."ventas"."id_usuario" IS 'Cajero que registró la venta';



CREATE SEQUENCE IF NOT EXISTS "public"."ventas_id_venta_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ventas_id_venta_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ventas_id_venta_seq" OWNED BY "public"."ventas"."id_venta";



ALTER TABLE ONLY "public"."detalle_ventas" ALTER COLUMN "id_detalle" SET DEFAULT "nextval"('"public"."detalle_ventas_id_detalle_seq"'::"regclass");



ALTER TABLE ONLY "public"."usuarios" ALTER COLUMN "id_usuario" SET DEFAULT "nextval"('"public"."usuarios_id_usuario_seq"'::"regclass");



ALTER TABLE ONLY "public"."ventas" ALTER COLUMN "id_venta" SET DEFAULT "nextval"('"public"."ventas_id_venta_seq"'::"regclass");



ALTER TABLE ONLY "public"."detalle_ventas"
    ADD CONSTRAINT "detalle_ventas_pkey" PRIMARY KEY ("id_detalle");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_pkey" PRIMARY KEY ("codigo_barras");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_nombre_empleado_key" UNIQUE ("nombre_empleado");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id_usuario");



ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_pkey" PRIMARY KEY ("id_venta");



CREATE INDEX "idx_detalle_ventas_codigo_barras" ON "public"."detalle_ventas" USING "btree" ("codigo_barras");



CREATE INDEX "idx_detalle_ventas_id_venta" ON "public"."detalle_ventas" USING "btree" ("id_venta");



CREATE INDEX "idx_ventas_fecha_hora" ON "public"."ventas" USING "btree" ("fecha_hora" DESC);



CREATE INDEX "idx_ventas_id_usuario" ON "public"."ventas" USING "btree" ("id_usuario");



ALTER TABLE ONLY "public"."detalle_ventas"
    ADD CONSTRAINT "detalle_ventas_codigo_barras_fkey" FOREIGN KEY ("codigo_barras") REFERENCES "public"."productos"("codigo_barras") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."detalle_ventas"
    ADD CONSTRAINT "detalle_ventas_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "public"."ventas"("id_venta") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE SET NULL;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





































































































































































GRANT ALL ON TABLE "public"."detalle_ventas" TO "anon";
GRANT ALL ON TABLE "public"."detalle_ventas" TO "authenticated";
GRANT ALL ON TABLE "public"."detalle_ventas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."detalle_ventas_id_detalle_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."detalle_ventas_id_detalle_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."detalle_ventas_id_detalle_seq" TO "service_role";



GRANT ALL ON TABLE "public"."productos" TO "anon";
GRANT ALL ON TABLE "public"."productos" TO "authenticated";
GRANT ALL ON TABLE "public"."productos" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."usuarios_id_usuario_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."usuarios_id_usuario_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."usuarios_id_usuario_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ventas" TO "anon";
GRANT ALL ON TABLE "public"."ventas" TO "authenticated";
GRANT ALL ON TABLE "public"."ventas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ventas_id_venta_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ventas_id_venta_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ventas_id_venta_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

alter table "public"."detalle_ventas" drop constraint "detalle_ventas_codigo_barras_fkey";

alter table "public"."detalle_ventas" drop constraint "detalle_ventas_id_venta_fkey";

alter table "public"."ventas" drop constraint "ventas_id_usuario_fkey";

alter table "public"."detalle_ventas" alter column "id_detalle" set default nextval('public.detalle_ventas_id_detalle_seq'::regclass);

alter table "public"."usuarios" alter column "id_usuario" set default nextval('public.usuarios_id_usuario_seq'::regclass);

alter table "public"."ventas" alter column "id_venta" set default nextval('public.ventas_id_venta_seq'::regclass);

alter table "public"."detalle_ventas" add constraint "detalle_ventas_codigo_barras_fkey" FOREIGN KEY (codigo_barras) REFERENCES public.productos(codigo_barras) ON DELETE RESTRICT not valid;

alter table "public"."detalle_ventas" validate constraint "detalle_ventas_codigo_barras_fkey";

alter table "public"."detalle_ventas" add constraint "detalle_ventas_id_venta_fkey" FOREIGN KEY (id_venta) REFERENCES public.ventas(id_venta) ON DELETE CASCADE not valid;

alter table "public"."detalle_ventas" validate constraint "detalle_ventas_id_venta_fkey";

alter table "public"."ventas" add constraint "ventas_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL not valid;

alter table "public"."ventas" validate constraint "ventas_id_usuario_fkey";


