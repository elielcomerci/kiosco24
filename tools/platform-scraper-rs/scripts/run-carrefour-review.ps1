param(
    [int]$MaxCategories = 14,
    [Nullable[int]]$Limit = $null,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scraperRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$exePath = Join-Path $scraperRoot "target\release\platform-scraper-rs.exe"
$outputDir = Join-Path $scraperRoot "output"
$latestRunFile = Join-Path $outputDir "latest-run.txt"
$dashboardPath = Join-Path $outputDir "live-dashboard.html"

if (-not (Test-Path $exePath)) {
    throw "No encontre el ejecutable en $exePath. Compilalo primero con cargo build --release."
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Set-Location $scraperRoot

$state = [ordered]@{
    Phase = "Preparando"
    StartedAt = Get-Date
    LastUpdated = Get-Date
    RunId = $null
    CategoriesTotal = 0
    CurrentCategoryIndex = 0
    CurrentCategoryUrl = $null
    CurrentPageNumber = $null
    CurrentPageUrl = $null
    ExtractedCount = 0
    StatusCounts = [ordered]@{}
    Products = New-Object System.Collections.ArrayList
    Logs = New-Object System.Collections.ArrayList
    ReviewPath = $null
    Error = $null
}

function Add-Log {
    param([string]$Message)

    if ([string]::IsNullOrWhiteSpace($Message)) {
        return
    }

    [void]$state.Logs.Add("[$(Get-Date -Format 'HH:mm:ss')] $Message")
    while ($state.Logs.Count -gt 80) {
        $state.Logs.RemoveAt(0)
    }
}

function Get-FileUrl {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    return ([System.Uri]$Path).AbsoluteUri
}

function Write-DashboardHtml {
    $enc = [System.Net.WebUtility]
    $reviewUrl = Get-FileUrl $state.ReviewPath
    $productsHtml = ""
    $products = @($state.Products)
    [array]::Reverse($products)
    $products = $products | Select-Object -First 48

    foreach ($product in $products) {
        if ($product.image) {
            $imageHtml = "<img src=""$($enc::HtmlEncode($product.image))"" alt=""preview"" />"
        } else {
            $imageHtml = "<div class=""image-placeholder"">Sin imagen</div>"
        }

        if ($product.barcode) { $barcode = $product.barcode } else { $barcode = "(sin EAN)" }
        if ($product.categoryName) { $category = $product.categoryName } else { $category = "Sin categoria" }
        if ($product.presentation) { $presentation = $product.presentation } else { $presentation = "Sin presentacion" }
        if ($product.syncStatus) { $status = $product.syncStatus } else { $status = "PENDING" }
        if ($product.sourceUrl) {
            $sourceLink = "<a href=""$($enc::HtmlEncode($product.sourceUrl))"" target=""_blank"" rel=""noreferrer"">Ver origen</a>"
        } else {
            $sourceLink = "<span class=""muted"">Sin origen</span>"
        }

        $productsHtml += @"
<article class="product-card">
  <div class="product-image">$imageHtml</div>
  <div class="product-body">
    <div class="product-top">
      <div>
        <h3>$($enc::HtmlEncode($product.name))</h3>
        <p class="muted">$($enc::HtmlEncode($barcode))</p>
      </div>
      <span class="pill status-$($status.ToLowerInvariant())">$($enc::HtmlEncode($status))</span>
    </div>
    <p class="meta">$($enc::HtmlEncode($category)) | $($enc::HtmlEncode($presentation))</p>
    <div class="product-footer">
      <span class="muted">ID: $($enc::HtmlEncode($product.id))</span>
      $sourceLink
    </div>
  </div>
</article>
"@
    }

    if (-not $productsHtml) {
        $productsHtml = '<div class="empty">Todavia no hay productos listos para mostrar.</div>'
    }

    $statusChips = ""
    foreach ($key in $state.StatusCounts.Keys) {
        $statusChips += "<span class=""pill"">$($enc::HtmlEncode($key)): $($state.StatusCounts[$key])</span>"
    }
    if (-not $statusChips) {
        $statusChips = '<span class="pill">Sin resumen todavia</span>'
    }

    $logsHtml = ""
    $logs = @($state.Logs)
    [array]::Reverse($logs)
    foreach ($line in ($logs | Select-Object -First 20)) {
        $logsHtml += "<li>$($enc::HtmlEncode($line))</li>"
    }
    if (-not $logsHtml) {
        $logsHtml = "<li>Esperando actividad...</li>"
    }

    if ($reviewUrl) {
        $reviewHtml = "<a class=""review-link"" href=""$reviewUrl"">Abrir review final</a>"
    } else {
        $reviewHtml = "<span class=""muted"">Review todavia no generado</span>"
    }

    if ($state.Error) {
        $errorHtml = "<div class=""error-box"">$($enc::HtmlEncode($state.Error))</div>"
    } else {
        $errorHtml = ""
    }

    if ($state.CurrentPageNumber) {
        $pageValue = $state.CurrentPageNumber
    } else {
        $pageValue = "-"
    }

    if ($state.CurrentCategoryUrl) {
        $categoryValue = $state.CurrentCategoryUrl
    } else {
        $categoryValue = "Esperando categoria"
    }

    if ($state.RunId) {
        $runValue = $state.RunId
    } else {
        $runValue = "Todavia sin run id"
    }

    $html = @"
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="2" />
  <title>Scrapper Carrefour en vivo</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07111d;
      --panel: #0f1c2b;
      --panel-2: #132538;
      --line: #28415d;
      --text: #eef6ff;
      --muted: #9eb6ce;
      --ok: #24d67b;
      --warn: #f5b942;
      --danger: #ff6b6b;
      --accent: #64c4ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top, #10233a 0%, var(--bg) 58%);
      color: var(--text);
      font-family: system-ui, sans-serif;
      padding: 24px;
    }
    .wrap {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }
    .hero, .panel {
      background: rgba(15, 28, 43, 0.94);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 22px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: 34px;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-top: 18px;
    }
    .stat {
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
    }
    .label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
    .value {
      margin-top: 6px;
      font-size: 24px;
      font-weight: 800;
    }
    .two-col {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
      gap: 20px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #18314a;
      color: var(--text);
      margin: 0 8px 8px 0;
      font-size: 12px;
      font-weight: 700;
    }
    .status-new { background: rgba(100, 196, 255, 0.12); border-color: rgba(100, 196, 255, 0.42); color: #9fdcff; }
    .status-matched { background: rgba(36, 214, 123, 0.12); border-color: rgba(36, 214, 123, 0.42); color: #86f1b7; }
    .status-conflict { background: rgba(245, 185, 66, 0.12); border-color: rgba(245, 185, 66, 0.42); color: #ffd88a; }
    .status-published { background: rgba(122, 110, 255, 0.16); border-color: rgba(122, 110, 255, 0.44); color: #c9c1ff; }
    .muted { color: var(--muted); }
    .products {
      display: grid;
      gap: 14px;
    }
    .product-card {
      display: grid;
      grid-template-columns: 116px minmax(0, 1fr);
      gap: 16px;
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 14px;
      align-items: center;
    }
    .product-image img, .image-placeholder {
      width: 100%;
      height: 100px;
      object-fit: contain;
      border-radius: 16px;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #44576d;
      font-weight: 700;
    }
    .product-top {
      display: flex;
      gap: 16px;
      justify-content: space-between;
      align-items: start;
    }
    .product-top h3 {
      margin: 0 0 4px;
      font-size: 20px;
    }
    .meta {
      margin: 10px 0 12px;
      color: var(--muted);
    }
    .product-footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 13px;
    }
    .product-footer a, .review-link {
      color: var(--accent);
      text-decoration: none;
      font-weight: 700;
    }
    .logs {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 10px;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 13px;
    }
    .logs li {
      padding: 10px 12px;
      border-radius: 14px;
      background: var(--panel-2);
      border: 1px solid var(--line);
    }
    .error-box {
      margin-top: 12px;
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(255, 107, 107, 0.12);
      border: 1px solid rgba(255, 107, 107, 0.4);
      color: #ffc2c2;
      font-weight: 700;
    }
    .empty {
      padding: 24px;
      border-radius: 18px;
      border: 1px dashed var(--line);
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 980px) {
      body { padding: 16px; }
      .two-col { grid-template-columns: 1fr; }
      .product-card { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Scrapper Carrefour en vivo</h1>
      <p>Extraccion local en Rust, imagenes localizadas en media.zap.com.ar y comparacion contra la base colaborativa de kiosco24.</p>
      <div class="stats">
        <div class="stat">
          <div class="label">Fase</div>
          <div class="value">$($enc::HtmlEncode($state.Phase))</div>
        </div>
        <div class="stat">
          <div class="label">Run</div>
          <div class="value" style="font-size:16px; line-height:1.4;">$($enc::HtmlEncode($runValue))</div>
        </div>
        <div class="stat">
          <div class="label">Productos listos</div>
          <div class="value">$($state.ExtractedCount)</div>
        </div>
        <div class="stat">
          <div class="label">Pagina actual</div>
          <div class="value">$($enc::HtmlEncode([string]$pageValue))</div>
        </div>
      </div>
      <div style="margin-top:16px;">
        <span class="pill">Categorias: $($state.CurrentCategoryIndex) / $($state.CategoriesTotal)</span>
        $statusChips
      </div>
      <div style="margin-top:12px;" class="muted">Categoria actual: $($enc::HtmlEncode($categoryValue))</div>
      <div class="muted" style="margin-top:6px;">Ultima actualizacion: $($state.LastUpdated.ToString("dd/MM/yyyy HH:mm:ss"))</div>
      <div style="margin-top:14px;">$reviewHtml</div>
      $errorHtml
    </section>

    <section class="two-col">
      <section class="panel">
        <h2 style="margin-top:0;">Productos detectados</h2>
        <p class="muted">Se actualiza solo cada 2 segundos. Muestra foto, EAN y estado de comparacion apenas el producto queda guardado en staging.</p>
        <div class="products">
          $productsHtml
        </div>
      </section>

      <aside class="panel">
        <h2 style="margin-top:0;">Actividad reciente</h2>
        <ul class="logs">
          $logsHtml
        </ul>
      </aside>
    </section>
  </div>
</body>
</html>
"@

    Set-Content -Path $dashboardPath -Value $html -Encoding UTF8
}

function Update-StateFromLine {
    param([string]$Line)

    $state.LastUpdated = Get-Date

    if ($Line.StartsWith("__SCRAPER_EVENT__")) {
        $payload = $Line.Substring("__SCRAPER_EVENT__".Length)
        try {
            $event = $payload | ConvertFrom-Json
            if ($event.type -eq "staged_product") {
                [void]$state.Products.Add([ordered]@{
                    id = [string]$event.id
                    name = [string]$event.name
                    barcode = [string]$event.barcode
                    categoryName = [string]$event.categoryName
                    presentation = [string]$event.presentation
                    image = [string]$event.image
                    sourceUrl = [string]$event.sourceUrl
                    syncStatus = [string]$event.syncStatus
                })
                $state.ExtractedCount = $state.Products.Count
                if (-not $state.StatusCounts.Contains($event.syncStatus)) {
                    $state.StatusCounts[$event.syncStatus] = 0
                }
                $state.StatusCounts[$event.syncStatus] = [int]$state.StatusCounts[$event.syncStatus] + 1
                Add-Log "Producto listo: $($event.name) [$($event.syncStatus)]"
            }
        } catch {
            Add-Log "No pude interpretar el evento del scrapper."
        }
        return
    }

    Add-Log $Line

    if ($Line -match "Run creado:\s+([0-9a-fA-F-]+)") {
        $state.RunId = $matches[1]
        $state.Phase = "Escaneando"
        return
    }

    if ($Line -match "Categorias a recorrer:\s+(\d+)") {
        $state.CategoriesTotal = [int]$matches[1]
        return
    }

    if ($Line -match "Categoria\s+(\d+)\/(\d+):\s+(.+)$") {
        $state.CurrentCategoryIndex = [int]$matches[1]
        $state.CategoriesTotal = [int]$matches[2]
        $state.CurrentCategoryUrl = $matches[3]
        $state.CurrentPageNumber = $null
        $state.CurrentPageUrl = $null
        return
    }

    if ($Line -match "P.gina\s+(\d+)\s*->\s*(https?://.+)$") {
        $state.CurrentPageNumber = [int]$matches[1]
        $state.CurrentPageUrl = $matches[2]
        return
    }

    if ($Line -match "Run\s+[0-9a-fA-F-]+\s+completo\.") {
        $state.Phase = "Scan completo"
        return
    }

    if ($Line -match "^\s*-\s*([A-Z]+):\s*(\d+)\s*$") {
        $state.StatusCounts[$matches[1]] = [int]$matches[2]
        return
    }

    if ($Line -match "^Generando review") {
        $state.Phase = "Generando review"
        return
    }

    if ($Line -match "^Reporte generado:\s+(.+)$") {
        $state.Phase = "Review listo"
        $state.ReviewPath = $matches[1]
        return
    }

    if ($Line -match "^Proceso terminado\.") {
        $state.Phase = "Completado"
        return
    }
}

Write-DashboardHtml
if (-not $NoOpen) {
    Start-Process $dashboardPath
}

$scanArgs = @(
    "scan",
    "--source", "carrefour",
    "--url", "https://www.carrefour.com.ar/",
    "--root-url", "https://www.carrefour.com.ar/",
    "--discover-categories",
    "--max-categories", $MaxCategories
)

if ($null -ne $Limit) {
    $scanArgs += @("--limit", $Limit)
}

Write-Host "Iniciando scan de Carrefour..." -ForegroundColor Cyan
$state.Phase = "Escaneando"
Write-DashboardHtml

& $exePath @scanArgs 2>&1 | ForEach-Object {
    $line = [string]$_
    Write-Host $line
    Update-StateFromLine $line
    Write-DashboardHtml
}
$scanExitCode = $LASTEXITCODE

if ($scanExitCode -ne 0) {
    $state.Phase = "Error"
    $state.Error = "El scan termino con codigo $scanExitCode."
    Write-DashboardHtml
    throw "El scan termino con codigo $scanExitCode."
}

if ([string]::IsNullOrWhiteSpace($state.RunId)) {
    $state.Phase = "Error"
    $state.Error = "No pude detectar el run id en la salida del scan."
    Write-DashboardHtml
    throw "No pude detectar el run id en la salida del scan."
}

Set-Content -Path $latestRunFile -Value $state.RunId -Encoding UTF8
Write-Host "Run detectado: $($state.RunId)" -ForegroundColor Green
Add-Log "Run detectado: $($state.RunId)"
Write-DashboardHtml

$reviewArgs = @("review", "--run-id", $state.RunId)
if (-not $NoOpen) {
    $reviewArgs += "--open-html"
}

Write-Host "Generando review..." -ForegroundColor Cyan
$state.Phase = "Generando review"
Write-DashboardHtml

& $exePath @reviewArgs 2>&1 | ForEach-Object {
    $line = [string]$_
    Write-Host $line
    Update-StateFromLine $line
    Write-DashboardHtml
}
$reviewExitCode = $LASTEXITCODE

if ($reviewExitCode -ne 0) {
    $state.Phase = "Error"
    $state.Error = "El review termino con codigo $reviewExitCode."
    Write-DashboardHtml
    throw "El review termino con codigo $reviewExitCode."
}

Write-Host ""
Write-Host "Proceso terminado." -ForegroundColor Green
Write-Host "Run: $($state.RunId)"
Write-Host "Guardado tambien en: $latestRunFile"

$state.Phase = "Completado"
Add-Log "Proceso terminado. Run: $($state.RunId)"
Write-DashboardHtml
