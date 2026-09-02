$connStr = "Server=(localdb)\Migracion;Database=dacsoft3;Integrated Security=True;TrustServerCertificate=True;Encrypt=False"

$queries = @{
    "productos" = "SELECT codigo, codbarra, nombre, contado, prcostogs, stockactual, por_iva FROM Mercaderia ORDER BY codigo"
    "clientes" = "SELECT codigo, nombre, ruc, direccion, telefono, celular, limitecredito, saldoAfavor FROM Clientes ORDER BY codigo"
    "proveedores" = "SELECT codigo, nombre, ruc, direccion, telefono FROM Proveedores ORDER BY codigo"
    "ventas" = "SELECT numero, serie, fecha, clientes, total, efectivo, vuelto, anulado, NumeroFactura, sub_total_gr, iva FROM Venta ORDER BY numero"
    "detalle_ventas" = "SELECT dv.numero, dv.serie, dv.linea, dv.codmer, m.codbarra, dv.detalle, dv.cantidad, dv.unitario, dv.total FROM DVenta dv LEFT JOIN Mercaderia m ON dv.codmer = m.codigo ORDER BY dv.numero, dv.linea"
}

$outDir = "C:\Proyectos\Sistema_Facturacion\Backup\migracion"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()

foreach ($name in $queries.Keys) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $queries[$name]
    $da = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
    $dt = New-Object System.Data.DataTable
    [void]$da.Fill($dt)

    $rows = New-Object System.Collections.ArrayList
    foreach ($row in $dt.Rows) {
        $obj = New-Object PSObject
        foreach ($col in $dt.Columns) {
            $val = $row[$col.ColumnName]
            if ($val -is [DBNull]) { $val = $null }
            $obj | Add-Member -MemberType NoteProperty -Name $col.ColumnName -Value $val
        }
        [void]$rows.Add($obj)
    }

    $json = $rows | ConvertTo-Json -Depth 10
    $path = Join-Path $outDir "$name.json"
    $json | Out-File -FilePath $path -Encoding utf8
    Write-Host "  $name`: $($rows.Count) registros"
}

$conn.Close()
Write-Host "`nExportado a: $outDir"
