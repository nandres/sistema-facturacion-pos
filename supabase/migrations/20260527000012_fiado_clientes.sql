-- Crédito / Fiado para clientes

ALTER TABLE "public"."clientes"
  ADD COLUMN IF NOT EXISTS "limite_credito" numeric(12,0) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "saldo_deudor" numeric(12,0) DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."pagos_cliente" (
    "id_pago"      bigint NOT NULL,
    "id_cliente"   bigint NOT NULL,
    "id_venta"     bigint,
    "fecha_hora"   timestamp with time zone DEFAULT now() NOT NULL,
    "monto"        numeric(12,0) NOT NULL,
    "concepto"     text,
    CONSTRAINT "pagos_cliente_pkey" PRIMARY KEY ("id_pago"),
    CONSTRAINT "pagos_cliente_id_cliente_fkey" FOREIGN KEY ("id_cliente")
        REFERENCES "public"."clientes" ("id_cliente"),
    CONSTRAINT "pagos_cliente_id_venta_fkey" FOREIGN KEY ("id_venta")
        REFERENCES "public"."ventas" ("id_venta")
);

CREATE SEQUENCE IF NOT EXISTS "public"."pagos_cliente_id_pago_seq"
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE "public"."pagos_cliente_id_pago_seq"
    OWNED BY "public"."pagos_cliente"."id_pago";
ALTER TABLE ONLY "public"."pagos_cliente"
    ALTER COLUMN "id_pago" SET DEFAULT nextval('public.pagos_cliente_id_pago_seq'::regclass);

GRANT ALL ON TABLE    "public"."pagos_cliente"              TO "anon", "authenticated", "service_role";
GRANT ALL ON SEQUENCE "public"."pagos_cliente_id_pago_seq"   TO "anon", "authenticated", "service_role";
