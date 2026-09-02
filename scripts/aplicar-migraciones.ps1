# Aplica las migraciones pendientes con psql.
#
# POR QUE NO `supabase db push`:
#
# El CLI de Supabase se distribuye como un binario sin firma de codigo, y
# Smart App Control de Windows 11 lo bloquea antes de que llegue a correr
# ("Una directiva de Control de aplicaciones bloqueo este archivo"). Apagar esa
# proteccion es irreversible sin reinstalar Windows, asi que no es el camino.
#
# psql viene con la instalacion de PostgreSQL, esta firmado, y hace el mismo
# trabajo: aplicar SQL contra la base.
#
# OJO, UNA DIFERENCIA QUE IMPORTA:
#
# `supabase db push` ademas anota cada migracion en la tabla
# `supabase_migrations.schema_migrations`. Este script NO lo hace: aplica el
# SQL y nada mas. Si algun dia el CLI llega a funcionar, va a creer que estas
# migraciones nunca se aplicaron. Para ese caso existe:
#
#     supabase migration repair --status applied <version>
#
# Uso:
#     powershell -ExecutionPolicy Bypass -File scripts\aplicar-migraciones.ps1
#
#     -Directa   conecta a db.<ref>.supabase.co en vez del pooler. Sirve si el
#                pooler es el que da problemas; necesita IPv6 o el add-on IPv4.
#
# La contrasena que pide es la del usuario `postgres` de la BASE --no la de la
# cuenta de Supabase ni la del panel--. Si ya la rotaste, es la nueva. Se
# genera en: Settings -> Database -> Reset database password

param([switch]$Directa)

$ErrorActionPreference = 'Stop'

$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not (Test-Path $psql)) {
    $encontrado = Get-ChildItem 'C:\Program Files\PostgreSQL' -Recurse -Filter psql.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($encontrado) { $psql = $encontrado.FullName }
    else { Write-Host 'No se encontro psql.exe' -ForegroundColor Red; exit 1 }
}

# La cadena de conexion sale del proyecto ya vinculado, para no tener que
# copiarla a mano ni dejarla escrita en ningun lado.
$poolerFile = Join-Path $PSScriptRoot '..\supabase\.temp\pooler-url'
if (-not (Test-Path $poolerFile)) {
    Write-Host 'No se encontro supabase/.temp/pooler-url' -ForegroundColor Red
    Write-Host 'Sacala de: Project Settings -> Database -> Connection string -> URI'
    exit 1
}
$conn = (Get-Content $poolerFile -Raw).Trim()

if ($Directa) {
    $refFile = Join-Path $PSScriptRoot '..\supabase\.temp\project-ref'
    if (-not (Test-Path $refFile)) { Write-Host 'No se encontro project-ref' -ForegroundColor Red; exit 1 }
    $ref = (Get-Content $refFile -Raw).Trim()
    $conn = "postgresql://postgres@db.$ref.supabase.co:5432/postgres"
}

# Se muestra a donde va a conectar, sin la contrasena, para que no queden dudas
# sobre que usuario se esta usando cuando el servidor rechaza el acceso.
$usuario = ($conn -replace '^postgresql://', '') -replace '@.*$', ''
$destino = $conn -replace '^.*@', ''
Write-Host ''
Write-Host "Usuario : $usuario" -ForegroundColor DarkGray
Write-Host "Destino : $destino" -ForegroundColor DarkGray

# Solo las que faltan. Las 21 anteriores ya estan en la base: el sistema
# funciona con ellas.
# Las 7 de agosto ya se aplicaron el 2026-08-29. Quedan comentadas en vez de
# borradas para que se vea que el orden no cambio; son idempotentes salvo los
# ALTER TABLE de 20260828000001, asi que no conviene repetirlas.
$migraciones = @(
    # '20260827000001_cerrar_caja_movimientos.sql',      # aplicada
    # '20260827000002_blindar_funciones_auth.sql',       # aplicada
    # '20260828000001_pagos_en_transaccion_y_arqueo.sql',# aplicada
    # '20260828000002_fiado_transaccional.sql',          # aplicada
    # '20260828000003_anular_venta_revierte_fiado.sql',  # aplicada
    # '20260828000004_crear_devolucion.sql',             # aplicada
    # '20260828000005_registrar_compra.sql',             # aplicada
    # '20260829000001_cerrar_anon_y_rls.sql',            # aplicada
    '20260829000002_auth_migrar_usuarios.sql',
    '20260829000003_rls_por_rol.sql'
)

$dirMigraciones = Join-Path $PSScriptRoot '..\supabase\migrations'

Write-Host ''
Write-Host "Se van a aplicar $($migraciones.Count) migraciones, en orden:" -ForegroundColor Cyan
foreach ($m in $migraciones) { Write-Host "   $m" }
Write-Host ''
Write-Host 'Cada una corre en su propia transaccion: si una falla, esa vuelve atras' -ForegroundColor DarkGray
Write-Host 'entera y el script se detiene ahi, sin tocar las siguientes.' -ForegroundColor DarkGray
Write-Host ''

$sec = Read-Host 'Contrasena de la base (usuario postgres)' -AsSecureString
$env:PGPASSWORD = [System.Net.NetworkCredential]::new('', $sec).Password

# Probar la conexion antes de tocar nada: si la contrasena esta mal, que se
# sepa en dos segundos y no a la mitad de una migracion.
Write-Host ''
Write-Host 'Probando la conexion...' -ForegroundColor DarkGray
$prueba = & $psql $conn -tAc 'SELECT 1' 2>&1
if ($LASTEXITCODE -ne 0) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Write-Host ''
    Write-Host 'No se pudo conectar. No se aplico ninguna migracion.' -ForegroundColor Red
    Write-Host ''
    $prueba | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    Write-Host ''
    if ("$prueba" -match 'password authentication failed') {
        Write-Host 'La contrasena no es la correcta:' -ForegroundColor Yellow
        Write-Host '  - Es la del usuario postgres de la BASE, no la de tu cuenta de' -ForegroundColor Yellow
        Write-Host '    Supabase ni la del panel.' -ForegroundColor Yellow
        Write-Host '  - Si ya la rotaste, es la NUEVA.' -ForegroundColor Yellow
        Write-Host '  - Si no la tenes a mano, generala en:' -ForegroundColor Yellow
        Write-Host '    Settings -> Database -> Reset database password' -ForegroundColor Yellow
    } else {
        Write-Host 'Si el pooler es el que no responde, proba con la conexion directa:' -ForegroundColor Yellow
        Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\aplicar-migraciones.ps1 -Directa' -ForegroundColor Yellow
    }
    exit 1
}
Write-Host 'Conexion OK' -ForegroundColor Green
Write-Host ''

$aplicadas = 0
try {
    foreach ($m in $migraciones) {
        $ruta = Join-Path $dirMigraciones $m
        if (-not (Test-Path $ruta)) {
            Write-Host "FALTA el archivo: $m" -ForegroundColor Red
            break
        }

        Write-Host "-> $m" -ForegroundColor Yellow

        # -1            : todo el archivo en una sola transaccion
        # ON_ERROR_STOP : que no siga ejecutando despues de un error
        #
        # Salvo que el archivo ya traiga su propio BEGIN/COMMIT: ahi `-1` se
        # pisa con el, el COMMIT de adentro cierra la transaccion de afuera
        # antes de tiempo y psql avisa "there is no transaction in progress".
        # Esas migraciones ya son atomicas por si mismas, asi que van sin -1.
        $tieneTransaccion = Select-String -Path $ruta -Pattern '^\s*BEGIN\s*;' -Quiet
        if ($tieneTransaccion) {
            & $psql $conn -v ON_ERROR_STOP=1 -f $ruta
        } else {
            & $psql $conn -v ON_ERROR_STOP=1 -1 -f $ruta
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Host ''
            Write-Host "FALLO en $m (codigo $LASTEXITCODE)." -ForegroundColor Red
            Write-Host 'Esa migracion se revirtio entera. Las anteriores quedaron aplicadas.' -ForegroundColor Red
            break
        }

        $aplicadas++
        Write-Host "   ok" -ForegroundColor Green
    }
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host ''
if ($aplicadas -eq $migraciones.Count) {
    Write-Host "Listo: $aplicadas de $($migraciones.Count) aplicadas." -ForegroundColor Green
} else {
    Write-Host "Aplicadas $aplicadas de $($migraciones.Count)." -ForegroundColor Yellow
    Write-Host 'Corregi el error y volve a correr el script: sacando de la lista las' -ForegroundColor Yellow
    Write-Host 'que ya pasaron, o dejandolas (las que son CREATE OR REPLACE se pueden' -ForegroundColor Yellow
    Write-Host 'repetir sin problema; las que hacen ALTER TABLE, no).' -ForegroundColor Yellow
}
