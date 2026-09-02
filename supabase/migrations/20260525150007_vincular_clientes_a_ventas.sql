-- Vincular ventas con clientes
-- NULL = venta a consumidor final / mostrador (cliente no identificado)
-- ON DELETE SET NULL = si se borra el cliente, la venta historica se conserva sin asociacion

ALTER TABLE "public"."ventas"
    ADD COLUMN "id_cliente" bigint;

ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_id_cliente_fkey"
    FOREIGN KEY ("id_cliente")
    REFERENCES "public"."clientes"("id_cliente")
    ON DELETE SET NULL;

CREATE INDEX "idx_ventas_id_cliente" ON "public"."ventas" USING btree ("id_cliente");

COMMENT ON COLUMN "public"."ventas"."id_cliente" IS 'Cliente facturado; NULL = consumidor final sin identificar';
