import 'dotenv/config';
import {
  crearCliente,
  obtenerClientes,
  actualizarCliente,
} from '../src/main/services/clienteService.js';

const NOMBRE_PRUEBA = 'Cliente Test Smoke 01';
const TELEFONO_NUEVO = '0981-123-456';

async function probarClienteService(): Promise<void> {
  console.log('Smoke test de clienteService (crear -> listar -> actualizar)\n');

  // 1. Crear cliente. El servicio loggea internamente si falla; el throw sube al catch top-level.
  const creado = await crearCliente({
    nombre: NOMBRE_PRUEBA,
    email: 'smoke@test.local',
    telefono: '0000-000-000',
    direccion: 'Direccion de prueba',
  });
  console.log(`[OK] crearCliente -> id_cliente=${creado.id_cliente}`);
  console.log(creado);

  // 2. Listar y verificar que el registro recién creado aparece.
  const lista = await obtenerClientes();
  const encontrado = lista.find((c) => c.id_cliente === creado.id_cliente);
  if (!encontrado) {
    throw new Error(
      `obtenerClientes() devolvio ${lista.length} fila(s) pero ninguna con id_cliente=${creado.id_cliente}`,
    );
  }
  console.log(
    `\n[OK] obtenerClientes -> ${lista.length} fila(s); el registro nuevo aparece en la lista.`,
  );

  // 3. Actualizar el telefono.
  const actualizado = await actualizarCliente(creado.id_cliente, {
    telefono: TELEFONO_NUEVO,
  });
  console.log(`\n[OK] actualizarCliente -> telefono="${actualizado.telefono}"`);
  console.log(actualizado);

  // 4. Validar el resultado de la actualizacion.
  if (actualizado.telefono !== TELEFONO_NUEVO) {
    throw new Error(
      `Telefono esperado "${TELEFONO_NUEVO}" pero la BD devolvio "${actualizado.telefono}"`,
    );
  }
  if (actualizado.id_cliente !== creado.id_cliente) {
    throw new Error(
      `id_cliente cambio: era ${creado.id_cliente}, ahora ${actualizado.id_cliente}`,
    );
  }
  if (actualizado.nombre !== NOMBRE_PRUEBA) {
    throw new Error(
      `Nombre mutado inesperadamente: "${actualizado.nombre}" vs "${NOMBRE_PRUEBA}"`,
    );
  }

  console.log('\n[OK] Validacion: telefono actualizado, resto de campos intactos.');
  console.log('\nSmoke test completo. Todas las operaciones exitosas.');
}

// Top-level: setea exitCode en lugar de process.exit() para evitar el assertion
// UV_HANDLE_CLOSING de libuv en Windows cuando hay sockets HTTPS de Supabase
// todavia cerrandose. El event loop drena solo y el proceso termina limpio.
probarClienteService().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error);
  console.error('\n[ERROR] Smoke test interrumpido:', mensaje);
  process.exitCode = 1;
});
