CREATE TABLE IF NOT EXISTS public.pagos_venta (
  id_pago   BIGSERIAL PRIMARY KEY,
  id_venta  BIGINT NOT NULL REFERENCES public.ventas(id_venta) ON DELETE CASCADE,
  medio_pago TEXT NOT NULL CHECK (medio_pago IN ('efectivo','tarjeta','transferencia','cheque')),
  monto     NUMERIC(12,0) NOT NULL CHECK (monto > 0)
);

CREATE INDEX IF NOT EXISTS idx_pagos_venta_id_venta ON public.pagos_venta(id_venta);
