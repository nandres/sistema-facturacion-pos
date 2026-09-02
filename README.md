# Sistema de Facturación y Stock

Punto de venta y control de stock para supermercados en Paraguay. Aplicación de
escritorio Windows, pensada para el mostrador: se opera con lector de códigos de
barras y teclado, sin mouse, e imprime en ticketera térmica sin pasar por el
diálogo de impresión de Windows.

> **Software propietario.** Ver [LICENSE](LICENSE).

## Qué hace

- **Caja.** Escaneo continuo, modo cantidad, modo báscula (peso en gramos),
  venta a crédito, envases retornables, cálculo de vuelto y desglose de IVA.
- **Stock.** Alta y edición de productos, alertas por debajo del mínimo,
  importación desde Excel, impresión de etiquetas EAN-13.
- **Caja diaria.** Apertura, entradas y retiros de efectivo, cierre con arqueo
  y ticket Z.
- **Historial.** Reimpresión de tickets, anulaciones y notas de crédito con
  reposición de stock.
- **Compras, proveedores, cuentas por pagar y cobrar, cuenta corriente de
  clientes.**
- **Informes** de ganancias, envases, productos más vendidos y ventas por hora.
- **Modo offline.** La caja sigue vendiendo sin internet y sincroniza al volver.

## Stack

| Capa | Tecnología |
|---|---|
| Escritorio | Electron 31 |
| Interfaz | React 18 + TypeScript + Tailwind |
| Backend | Node.js (proceso main de Electron) |
| Base de datos | Supabase (PostgreSQL) |
| Empaquetado | electron-vite + electron-builder |

## Requisitos

- Node.js 18 o superior
- Windows 10/11 (la impresión ESC/POS escribe directo al puerto)
- Un proyecto de Supabase

## Instalación

```bash
npm install
cp .env.example .env
```

Completar `.env` con los datos del proyecto de Supabase:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TICKETERA_USB_ID=0x0416
TICKETERA_NOMBRE=5830 series
LECTOR_TIMEOUT=500
```

> **`.env` nunca se versiona.** Está en `.gitignore` y el historial del
> repositorio está verificado y limpio de credenciales.

Aplicar las migraciones de `supabase/migrations/` en orden, desde el SQL Editor
de Supabase o con la CLI.

## Comandos

```bash
npm run dev          # levanta la app en desarrollo
npm run typecheck    # chequea main Y renderer
npm run lint         # ESLint 9 (flat config)
npm test             # vitest: guaraní, IVA, roles y bytes del ticket
npm run build        # corre typecheck primero
npm run package      # genera el instalador
```

`npm run typecheck` no es opcional: Vite compila sin verificar tipos, así que
sin esto un error del renderer no aparece hasta ejecutar la aplicación.

## Arquitectura

```
src/
├── main/       proceso principal — services/ (negocio + Supabase), ipc/ (76 canales)
├── preload/    puente contextBridge que expone window.api
├── renderer/   React — components/ (pantallas), hooks/, contexts/
└── shared/     tipos y utilidades que cruzan procesos
```

Dos reglas que conviene saber antes de tocar código:

1. **Agregar un canal IPC toca cuatro archivos:** `shared/ipc/canales.ts`,
   `main/ipc/index.ts`, `preload/index.ts` y `shared/types/api.ts`. Un canal
   que existe de un lado y no del otro no falla al compilar: falla en
   producción.
2. **Todo lo que cruza IPC devuelve `Resultado<T>`** — `{ ok: true, data }` o
   `{ ok: false, codigo, mensaje }`. Hay que estrechar con `if (!r.ok)` antes
   de leer `mensaje`.

El renderer nunca habla con Supabase: todo pasa por IPC al proceso main, que es
el único que tiene la credencial.

## Hardware

- **Lector de códigos de barras.** USB, emula teclado, cierra cada lectura con
  `Enter`. El input de escaneo de la caja **no puede perder el foco** durante el
  cobro.
- **Ticketera térmica.** ESC/POS crudo al puerto, papel de 32 columnas. Los
  constructores `construirTicket()`, `construirNotaCredito()` y
  `construirEtiquetaCodigo()` devuelven bytes fijos, incluido el pulso que abre
  el cajón — **no se modifican**.

## Idioma

Las entidades del dominio, los nombres de tabla y los textos de interfaz van en
**español** (`productos`, `ventas`, `vuelto`, `arqueo`). Los comentarios de
código y los mensajes de commit también.

## Documentación

- **[AUDITORIA.md](AUDITORIA.md)** — auditoría en curso: hallazgos abiertos,
  plan por fases y restricciones del entorno. **Leerlo antes de tocar código.**
- **`Ideas_PrimerSoftware/`** — bóveda de Obsidian con la documentación del
  sistema, los hallazgos de seguridad y los procedimientos de operación. Abrir
  la carpeta como vault; el punto de entrada es `00 Índice del proyecto`.

## Publicar una versión

El repositorio **es** el canal de actualizaciones: cada terminal instalada lee
`version.json` de la rama principal para saber si hay algo nuevo. Publicar mal
ese archivo no rompe nada —el actualizador exige un `sha256` válido y aborta si
no lo tiene— pero tampoco actualiza a nadie.

1. `git tag v1.1.0 && git push --tags` dispara `.github/workflows/release.yml`,
   que construye el instalador en Windows y publica un Release **en borrador**.
2. El resumen del workflow imprime el `sha256` del `.exe`.
3. Copiar ese hash y la URL del `.exe` a `version.json`, y publicar el Release.

Hasta el paso 3, ninguna caja se entera de la versión nueva. Es a propósito.

## Estado

En uso. Verificaciones en verde: `typecheck`, `lint`, `test` (50 pruebas) y
`build`, con 0 errores y 0 warnings.

> **Antes de desplegar:** `20260901000001_venta_idempotente.sql` está escrita y
> sin aplicar. Cierra la duplicación de ventas al reintentar una venta offline.
> La verificación está al pie del propio archivo.
