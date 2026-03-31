param(
    [int]$MaxCategories = 14,
    [int]$Limit,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scraperRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$exePath = Join-Path $scraperRoot "target\release\platform-scraper-rs.exe"
$outputDir = Join-Path $scraperRoot "output"
$latestRunFile = Join-Path $outputDir "latest-run.txt"
$dashboardPath = Join-Path $outputDir "live-dashboard.html"
$latestBufferFile = Join-Path $outputDir "latest-buffer.txt"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
$encoding1252 = [System.Text.Encoding]::GetEncoding(1252)
$encoding850 = [System.Text.Encoding]::GetEncoding(850)

[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

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
    BufferPath = $null
    CategoriesTotal = 0
    CurrentCategoryIndex = 0
    CurrentCategoryUrl = $null
    CurrentPageNumber = $null
    CurrentPageUrl = $null
    ExtractedCount = 0
    BufferedCount = 0
    StagedCount = 0
    PendingCount = 0
    StatusCounts = [ordered]@{}
    Products = New-Object System.Collections.ArrayList
    Logs = New-Object System.Collections.ArrayList
    ReviewPath = $null
    Error = $null
}

function Get-ScanProgressPath {
    param([string]$RunId)

    if ([string]::IsNullOrWhiteSpace($RunId)) {
        return $null
    }

    return Join-Path $outputDir ("scan-progress-{0}.json" -f $RunId.Trim())
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

function Get-MojibakeScore {
    param([string]$Value)

    if ([string]::IsNullOrEmpty($Value)) {
        return 0
    }

    $score = 0
    foreach ($char in $Value.ToCharArray()) {
        $codePoint = [int][char]$char
        if ($codePoint -ge 0x2500 -and $codePoint -le 0x259F) {
            $score += 4
        }
        if (
            $codePoint -eq 0x00C2 -or
            $codePoint -eq 0x00C3 -or
            $codePoint -eq 0x00E2 -or
            $codePoint -eq 0xFFFD
        ) {
            $score += 3
        }
    }

    return $score
}

function Convert-EncodingToUtf8 {
    param(
        [string]$Value,
        [System.Text.Encoding]$SourceEncoding
    )

    try {
        $bytes = $SourceEncoding.GetBytes($Value)
        return $utf8Strict.GetString($bytes)
    } catch {
        return $null
    }
}

function Repair-MojibakeText {
    param([string]$Value)

    if ([string]::IsNullOrEmpty($Value)) {
        return $Value
    }

    $best = $Value
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        $changed = $false
        foreach ($sourceEncoding in @($encoding1252, $encoding850)) {
            $candidate = Convert-EncodingToUtf8 -Value $best -SourceEncoding $sourceEncoding
            if ([string]::IsNullOrEmpty($candidate)) {
                continue
            }

            if ((Get-MojibakeScore -Value $candidate) -lt (Get-MojibakeScore -Value $best)) {
                $best = $candidate
                $changed = $true
            }
        }

        if (-not $changed) {
            break
        }
    }

    return $best
}

function Get-FileUrl {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    return ([System.Uri]$Path).AbsoluteUri
}

function Update-StatusCounts {
    $counts = [ordered]@{}
    foreach ($product in $state.Products) {
        if (-not $product.syncStatus) {
            continue
        }
        if (-not $counts.Contains($product.syncStatus)) {
            $counts[$product.syncStatus] = 0
        }
        $counts[$product.syncStatus] = [int]$counts[$product.syncStatus] + 1
    }
    $state.StatusCounts = $counts
}

function Update-ProductListEntry {
    param($Product)

    for ($i = 0; $i -lt $state.Products.Count; $i++) {
        if ($state.Products[$i].id -eq $Product.id) {
            $state.Products[$i] = $Product
            $state.ExtractedCount = [Math]::Max($state.BufferedCount, $state.Products.Count)
            Update-StatusCounts
            return
        }
    }

    [void]$state.Products.Add($Product)
    $state.ExtractedCount = [Math]::Max($state.BufferedCount, $state.Products.Count)
    Update-StatusCounts
}

function Convert-BufferedProductToDashboardProduct {
    param(
        $Product,
        [int]$Index,
        [int]$FlushedCount
    )

    $syncStatus = if ($Index -lt $FlushedCount) { "STAGED" } else { "BUFFERED" }

    return [ordered]@{
        id = [string]$Product.id
        name = Repair-MojibakeText ([string]$Product.name)
        barcode = Repair-MojibakeText ([string]$Product.barcode)
        categoryName = Repair-MojibakeText ([string]$Product.category_name)
        presentation = Repair-MojibakeText ([string]$Product.presentation)
        image = [string]$Product.image
        sourceUrl = [string]$Product.source_url
        syncStatus = $syncStatus
    }
}

function Sync-StateFromBuffer {
    param(
        [switch]$LoadProducts
    )

    if ([string]::IsNullOrWhiteSpace($state.BufferPath) -or -not (Test-Path $state.BufferPath)) {
        return
    }

    $checkpointPath = [System.IO.Path]::ChangeExtension($state.BufferPath, "checkpoint.json")
    $flushedCount = 0
    if (Test-Path $checkpointPath) {
        try {
            $checkpoint = Get-Content $checkpointPath -Raw | ConvertFrom-Json
            if ($null -ne $checkpoint.flushed_count) {
                $flushedCount = [int]$checkpoint.flushed_count
            }
        } catch {
            $flushedCount = 0
        }
    }

    $bufferLines = @(Get-Content $state.BufferPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $bufferCount = $bufferLines.Count

    $state.BufferedCount = $bufferCount
    $state.StagedCount = [Math]::Min($flushedCount, $bufferCount)
    $state.PendingCount = [Math]::Max(0, $bufferCount - $state.StagedCount)
    $state.ExtractedCount = $bufferCount

    if (-not $LoadProducts) {
        return
    }

    $recentStart = [Math]::Max(0, $bufferCount - 48)
    for ($i = $recentStart; $i -lt $bufferCount; $i++) {
        try {
            $rawProduct = $bufferLines[$i] | ConvertFrom-Json
            $candidate = Convert-BufferedProductToDashboardProduct -Product $rawProduct -Index $i -FlushedCount $flushedCount

            $existingIndex = -1
            for ($j = 0; $j -lt $state.Products.Count; $j++) {
                if ($state.Products[$j].id -eq $candidate.id) {
                    $existingIndex = $j
                    break
                }
            }

            if ($existingIndex -ge 0) {
                $existingStatus = [string]$state.Products[$existingIndex].syncStatus
                if ($existingStatus -notin @("BUFFERED", "STAGED", "", $null)) {
                    continue
                }
                $state.Products[$existingIndex] = $candidate
            } else {
                [void]$state.Products.Add($candidate)
            }
        } catch {
            continue
        }
    }

    Update-StatusCounts
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

    $progressChips = @(
        "<span class=""pill"">En buffer: $($state.BufferedCount)</span>",
        "<span class=""pill"">En staging: $($state.StagedCount)</span>",
        "<span class=""pill"">Pendientes: $($state.PendingCount)</span>"
    ) -join ""

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
    .status-buffered { background: rgba(245, 185, 66, 0.12); border-color: rgba(245, 185, 66, 0.42); color: #ffd88a; }
    .status-staged { background: rgba(36, 214, 123, 0.12); border-color: rgba(36, 214, 123, 0.42); color: #86f1b7; }
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
          <div class="label">Productos detectados</div>
          <div class="value">$($state.ExtractedCount)</div>
        </div>
        <div class="stat">
          <div class="label">Pagina actual</div>
          <div class="value">$($enc::HtmlEncode([string]$pageValue))</div>
        </div>
      </div>
      <div style="margin-top:16px;">
        $progressChips
      </div>
      <div style="margin-top:8px;">
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
        <h2 style="margin-top:0;">Productos recientes</h2>
        <p class="muted">Se actualiza solo cada 2 segundos. El scan bufferiza primero y despues confirma el estado cuando cada lote de hasta 50 productos entra en staging.</p>
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

    if ($null -eq $Line) {
        return
    }

    $Line = Repair-MojibakeText $Line
    $state.LastUpdated = Get-Date

    if ($Line.StartsWith("__SCRAPER_EVENT__")) {
        $payload = $Line.Substring("__SCRAPER_EVENT__".Length)
        try {
            $scraperEvent = $payload | ConvertFrom-Json
            if ($scraperEvent.type -eq "staged_product") {
                Update-ProductListEntry ([ordered]@{
                    id = [string]$scraperEvent.id
                    name = Repair-MojibakeText ([string]$scraperEvent.name)
                    barcode = Repair-MojibakeText ([string]$scraperEvent.barcode)
                    categoryName = Repair-MojibakeText ([string]$scraperEvent.categoryName)
                    presentation = Repair-MojibakeText ([string]$scraperEvent.presentation)
                    image = [string]$scraperEvent.image
                    sourceUrl = [string]$scraperEvent.sourceUrl
                    syncStatus = Repair-MojibakeText ([string]$scraperEvent.syncStatus)
                })
                Sync-StateFromBuffer -LoadProducts
                Add-Log "Producto listo: $(Repair-MojibakeText ([string]$scraperEvent.name)) [$(Repair-MojibakeText ([string]$scraperEvent.syncStatus))]"
            }
        } catch {
            Add-Log "No pude interpretar el evento del scrapper."
        }
        return
    }

    Add-Log $Line

    if ($Line -match "Run (?:creado|reanudado):\s+([0-9a-fA-F-]+)") {
        $state.RunId = $matches[1]
        $state.Phase = "Escaneando"
        Set-Content -Path $latestRunFile -Value $state.RunId -Encoding UTF8
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

    if ($Line -match "^Buffer local:\s+(.+)$") {
        $state.BufferPath = $matches[1]
        Set-Content -Path $latestBufferFile -Value $state.BufferPath -Encoding UTF8
        Sync-StateFromBuffer -LoadProducts
        return
    }

    if (
        $Line -match "\|\s*EAN:" -or
        $Line -match "^  - Ya estaba en buffer" -or
        $Line -match "^Checkpoint de scan actualizado:" -or
        $Line -match "^Lote cargado" -or
        $Line -match "^Flush completado" -or
        $Line -match "^Productos ya cargados a staging:" -or
        $Line -match "^Pendientes de flush:"
    ) {
        Sync-StateFromBuffer -LoadProducts
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

$resumeRunId = $null
if (Test-Path $latestRunFile) {
    $candidateRunId = Get-Content -Path $latestRunFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $candidateRunId) {
        $candidateRunId = [string]$candidateRunId
    }
    if (-not [string]::IsNullOrWhiteSpace($candidateRunId)) {
        $candidateRunId = $candidateRunId.Trim()
        $candidateProgressPath = Get-ScanProgressPath $candidateRunId
        $candidateBufferPath = Join-Path $outputDir ("buffer-{0}.jsonl" -f $candidateRunId)
        if ((Test-Path $candidateProgressPath) -and (Test-Path $candidateBufferPath)) {
            $resumeRunId = $candidateRunId
            $state.RunId = $candidateRunId
            $state.BufferPath = $candidateBufferPath
            Sync-StateFromBuffer -LoadProducts
            Add-Log "Se detecto un run incompleto. Voy a reanudar $candidateRunId desde el ultimo checkpoint de pagina."
        }
    }
}

$scanArgs = @(
    "scan",
    "--source", "carrefour",
    "--url", "https://www.carrefour.com.ar/",
    "--root-url", "https://www.carrefour.com.ar/",
    "--discover-categories",
    "--max-categories", $MaxCategories,
    "--stage-batch-size", 50
)

if ($resumeRunId) {
    $scanArgs += @("--resume-run-id", $resumeRunId)
}

if ($PSBoundParameters.ContainsKey('Limit')) {
    $scanArgs += @("--limit", $Limit)
}

if ($resumeRunId) {
    Write-Host "Reanudando scan de Carrefour desde el ultimo checkpoint..." -ForegroundColor Cyan
} else {
    Write-Host "Iniciando scan de Carrefour..." -ForegroundColor Cyan
}
$state.Phase = "Escaneando"
Write-DashboardHtml

& $exePath @scanArgs 2>&1 | ForEach-Object {
    $line = Repair-MojibakeText ([string]$_)
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

# Guardar path del buffer si existe
if (-not [string]::IsNullOrWhiteSpace($state.BufferPath)) {
    Set-Content -Path $latestBufferFile -Value $state.BufferPath -Encoding UTF8
    Write-Host "Buffer detectado: $($state.BufferPath)" -ForegroundColor Green
}
Write-DashboardHtml

# Ejecutar flush para cargar productos desde el buffer a la DB
Write-Host ""
Write-Host "Cargando productos desde el buffer a la base de datos..." -ForegroundColor Cyan
$state.Phase = "Cargando buffer"
Write-DashboardHtml

$flushArgs = @("flush", "--batch-size", 50)
if (-not [string]::IsNullOrWhiteSpace($state.BufferPath)) {
    $flushArgs += @("--buffer-path", $state.BufferPath)
}

& $exePath @flushArgs 2>&1 | ForEach-Object {
    $line = Repair-MojibakeText ([string]$_)
    Write-Host $line
    Update-StateFromLine $line
    Write-DashboardHtml
}
$flushExitCode = $LASTEXITCODE

if ($flushExitCode -ne 0) {
    $state.Phase = "Error en flush"
    $state.Error = "El flush termino con codigo $flushExitCode. El buffer NO fue eliminado, podés reintentar."
    Write-DashboardHtml
    throw "El flush termino con codigo $flushExitCode."
}

Write-Host "Buffer cargado exitosamente." -ForegroundColor Green
if (-not [string]::IsNullOrWhiteSpace($state.BufferPath)) {
    Add-Log "El buffer se conserva en $($state.BufferPath) hasta validar el review final."
}

Write-Host ""
Write-Host "Resolviendo automaticamente los productos seguros..." -ForegroundColor Cyan
$state.Phase = "Resolviendo seguros"
Write-DashboardHtml

$resolveSafeArgs = @("resolve-safe", "--run-id", $state.RunId)

& $exePath @resolveSafeArgs 2>&1 | ForEach-Object {
    $line = Repair-MojibakeText ([string]$_)
    Write-Host $line
    Update-StateFromLine $line
    Write-DashboardHtml
}
$resolveSafeExitCode = $LASTEXITCODE

if ($resolveSafeExitCode -ne 0) {
    $state.Phase = "Error"
    $state.Error = "La resolucion segura termino con codigo $resolveSafeExitCode."
    Write-DashboardHtml
    throw "La resolucion segura termino con codigo $resolveSafeExitCode."
}

$reviewArgs = @("review", "--run-id", $state.RunId)
if (-not $NoOpen) {
    $reviewArgs += "--open-html"
}

Write-Host "Generando review..." -ForegroundColor Cyan
$state.Phase = "Generando review"
Write-DashboardHtml

& $exePath @reviewArgs 2>&1 | ForEach-Object {
    $line = Repair-MojibakeText ([string]$_)
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

if (-not [string]::IsNullOrWhiteSpace($state.BufferPath)) {
    Add-Log "Buffer retenido para auditoria. Cuando cierres la validacion, podes limpiarlo con flush --cleanup --buffer-path `"$($state.BufferPath)`"."
}

Write-Host ""
Write-Host "Proceso terminado." -ForegroundColor Green
Write-Host "Run: $($state.RunId)"
Write-Host "Guardado tambien en: $latestRunFile"

$state.Phase = "Completado"
Add-Log "Proceso terminado. Run: $($state.RunId)"
Write-DashboardHtml
