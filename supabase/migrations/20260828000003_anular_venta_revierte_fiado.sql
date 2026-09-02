-- ============================================================================
-- Anular una venta fiada dejaba la deuda viva.
--
-- ---------------------------------------------------------------------------
-- EL PROBLEMA
--
-- `anular_venta` repone el stock y marca la venta como anulada, pero nunca
-- miro la cuenta corriente. Cuando la venta anulada era a credito, el
-- movimiento seguia en `pagos_cliente` y `clientes.saldo_deudor` seguia
-- inflado: la mercaderia volvia al stock y el cliente quedaba debiendo una
-- compra que ya no existe.
--
-- No habia forma de notarlo desde el sistema --la deuda simplemente quedaba
-- ahi-- hasta que el cliente reclamaba. Y como la unica manera de corregirlo
-- era editar el saldo a mano, cualquier arreglo dejaba la cuenta corriente sin
-- el movimiento que lo explicara.
--
-- ---------------------------------------------------------------------------
-- COMO QUEDA
--
-- Si la venta tiene movimientos en la cuenta corriente, la anulacion los
-- revierte: descuenta del saldo lo que se habia cargado y deja el asiento
-- contrario en `pagos_cliente`, para que la cuenta muestre por que cambio en
-- vez de aparecer corregida sin explicacion.
--
-- Todo dentro de la misma transaccion que ya reponia el stock: o vuelve todo,
-- o no vuelve nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.anular_venta(p_id_venta bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
declare
    v_venta public.ventas;
    v_linea record;
    v_fiado record;
begin
    select * into v_venta from public.ventas where id_venta = p_id_venta;
    if not found then
        raise exception 'Venta no encontrada: %', p_id_venta
            using errcode = 'P0001';
    end if;

    if v_venta.estado = 'anulada' then
        raise exception 'La venta % ya está anulada', p_id_venta
            using errcode = 'P0001';
    end if;

    -- Reponer stock de cada línea
    for v_linea in
        select codigo_barras, cantidad
          from public.detalle_ventas
         where id_venta = p_id_venta
    loop
        update public.productos
           set stock          = stock + v_linea.cantidad,
               actualizado_en = now()
         where codigo_barras = v_linea.codigo_barras;
    end loop;

    -- NUEVO: revertir la cuenta corriente si la venta se habia fiado.
    --
    -- Se suman los movimientos de esta venta en vez de usar el total de la
    -- cabecera: si por algun motivo se cargo un monto distinto, lo que hay que
    -- devolver es lo que efectivamente se cargo.
    --
    -- El FOR UPDATE agarra la fila del cliente antes de tocar el saldo, para no
    -- pisar una compra o un pago que este entrando en paralelo.
    for v_fiado in
        select p.id_cliente, sum(p.monto) as total
          from public.pagos_cliente p
         where p.id_venta = p_id_venta
           and p.concepto = 'Compra a crédito'
         group by p.id_cliente
    loop
        perform 1 from public.clientes
         where id_cliente = v_fiado.id_cliente
           for update;

        update public.clientes
           set saldo_deudor = greatest(0, saldo_deudor - v_fiado.total)
         where id_cliente = v_fiado.id_cliente;

        -- El asiento contrario, para que la cuenta corriente explique el
        -- cambio en vez de mostrar un saldo corregido de la nada.
        insert into public.pagos_cliente (id_cliente, id_venta, monto, concepto)
        values (v_fiado.id_cliente, p_id_venta, v_fiado.total,
                'Anulación de compra a crédito');
    end loop;

    update public.ventas
       set estado = 'anulada'
     where id_venta = p_id_venta;

    return (select to_jsonb(v.*) from public.ventas v where v.id_venta = p_id_venta);
end;
$$;

COMMENT ON FUNCTION public.anular_venta(bigint) IS
    'Anula una venta activa: repone stock, revierte la cuenta corriente si '
    'estaba fiada, y marca estado = anulada.';

REVOKE ALL ON FUNCTION public.anular_venta(bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.anular_venta(bigint) TO service_role;
