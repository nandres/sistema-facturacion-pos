-- Módulo de Compras y Proveedores

CREATE TABLE IF NOT EXISTS "public"."proveedores" (
    "id_proveedor"    bigint NOT NULL,
    "ruc"             text,
    "razon_social"    text NOT NULL,
    "telefono"        text,
    "contacto"        text,
    "activo"          boolean DEFAULT true NOT NULL,
    "creado_en"       timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id_proveedor")
);

CREATE SEQUENCE IF NOT EXISTS "public"."proveedores_id_proveedor_seq"
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE "public"."proveedores_id_proveedor_seq"
    OWNED BY "public"."proveedores"."id_proveedor";
ALTER TABLE ONLY "public"."proveedores"
    ALTER COLUMN "id_proveedor" SET DEFAULT nextval('public.proveedores_id_proveedor_seq'::regclass);

CREATE UNIQUE INDEX "proveedores_ruc_key" ON "public"."proveedores" ("ruc")
    WHERE "ruc" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."compras" (
    "id_compra"       bigint NOT NULL,
    "id_proveedor"    bigint,
    "fecha_hora"      timestamp with time zone DEFAULT now() NOT NULL,
    "total"           numeric(12,0) DEFAULT 0 NOT NULL,
    "factura_numero"  text,
    "creado_en"       timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "compras_pkey" PRIMARY KEY ("id_compra"),
    CONSTRAINT "compras_id_proveedor_fkey" FOREIGN KEY ("id_proveedor")
        REFERENCES "public"."proveedores" ("id_proveedor")
);

CREATE SEQUENCE IF NOT EXISTS "public"."compras_id_compra_seq"
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE "public"."compras_id_compra_seq"
    OWNED BY "public"."compras"."id_compra";
ALTER TABLE ONLY "public"."compras"
    ALTER COLUMN "id_compra" SET DEFAULT nextval('public.compras_id_compra_seq'::regclass);

CREATE TABLE IF NOT EXISTS "public"."detalle_compras" (
    "id_detalle"      bigint NOT NULL,
    "id_compra"       bigint NOT NULL,
    "codigo_barras"   text NOT NULL,
    "cantidad"        numeric(10,3) NOT NULL,
    "precio_costo"    numeric(12,0) NOT NULL,
    CONSTRAINT "detalle_compras_pkey" PRIMARY KEY ("id_detalle"),
    CONSTRAINT "detalle_compras_id_compra_fkey" FOREIGN KEY ("id_compra")
        REFERENCES "public"."compras" ("id_compra") ON DELETE CASCADE,
    CONSTRAINT "detalle_compras_codigo_barras_fkey" FOREIGN KEY ("codigo_barras")
        REFERENCES "public"."productos" ("codigo_barras")
);

CREATE SEQUENCE IF NOT EXISTS "public"."detalle_compras_id_detalle_seq"
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE "public"."detalle_compras_id_detalle_seq"
    OWNED BY "public"."detalle_compras"."id_detalle";
ALTER TABLE ONLY "public"."detalle_compras"
    ALTER COLUMN "id_detalle" SET DEFAULT nextval('public.detalle_compras_id_detalle_seq'::regclass);

GRANT ALL ON TABLE    "public"."proveedores"        TO "anon", "authenticated", "service_role";
GRANT ALL ON SEQUENCE "public"."proveedores_id_proveedor_seq" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE    "public"."compras"            TO "anon", "authenticated", "service_role";
GRANT ALL ON SEQUENCE "public"."compras_id_compra_seq"       TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE    "public"."detalle_compras"    TO "anon", "authenticated", "service_role";
GRANT ALL ON SEQUENCE "public"."detalle_compras_id_detalle_seq" TO "anon", "authenticated", "service_role";
