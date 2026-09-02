import { app } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { obtenerClienteSupabase } from './baseService';
import { log } from './logger';

const BACKUP_DIR = 'SistemaFacturacionBackups';

function getBackupPath(): string {
  const docs = app.getPath('documents');
  const dir = join(docs, BACKUP_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export async function realizarBackup(): Promise<string | null> {
  try {
    const supabase = obtenerClienteSupabase();
    const fecha = new Date().toISOString().slice(0, 10);
    const archivo = join(getBackupPath(), `backup_${fecha}.json`);

    const [rProductos, rVentas, rArqueos, rCuentasPagar, rCuentasRecibir, rClientes, rEnvases] = await Promise.all([
      supabase.from('productos').select('*'),
      supabase.from('ventas').select('*').order('id_venta', { ascending: false }),
      supabase.from('arqueos_caja').select('*').order('id_arqueo', { ascending: false }),
      supabase.from('cuentas_pagar').select('*').order('id_cuenta', { ascending: false }),
      supabase.from('cuentas_recibir').select('*').order('id_cuenta', { ascending: false }),
      supabase.from('clientes').select('*'),
      supabase.from('envases').select('*'),
    ]);

    const data = {
      fecha: new Date().toISOString(),
      version: app.getVersion(),
      productos: rProductos.data || [],
      ventas: rVentas.data || [],
      arqueos_caja: rArqueos.data || [],
      cuentas_pagar: rCuentasPagar.data || [],
      cuentas_recibir: rCuentasRecibir.data || [],
      clientes: rClientes.data || [],
      envases: rEnvases.data || [],
    };

    await writeFile(archivo, JSON.stringify(data, null, 2), 'utf-8');
    log.info(`[backup] Backup guardado: ${archivo} (${Object.keys(data).length} tablas)`);
    return archivo;
  } catch (err) {
    log.error('[backup] Error al realizar backup:', err);
    return null;
  }
}
