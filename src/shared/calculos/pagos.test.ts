import { describe, it, expect } from 'vitest';
import {
  sumarPagos,
  calcularVuelto,
  calcularFaltante,
  determinarTipoPago,
  siguienteImporte,
} from './pagos';
import type { PagoInput } from '../types/ventas';

const pago = (medio_pago: PagoInput['medio_pago'], monto: number): PagoInput => ({
  medio_pago,
  monto,
});

describe('sumarPagos', () => {
  it('sin pagos no hay nada recibido', () => {
    expect(sumarPagos([])).toBe(0);
  });

  it('suma los medios de un pago mixto', () => {
    expect(sumarPagos([pago('efectivo', 50000), pago('tarjeta', 30000)])).toBe(80000);
  });

  it('suma dos entregas del mismo medio', () => {
    expect(sumarPagos([pago('efectivo', 20000), pago('efectivo', 20000)])).toBe(40000);
  });
});

describe('determinarTipoPago — la regresión del cheque', () => {
  // El hallazgo original: el `return 'efectivo'` final era un cajón de sastre y
  // el cheque caía ahí. La venta quedaba registrada como efectivo y el cierre
  // de caja reclamaba esa plata en el cajón, donde no estaba.
  it('un cheque se registra como cheque, no como efectivo', () => {
    expect(determinarTipoPago([pago('cheque', 100000)])).toBe('cheque');
  });

  it('cada medio único se registra con su nombre', () => {
    expect(determinarTipoPago([pago('tarjeta', 1)])).toBe('tarjeta');
    expect(determinarTipoPago([pago('transferencia', 1)])).toBe('transferencia');
    expect(determinarTipoPago([pago('credito', 1)])).toBe('credito');
    expect(determinarTipoPago([pago('efectivo', 1)])).toBe('efectivo');
  });

  it('dos entregas del mismo medio siguen siendo ese medio', () => {
    expect(determinarTipoPago([pago('cheque', 50000), pago('cheque', 50000)])).toBe('cheque');
  });

  it('dos medios distintos son mixto', () => {
    expect(determinarTipoPago([pago('efectivo', 50000), pago('tarjeta', 30000)])).toBe('mixto');
  });

  it('sin pagos cae en efectivo', () => {
    expect(determinarTipoPago([])).toBe('efectivo');
  });
});

describe('calcularVuelto', () => {
  it('devuelve la diferencia cuando sobra plata', () => {
    expect(calcularVuelto(100000, 63500)).toBe(36500);
  });

  it('es cero cuando el pago es justo', () => {
    expect(calcularVuelto(63500, 63500)).toBe(0);
  });

  it('nunca es negativo si falta plata', () => {
    expect(calcularVuelto(50000, 63500)).toBe(0);
  });

  it('es cero con el carrito vacío, aunque haya plata cargada', () => {
    // Si no, el visor mostraría todo lo recibido como vuelto antes de escanear.
    expect(calcularVuelto(100000, 0)).toBe(0);
  });

  it('es cero sin nada recibido', () => {
    expect(calcularVuelto(0, 63500)).toBe(0);
  });
});

describe('calcularFaltante', () => {
  it('devuelve lo que falta cobrar', () => {
    expect(calcularFaltante(50000, 63500)).toBe(13500);
  });

  it('es cero cuando el pago es justo', () => {
    expect(calcularFaltante(63500, 63500)).toBe(0);
  });

  it('nunca es negativo si sobra plata', () => {
    expect(calcularFaltante(100000, 63500)).toBe(0);
  });

  it('es cero con el carrito vacío', () => {
    expect(calcularFaltante(0, 0)).toBe(0);
  });
});

describe('vuelto y faltante son las dos caras de la misma resta', () => {
  // La propiedad que el cajero da por sentada: el visor nunca puede pedir
  // plata y ofrecer vuelto al mismo tiempo.
  const casos: ReadonlyArray<[number, number]> = [
    [0, 0],
    [0, 63500],
    [50000, 63500],
    [63500, 63500],
    [100000, 63500],
    [100000, 0],
  ];

  it.each(casos)('recibido %i sobre total %i: uno de los dos es cero', (recibido, total) => {
    const vuelto = calcularVuelto(recibido, total);
    const faltante = calcularFaltante(recibido, total);
    expect(Math.min(vuelto, faltante)).toBe(0);
    expect(vuelto).toBeGreaterThanOrEqual(0);
    expect(faltante).toBeGreaterThanOrEqual(0);
  });
});

describe('siguienteImporte', () => {
  const escribir = (d: string) => (dig: string) => dig + d;
  const borrar = () => (dig: string) => dig.slice(0, -1);
  const sumar = (monto: number) => (dig: string) => String((parseInt(dig, 10) || 0) + monto);

  it('escribe el primer dígito sobre el visor vacío', () => {
    expect(siguienteImporte('', escribir('5'))).toBe(5);
  });

  it('encadena dígitos ignorando el formato del visor', () => {
    // El visor guarda "100.000"; los puntos de miles no son dígitos del importe.
    expect(siguienteImporte('100.000', escribir('0'))).toBe(1000000);
  });

  it('borra el último dígito', () => {
    expect(siguienteImporte('100.000', borrar())).toBe(10000);
  });

  it('borrar hasta vaciar devuelve cero', () => {
    expect(siguienteImporte('5', borrar())).toBe(0);
  });

  it('borrar sobre el visor vacío se queda en cero', () => {
    expect(siguienteImporte('', borrar())).toBe(0);
  });

  it('suma una denominación sobre lo que ya hay', () => {
    // Dos billetes de 50.000 son 100.000: es como se cuenta plata en el mostrador.
    expect(siguienteImporte('50.000', sumar(50000))).toBe(100000);
  });

  it('suma una denominación sobre el visor vacío', () => {
    expect(siguienteImporte('', sumar(20000))).toBe(20000);
  });

  it('un visor sin dígitos no es un importe', () => {
    expect(siguienteImporte('Gs', escribir(''))).toBe(0);
  });
});
