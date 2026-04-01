param(
    [int]$MaxCategories = 14,
    [int]$Limit,
    [string]$ResumeCategoryUrl,
    [int]$ResumePageNumber,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scraperRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$exePathRelease = Join-Path $scraperRoot "target\release\platform-scraper-rs.exe"
$exePathDebug = Join-Path $scraperRoot "target\debug\platform-scraper-rs.exe"
if (Test-Path $exePathRelease) {
    $exePath = $exePathRelease
} elseif (Test-Path $exePathDebug) {
    $exePath = $exePathDebug
    Write-Warning "Usando target\debug (no hay release). Para mejor rendimiento: cargo build --release"
} else {
    throw "No encontre platform-scraper-rs.exe en target\release ni target\debug. Compilá con: cargo build --release"
}
$outputDir = Join-Path $scraperRoot "output"
$latestRunFile = Join-Path $outputDir "latest-run.txt"
$dashboardPath = Join-Path $outputDir "live-dashboard.html"
$dashboardStatePath = Join-Path $outputDir "live-dashboard-state.json"
$dashboardServerPidPath = Join-Path $outputDir "live-dashboard-server.pid"
$dashboardServerPortPath = Join-Path $outputDir "live-dashboard-server.port"
$latestBufferFile = Join-Path $outputDir "latest-buffer.txt"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
$encoding1252 = [System.Text.Encoding]::GetEncoding(1252)
$encoding850 = [System.Text.Encoding]::GetEncoding(850)

[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

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

if (($PSBoundParameters.ContainsKey('ResumeCategoryUrl') -and -not $PSBoundParameters.ContainsKey('ResumePageNumber')) -or
    ($PSBoundParameters.ContainsKey('ResumePageNumber') -and -not $PSBoundParameters.ContainsKey('ResumeCategoryUrl'))) {
    throw "Si queres reanudar manualmente, indicá juntos -ResumeCategoryUrl y -ResumePageNumber."
}

function Get-AvailableDashboardPort {
    param(
        [int]$StartPort = 8765,
        [int]$EndPort = 8795
    )

    for ($port = $StartPort; $port -le $EndPort; $port++) {
        $listener = $null
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
            $listener.Start()
            return $port
        } catch {
            continue
        } finally {
            if ($null -ne $listener) {
                try {
                    $listener.Stop()
                } catch {
                }
            }
        }
    }

    throw "No encontré un puerto libre para el visor local."
}

function Get-DashboardBaseUrl {
    $port = $null
    $serverPid = $null

    if ((Test-Path $dashboardServerPidPath) -and (Test-Path $dashboardServerPortPath)) {
        try {
            $serverPid = [int](Get-Content $dashboardServerPidPath -Raw).Trim()
            $port = [int](Get-Content $dashboardServerPortPath -Raw).Trim()
            $process = Get-Process -Id $serverPid -ErrorAction Stop
            if ($process) {
                return "http://127.0.0.1:$port/"
            }
        } catch {
            Remove-Item $dashboardServerPidPath -ErrorAction SilentlyContinue
            Remove-Item $dashboardServerPortPath -ErrorAction SilentlyContinue
        }
    }

    $port = Get-AvailableDashboardPort
    $serverScriptPath = Join-Path $scraperRoot "scripts\serve-live-dashboard.ps1"
    $powershellExe = Join-Path $PSHOME "powershell.exe"
    $process = Start-Process `
        -FilePath $powershellExe `
        -ArgumentList @(
            "-ExecutionPolicy", "Bypass",
            "-File", $serverScriptPath,
            "-OutputDir", $outputDir,
            "-Port", $port
        ) `
        -WindowStyle Hidden `
        -PassThru

    Set-Content -Path $dashboardServerPidPath -Value $process.Id -Encoding UTF8
    Set-Content -Path $dashboardServerPortPath -Value $port -Encoding UTF8
    Start-Sleep -Milliseconds 400

    return "http://127.0.0.1:$port/"
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

function Write-DashboardShellHtml {
    $resumeScriptPath = Join-Path $scraperRoot "scripts\run-carrefour-review.ps1"
    $defaultResumeCategory = if ($state.CurrentCategoryUrl) {
        $state.CurrentCategoryUrl
    } else {
        "https://www.carrefour.com.ar/bebidas"
    }
    $defaultResumePage = if ($state.CurrentPageNumber) {
        [int]$state.CurrentPageNumber + 1
    } else {
        16
    }
    $resumeScriptPathJson = $resumeScriptPath | ConvertTo-Json -Compress
    $defaultResumeCategoryJson = $defaultResumeCategory | ConvertTo-Json -Compress
    $defaultResumePageJson = $defaultResumePage | ConvertTo-Json -Compress

    $html = @"
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scrapper Carrefour en vivo</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07111d;
      --panel: rgba(15, 28, 43, 0.96);
      --panel-2: rgba(19, 37, 56, 0.96);
      --line: #28415d;
      --text: #eef6ff;
      --muted: #9eb6ce;
      --accent: #64c4ff;
      --ok: #24d67b;
      --danger: #ff6b6b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top, #10233a 0%, var(--bg) 58%);
      color: var(--text);
      font-family: system-ui, sans-serif;
      padding: 18px;
    }
    .wrap {
      max-width: 1420px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 18px 20px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
    }
    .hero {
      display: grid;
      gap: 18px;
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: start;
      flex-wrap: wrap;
    }
    .hero h1 {
      margin: 0 0 6px;
      font-size: 30px;
    }
    .muted {
      color: var(--muted);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(100, 196, 255, 0.12);
      color: #d9ecff;
      font-size: 13px;
      font-weight: 700;
    }
    .badge.offline {
      background: rgba(255, 107, 107, 0.14);
      border-color: rgba(255, 107, 107, 0.4);
      color: #ffd1d1;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
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
    .value.compact {
      font-size: 16px;
      line-height: 1.45;
      word-break: break-word;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .action {
      border: 1px solid rgba(100, 196, 255, 0.4);
      border-radius: 12px;
      background: rgba(100, 196, 255, 0.12);
      color: #cfeeff;
      padding: 11px 14px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .action.secondary {
      border-color: rgba(158, 182, 206, 0.26);
      background: rgba(158, 182, 206, 0.08);
      color: var(--text);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
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
      font-size: 12px;
      font-weight: 700;
    }
    .pill.ok {
      background: rgba(36, 214, 123, 0.12);
      border-color: rgba(36, 214, 123, 0.42);
      color: #86f1b7;
    }
    .pill.warn {
      background: rgba(245, 185, 66, 0.12);
      border-color: rgba(245, 185, 66, 0.42);
      color: #ffd88a;
    }
    .hero-meta {
      display: grid;
      gap: 8px;
    }
    .hero-links {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }
    .hero-links a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 700;
    }
    .resume-form {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(180px, 220px) auto auto;
      gap: 12px;
      align-items: end;
    }
    .resume-field {
      display: grid;
      gap: 6px;
      font-size: 13px;
      color: var(--muted);
    }
    .resume-field input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #081320;
      color: var(--text);
      padding: 11px 12px;
      font: inherit;
    }
    .action {
      border: 1px solid rgba(100, 196, 255, 0.4);
      border-radius: 12px;
      background: rgba(100, 196, 255, 0.12);
      color: #cfeeff;
      padding: 11px 14px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .action.secondary {
      border-color: rgba(158, 182, 206, 0.26);
      background: rgba(158, 182, 206, 0.08);
      color: var(--text);
    }
    .resume-command {
      margin: 0;
      padding: 12px 14px;
      border-radius: 14px;
      background: #081320;
      border: 1px solid var(--line);
      color: #d9ecff;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .error-box {
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(255, 107, 107, 0.12);
      border: 1px solid rgba(255, 107, 107, 0.4);
      color: #ffc2c2;
      font-weight: 700;
      display: none;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
      gap: 16px;
    }
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
    .product-footer a {
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
    .empty {
      padding: 24px;
      border-radius: 18px;
      border: 1px dashed var(--line);
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 1080px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .resume-form {
        grid-template-columns: 1fr;
      }
      .product-card {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="panel hero">
      <div class="hero-top">
        <div>
          <h1>Scrapper Carrefour en vivo</h1>
          <div class="muted">
            Shell interactiva con AJAX sobre el estado del scan. La UI queda viva y los campos manuales no se resetean en cada refresh.
          </div>
        </div>
        <div class="toolbar">
          <span class="badge" id="connectionBadge">Conectando visor...</span>
          <button type="button" class="action secondary" id="refreshViewer">Refrescar ahora</button>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="label">Fase</div>
          <div class="value" id="phaseValue">Preparando</div>
        </div>
        <div class="stat">
          <div class="label">Run</div>
          <div class="value compact" id="runValue">Todavia sin run id</div>
        </div>
        <div class="stat">
          <div class="label">Productos detectados</div>
          <div class="value" id="extractedValue">0</div>
        </div>
        <div class="stat">
          <div class="label">Pagina actual</div>
          <div class="value" id="pageValue">-</div>
        </div>
      </div>

      <div class="chips" id="progressChips"></div>
      <div class="chips" id="statusChips"></div>

      <div class="hero-meta">
        <div class="muted" id="categoryValue">Categoria actual: esperando datos...</div>
        <div class="muted" id="timestampsValue">Ultima actualizacion: sin datos</div>
        <div class="hero-links" id="heroLinks"></div>
      </div>

      <div class="resume-form">
        <label class="resume-field">
          <span>Categoria URL</span>
          <input id="resumeCategoryUrl" type="text" />
        </label>
        <label class="resume-field">
          <span>Pagina inicial</span>
          <input id="resumePageNumber" type="number" min="1" />
        </label>
        <button type="button" class="action" id="copyResumeCommand">Copiar comando</button>
        <button type="button" class="action secondary" id="resetResumeDefaults">Usar sugerencia actual</button>
      </div>

      <pre class="resume-command" id="resumeCommandPreview"></pre>
      <div class="error-box" id="errorBox"></div>
    </section>

    <section class="layout">
      <section class="panel">
        <h2 style="margin-top:0;">Productos recientes</h2>
        <p class="muted">Se refresca cada 2 segundos con lo ultimo del buffer y del staging.</p>
        <div class="products" id="productsList">
          <div class="empty">Esperando productos...</div>
        </div>
      </section>

      <aside class="panel">
        <h2 style="margin-top:0;">Actividad reciente</h2>
        <ul class="logs" id="logsList">
          <li>Esperando actividad...</li>
        </ul>
      </aside>
    </section>
  </div>

  <script>
    (() => {
      const stateUrl = "./state.json";
      const storageKey = "carrefour-manual-resume";
      const scriptPath = $resumeScriptPathJson;
      const defaultResumeCategory = $defaultResumeCategoryJson;
      const defaultResumePage = $defaultResumePageJson;
      let suggestedResume = {
        categoryUrl: defaultResumeCategory,
        pageNumber: defaultResumePage,
      };
      let hasStoredResume = false;

      const phaseValue = document.getElementById("phaseValue");
      const runValue = document.getElementById("runValue");
      const extractedValue = document.getElementById("extractedValue");
      const pageValue = document.getElementById("pageValue");
      const progressChips = document.getElementById("progressChips");
      const statusChips = document.getElementById("statusChips");
      const categoryValue = document.getElementById("categoryValue");
      const timestampsValue = document.getElementById("timestampsValue");
      const heroLinks = document.getElementById("heroLinks");
      const productsList = document.getElementById("productsList");
      const logsList = document.getElementById("logsList");
      const errorBox = document.getElementById("errorBox");
      const connectionBadge = document.getElementById("connectionBadge");
      const categoryInput = document.getElementById("resumeCategoryUrl");
      const pageInput = document.getElementById("resumePageNumber");
      const preview = document.getElementById("resumeCommandPreview");
      const copyButton = document.getElementById("copyResumeCommand");
      const resetButton = document.getElementById("resetResumeDefaults");
      const refreshButton = document.getElementById("refreshViewer");

      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (stored && typeof stored === "object") {
          if (typeof stored.categoryUrl === "string" && stored.categoryUrl.trim()) {
            categoryInput.value = stored.categoryUrl.trim();
            hasStoredResume = true;
          }
          if (Number.isFinite(Number(stored.pageNumber)) && Number(stored.pageNumber) > 0) {
            pageInput.value = String(Math.max(1, Number(stored.pageNumber)));
            hasStoredResume = true;
          }
        }
      } catch (_) {
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function formatDate(value) {
        if (!value) {
          return "sin datos";
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return String(value);
        }
        return parsed.toLocaleString("es-AR", { hour12: false });
      }

      function buildResumeValues() {
        const categoryUrl = (categoryInput.value || suggestedResume.categoryUrl || defaultResumeCategory).trim() || defaultResumeCategory;
        const rawPage = Number.parseInt(pageInput.value || String(suggestedResume.pageNumber || defaultResumePage), 10);
        const pageNumber = Math.max(1, Number.isFinite(rawPage) ? rawPage : defaultResumePage);
        return { categoryUrl, pageNumber };
      }

      const updateResumeCommand = () => {
        const values = buildResumeValues();
        const command =
          'powershell -ExecutionPolicy Bypass -File "' +
          scriptPath +
          '" -ResumeCategoryUrl "' +
          values.categoryUrl +
          '" -ResumePageNumber ' +
          values.pageNumber;

        preview.textContent = command;
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify(values),
          );
        } catch (_) {
        }
      };

      function renderChips(container, chips) {
        container.innerHTML = chips.join("");
      }

      function renderLinks(data) {
        const links = [];
        if (data.reviewUrl) {
          links.push('<a href="' + escapeHtml(data.reviewUrl) + '" target="_blank" rel="noreferrer">Abrir review final</a>');
        }
        if (data.currentPageUrl) {
          links.push('<a href="' + escapeHtml(data.currentPageUrl) + '" target="_blank" rel="noreferrer">Abrir pagina actual</a>');
        }
        if (data.bufferPath) {
          links.push('<span class="muted">Buffer: ' + escapeHtml(data.bufferPath) + "</span>");
        }
        heroLinks.innerHTML = links.length ? links.join("") : '<span class="muted">Todavia no hay links disponibles.</span>';
      }

      function renderProducts(products) {
        if (!Array.isArray(products) || !products.length) {
          productsList.innerHTML = '<div class="empty">Todavia no hay productos listos para mostrar.</div>';
          return;
        }

        productsList.innerHTML = products.map((product) => {
          const imageHtml = product.image
            ? '<img src="' + escapeHtml(product.image) + '" alt="preview" />'
            : '<div class="image-placeholder">Sin imagen</div>';
          const status = escapeHtml(product.syncStatus || "PENDING");
          const category = escapeHtml(product.categoryName || "Sin categoria");
          const presentation = escapeHtml(product.presentation || "Sin presentacion");
          const barcode = escapeHtml(product.barcode || "(sin EAN)");
          const sourceLink = product.sourceUrl
            ? '<a href="' + escapeHtml(product.sourceUrl) + '" target="_blank" rel="noreferrer">Ver origen</a>'
            : '<span class="muted">Sin origen</span>';

          return ''
            + '<article class="product-card">'
            + '  <div class="product-image">' + imageHtml + '</div>'
            + '  <div class="product-body">'
            + '    <div class="product-top">'
            + '      <div>'
            + '        <h3>' + escapeHtml(product.name || "Sin nombre") + '</h3>'
            + '        <p class="muted">' + barcode + '</p>'
            + '      </div>'
            + '      <span class="pill">' + status + '</span>'
            + '    </div>'
            + '    <p class="meta">' + category + ' | ' + presentation + '</p>'
            + '    <div class="product-footer">'
            + '      <span class="muted">ID: ' + escapeHtml(product.id || "-") + '</span>'
            +        sourceLink
            + '    </div>'
            + '  </div>'
            + '</article>';
        }).join("");
      }

      function renderLogs(logs) {
        if (!Array.isArray(logs) || !logs.length) {
          logsList.innerHTML = "<li>Esperando actividad...</li>";
          return;
        }
        logsList.innerHTML = logs.map((line) => "<li>" + escapeHtml(line) + "</li>").join("");
      }

      function renderDashboard(data) {
        phaseValue.textContent = data.phase || "Preparando";
        runValue.textContent = data.runId || "Todavia sin run id";
        extractedValue.textContent = String(data.extractedCount || 0);
        pageValue.textContent = data.currentPageNumber ? String(data.currentPageNumber) : "-";

        const categoryLabel = data.currentCategoryUrl || "Esperando categoria";
        categoryValue.textContent = "Categoria actual: " + categoryLabel;
        timestampsValue.textContent = "Ultima actualizacion: " + formatDate(data.lastUpdated) + " | Inicio: " + formatDate(data.startedAt);

        renderChips(progressChips, [
          '<span class="pill warn">En buffer: ' + escapeHtml(data.bufferedCount || 0) + "</span>",
          '<span class="pill ok">En staging: ' + escapeHtml(data.stagedCount || 0) + "</span>",
          '<span class="pill">Pendientes: ' + escapeHtml(data.pendingCount || 0) + "</span>",
          '<span class="pill">Categorias: ' + escapeHtml(data.currentCategoryIndex || 0) + " / " + escapeHtml(data.categoriesTotal || 0) + "</span>",
        ]);

        const statusEntries = Object.entries(data.statusCounts || {});
        if (statusEntries.length) {
          renderChips(statusChips, statusEntries.map(([key, value]) => {
            return '<span class="pill">' + escapeHtml(key) + ": " + escapeHtml(value) + "</span>";
          }));
        } else {
          renderChips(statusChips, ['<span class="pill">Sin resumen todavia</span>']);
        }

        renderLinks(data);
        renderProducts(data.products || []);
        renderLogs(data.logs || []);

        if (data.error) {
          errorBox.style.display = "block";
          errorBox.textContent = data.error;
        } else {
          errorBox.style.display = "none";
          errorBox.textContent = "";
        }

        if (data.suggestedResume && typeof data.suggestedResume === "object") {
          suggestedResume = {
            categoryUrl: (data.suggestedResume.categoryUrl || defaultResumeCategory),
            pageNumber: Math.max(1, Number(data.suggestedResume.pageNumber || defaultResumePage)),
          };
          if (!hasStoredResume && !categoryInput.value) {
            categoryInput.value = suggestedResume.categoryUrl;
          }
          if (!hasStoredResume && !pageInput.value) {
            pageInput.value = String(suggestedResume.pageNumber);
          }
        }

        updateResumeCommand();
      }

      async function loadDashboardState() {
        try {
          const response = await fetch(stateUrl + "?ts=" + Date.now(), { cache: "no-store" });
          if (!response.ok) {
            throw new Error("HTTP " + response.status);
          }
          const data = await response.json();
          connectionBadge.textContent = "Visor conectado";
          connectionBadge.classList.remove("offline");
          renderDashboard(data || {});
        } catch (error) {
          connectionBadge.textContent = "Sin conexion con el visor local";
          connectionBadge.classList.add("offline");
          if (!productsList.children.length) {
            productsList.innerHTML = '<div class="empty">No pude leer state.json todavia.</div>';
          }
        }
      }

      categoryInput.addEventListener("input", updateResumeCommand);
      pageInput.addEventListener("input", updateResumeCommand);
      refreshButton.addEventListener("click", loadDashboardState);
      resetButton.addEventListener("click", () => {
        hasStoredResume = false;
        categoryInput.value = suggestedResume.categoryUrl || defaultResumeCategory;
        pageInput.value = String(suggestedResume.pageNumber || defaultResumePage);
        updateResumeCommand();
      });
      copyButton.addEventListener("click", async () => {
        updateResumeCommand();
        try {
          await navigator.clipboard.writeText(preview.textContent);
          const previous = copyButton.textContent;
          copyButton.textContent = "Copiado";
          setTimeout(() => {
            copyButton.textContent = previous;
          }, 1400);
        } catch (_) {
          copyButton.textContent = "Copialo manual";
        }
      });

      updateResumeCommand();
      loadDashboardState();
      setInterval(loadDashboardState, 2000);
    })();
  </script>
</body>
</html>
"@

    Set-Content -Path $dashboardPath -Value $html -Encoding UTF8
}

function Write-DashboardHtml {
    Write-DashboardShellHtml

    $reviewUrl = Get-FileUrl $state.ReviewPath
    $resumeScriptPath = Join-Path $scraperRoot "scripts\run-carrefour-review.ps1"
    $suggestedResumeCategory = if ($state.CurrentCategoryUrl) {
        $state.CurrentCategoryUrl
    } else {
        "https://www.carrefour.com.ar/bebidas"
    }
    $suggestedResumePage = if ($state.CurrentPageNumber) {
        [Math]::Max(([int]$state.CurrentPageNumber + 1), 1)
    } else {
        16
    }

    $products = @($state.Products)
    [array]::Reverse($products)
    $products = @($products | Select-Object -First 48)

    $logs = @($state.Logs)
    [array]::Reverse($logs)
    $logs = @($logs | Select-Object -First 20)

    $payload = [ordered]@{
        phase = [string]$state.Phase
        startedAt = if ($state.StartedAt) { $state.StartedAt.ToString("o") } else { $null }
        lastUpdated = if ($state.LastUpdated) { $state.LastUpdated.ToString("o") } else { $null }
        runId = [string]$state.RunId
        bufferPath = [string]$state.BufferPath
        categoriesTotal = [int]$state.CategoriesTotal
        currentCategoryIndex = [int]$state.CurrentCategoryIndex
        currentCategoryUrl = [string]$state.CurrentCategoryUrl
        currentPageNumber = $state.CurrentPageNumber
        currentPageUrl = [string]$state.CurrentPageUrl
        extractedCount = [int]$state.ExtractedCount
        bufferedCount = [int]$state.BufferedCount
        stagedCount = [int]$state.StagedCount
        pendingCount = [int]$state.PendingCount
        statusCounts = $state.StatusCounts
        products = $products
        logs = $logs
        reviewUrl = [string]$reviewUrl
        error = [string]$state.Error
        suggestedResume = [ordered]@{
            scriptPath = $resumeScriptPath
            categoryUrl = $suggestedResumeCategory
            pageNumber = [int]$suggestedResumePage
        }
    }

    $json = $payload | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($dashboardStatePath, $json, $utf8NoBom)
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
    Start-Process (Get-DashboardBaseUrl)
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

if ($PSBoundParameters.ContainsKey('ResumeCategoryUrl')) {
    $scanArgs += @("--resume-category-url", $ResumeCategoryUrl.Trim())
    $scanArgs += @("--resume-page-number", [Math]::Max($ResumePageNumber, 1))
}

if ($PSBoundParameters.ContainsKey('Limit')) {
    $scanArgs += @("--limit", $Limit)
}

if ($resumeRunId -and $PSBoundParameters.ContainsKey('ResumeCategoryUrl')) {
    Write-Host "Reanudando scan de Carrefour desde $ResumeCategoryUrl pagina $ResumePageNumber..." -ForegroundColor Cyan
    Add-Log "Resume manual activo: $ResumeCategoryUrl pagina $ResumePageNumber."
} elseif ($resumeRunId) {
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
