# Comprueba contra la base que las migraciones hicieron lo que dicen.
#
# No alcanza con que `psql` haya dicho CREATE FUNCTION: lo que importa es que
# los permisos hayan quedado cerrados y que los CHECK acepten los valores
# nuevos. Esto es de solo lectura, no modifica nada.
#
# Uso:
#     powershell -ExecutionPolicy Bypass -File scripts\verificar-migraciones.ps1
#     powershell -ExecutionPolicy Bypass -File scripts\verificar-migraciones.ps1 -Directa

param([switch]$Directa)

$ErrorActionPreference = 'Stop'

$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not (Test-Path $psql)) {
    $encontrado = Get-ChildItem 'C:\Program Files\PostgreSQL' -Recurse -Filter psql.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($encontrado) { $psql = $encontrado.FullName }
    else { Write-Host 'No se encontro psql.exe' -ForegroundColor Red; exit 1 }
}

$conn = (Get-Content (Join-Path $PSScriptRoot '..\supabase\.temp\pooler-url') -Raw).Trim()
if ($Directa) {
    $ref = (Get-Content (Join-Path $PSScriptRoot '..\supabase\.temp\project-ref') -Raw).Trim()
    $conn = "postgresql://postgres@db.$ref.supabase.co:5432/postgres"
}

$sec = Read-Host 'Contrasena de la base (usuario postgres)' -AsSecureString
$env:PGPASSWORD = [System.Net.NetworkCredential]::new('', $sec).Password

$sql = @'
\pset border 2
\echo ''
\echo '== 1. Las funciones estan, y con la firma nueva =='
SELECT proname AS funcion,
       CASE WHEN prosecdef THEN 'definer' ELSE 'invoker' END AS seguridad
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('registrar_venta','cerrar_caja','anular_venta','crear_devolucion',
                   'registrar_compra','registrar_compra_fiado','registrar_amortizacion')
 ORDER BY proname, oid;

\echo ''
\echo '== 2. C-06: verificar_usuario y crear_usuario cerradas al REST publico =='
\echo '   (lo correcto es que NO aparezca ni PUBLIC ni anon)'
SELECT p.proname AS funcion,
       COALESCE(string_agg(a.grantee, ', '), '(nadie mas que el dueno)') AS puede_ejecutar
  FROM pg_proc p
  LEFT JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) ac ON true
  LEFT JOIN LATERAL (
      SELECT CASE WHEN ac.grantee = 0 THEN 'PUBLIC'
                  ELSE pg_get_userbyid(ac.grantee) END AS grantee
       WHERE ac.privilege_type = 'EXECUTE'
  ) a ON true
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('verificar_usuario','crear_usuario')
 GROUP BY p.proname
 ORDER BY p.proname;

\echo ''
\echo '== 3. Los CHECK aceptan los medios nuevos =='
SELECT conrelid::regclass AS tabla, conname AS restriccion,
       CASE
         WHEN pg_get_constraintdef(oid) LIKE '%credito%' AND pg_get_constraintdef(oid) LIKE '%cheque%'
           THEN 'OK: acepta credito y cheque'
         ELSE 'REVISAR: ' || pg_get_constraintdef(oid)
       END AS estado
  FROM pg_constraint
 WHERE conname IN ('ventas_tipo_pago_check','pagos_venta_medio_pago_check')
 ORDER BY 1;

\echo ''
\echo '== 4. cerrar_caja lee de pagos_venta (no de ventas.tipo_pago) =='
SELECT CASE
         WHEN prosrc LIKE '%pagos_venta%' THEN 'OK: usa el desglose real de pagos'
         ELSE 'REVISAR: todavia deduce el efectivo de tipo_pago'
       END AS estado
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace AND proname = 'cerrar_caja';

\echo ''
\echo '== 5. C-02: anon no llega a nada, service_role sigue operando =='
\echo '   (anon debe dar f en todo; service_role debe dar t en todo)'
SELECT tabla,
       has_table_privilege('anon', tabla, 'SELECT') AS anon_lee,
       has_table_privilege('anon', tabla, 'INSERT') AS anon_escribe,
       has_table_privilege('service_role', tabla, 'SELECT') AS caja_lee,
       has_table_privilege('service_role', tabla, 'INSERT') AS caja_escribe
  FROM (VALUES ('public.ventas'), ('public.productos'), ('public.clientes'),
               ('public.usuarios'), ('public.arqueos_caja')) AS t(tabla);

\echo ''
\echo '== 6. C-02: RLS habilitado en todo el schema =='
SELECT count(*) FILTER (WHERE relrowsecurity)     AS con_rls,
       count(*) FILTER (WHERE NOT relrowsecurity) AS sin_rls,
       CASE WHEN count(*) FILTER (WHERE NOT relrowsecurity) = 0
            THEN 'OK: todas las tablas protegidas'
            ELSE 'REVISAR: quedan tablas sin RLS' END AS estado
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r';

\echo ''
\echo '== 7. anular_venta revierte la cuenta corriente =='
SELECT CASE
         WHEN prosrc LIKE '%saldo_deudor%' THEN 'OK: toca el saldo del cliente'
         ELSE 'REVISAR: no revierte el fiado'
       END AS estado
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace AND proname = 'anular_venta';
'@

try {
    $sql | & $psql $conn -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { Write-Host 'Fallo la verificacion' -ForegroundColor Red; exit 1 }
    Write-Host ''
    Write-Host 'Verificacion terminada.' -ForegroundColor Green
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
