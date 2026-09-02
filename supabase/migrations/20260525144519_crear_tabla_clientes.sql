-- Tabla de clientes para facturación
CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id_cliente"      bigint NOT NULL,
    "nombre"          text NOT NULL,
    "ruc"             text,
    "email"           text,
    "telefono"        text,
    "direccion"       text,
    "activo"          boolean DEFAULT true NOT NULL,
    "creado_en"       timestamp with time zone DEFAULT now() NOT NULL,
    "actualizado_en"  timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "clientes_nombre_check" CHECK (length(btrim(nombre)) > 0),
    CONSTRAINT "clientes_email_check"  CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE SEQUENCE IF NOT EXISTS "public"."clientes_id_cliente_seq"
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE "public"."clientes_id_cliente_seq"
    OWNED BY "public"."clientes"."id_cliente";

ALTER TABLE ONLY "public"."clientes"
    ALTER COLUMN "id_cliente" SET DEFAULT nextval('public.clientes_id_cliente_seq'::regclass);

ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id_cliente");

-- RUC unico solo cuando esta presente (permite multiples NULL)
CREATE UNIQUE INDEX "clientes_ruc_key" ON "public"."clientes" ("ruc")
    WHERE "ruc" IS NOT NULL;

COMMENT ON TABLE  "public"."clientes"            IS 'Clientes para emision de facturas';
COMMENT ON COLUMN "public"."clientes"."ruc"      IS 'RUC paraguayo formato 12345678-9; unico cuando se informa';
COMMENT ON COLUMN "public"."clientes"."activo"   IS 'Soft-delete: false oculta del listado sin borrar historial';

-- Permisos coherentes con el resto del esquema
ALTER TABLE "public"."clientes" OWNER TO "postgres";
GRANT ALL ON TABLE    "public"."clientes"                  TO "anon", "authenticated", "service_role";
GRANT ALL ON SEQUENCE "public"."clientes_id_cliente_seq"   TO "anon", "authenticated", "service_role";
