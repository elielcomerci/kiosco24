param(
    [string]$Category,
    [string]$BusinessActivity = "KIOSCO",
    [int]$Limit,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scraperRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$exePathRelease = Join-Path $scraperRoot "target\release\platform-scraper-rs.exe"
$exePathDebug = Join-Path $scraperRoot "target\debug\platform-scraper-rs.exe"

function Resolve-ScraperExecutablePath {
    $releaseExists = Test-Path $exePathRelease
    $debugExists = Test-Path $exePathDebug

    if (-not $releaseExists -and -not $debugExists) {
        return $null
    }

    if ($releaseExists -and $debugExists) {
        $releaseTime = (Get-Item $exePathRelease).LastWriteTimeUtc
        $debugTime = (Get-Item $exePathDebug).LastWriteTimeUtc
        if ($debugTime -gt $releaseTime) {
            Write-Warning "Usando target\debug porque esta mas actualizado que release."
            return $exePathDebug
        }

        return $exePathRelease
    }

    if ($releaseExists) {
        return $exePathRelease
    }

    Write-Warning "Usando target\debug (no hay release). Para mejor rendimiento: cargo build --release"
    return $exePathDebug
}

$exePath = Resolve-ScraperExecutablePath
if ([string]::IsNullOrWhiteSpace($exePath)) {
    throw "No encontre platform-scraper-rs.exe en target\release ni target\debug. Compila con: cargo build --release"
}

$outputDir = Join-Path $scraperRoot "output"
$latestRunFile = Join-Path $outputDir "latest-run.txt"
$runLogFile = Join-Path $outputDir ("pricely-run-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$dashboardPath = Join-Path $outputDir "live-dashboard.html"
$dashboardStatePath = Join-Path $outputDir "live-dashboard-state.json"
$dashboardServerPidPath = Join-Path $outputDir "live-dashboard-server.pid"
$dashboardServerPortPath = Join-Path $outputDir "live-dashboard-server.port"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
$encoding1252 = [System.Text.Encoding]::GetEncoding(1252)
$encoding850 = [System.Text.Encoding]::GetEncoding(850)

[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

# Ensure dashboard HTML exists
$dashboardTemplatePath = Join-Path $scraperRoot "output\live-dashboard.html"
if (-not (Test-Path $dashboardTemplatePath)) {
    # Copy from script's own directory if available, or use a minimal default
    $scriptsDir = Split-Path $PSCommandPath -Parent
    $sourceHtml = Join-Path $scriptsDir "live-dashboard.html"
    if (Test-Path $sourceHtml) {
        Copy-Item -Path $sourceHtml -Destination $dashboardTemplatePath -Force
    }
}

Set-Location $scraperRoot

$state = [ordered]@{
    Source = "PRICELY"
    BusinessActivity = $null
    Phase = "Preparando"
    StartedAt = Get-Date
    LastUpdated = Get-Date
    RunId = $null
    BufferPath = $null
    CategoriesTotal = 1
    CurrentCategoryIndex = 1
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
    ReviewUrl = $null
    Error = $null
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

    throw "No encontre un puerto libre para el visor local."
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

function Update-ProductListEntry {
    param([hashtable]$Product)

    if ([string]::IsNullOrWhiteSpace($Product.id)) {
        return
    }

    for ($index = 0; $index -lt $state.Products.Count; $index++) {
        if ($state.Products[$index].id -eq $Product.id) {
            $state.Products.RemoveAt($index)
            break
        }
    }

    [void]$state.Products.Add([ordered]@{
        id = [string]$Product.id
        name = Repair-MojibakeText ([string]$Product.name)
        barcode = Repair-MojibakeText ([string]$Product.barcode)
        categoryName = Repair-MojibakeText ([string]$Product.categoryName)
        presentation = Repair-MojibakeText ([string]$Product.presentation)
        image = [string]$Product.image
        sourceUrl = [string]$Product.sourceUrl
        syncStatus = Repair-MojibakeText ([string]$Product.syncStatus)
    })

    # Keep all products for pagination (no cap)
}

function Write-DashboardState {
    $state.LastUpdated = Get-Date

    $products = @($state.Products)
    [array]::Reverse($products)
    # Show last 2000 products in dashboard (paginated at 20 per page = 100 pages)
    $products = @($products | Select-Object -First 2000)

    $logs = @($state.Logs)
    [array]::Reverse($logs)
    $logs = @($logs | Select-Object -First 20)

    $payload = [ordered]@{
        source = [string]$state.Source
        businessActivity = [string]$state.BusinessActivity
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
        reviewPath = [string]$state.ReviewPath
        reviewUrl = [string]$state.ReviewUrl
        error = [string]$state.Error
        suggestedResume = [ordered]@{
            scriptPath = Join-Path $scraperRoot "scripts\run-pricely-review.ps1"
            categoryUrl = [string]$state.CurrentCategoryUrl
            pageNumber = if ($state.CurrentPageNumber) { [int]$state.CurrentPageNumber + 1 } else { 2 }
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

    Add-Log $Line

    if ($Line.StartsWith("__SCRAPER_EVENT__")) {
        $payload = $Line.Substring("__SCRAPER_EVENT__".Length)
        try {
            $scraperEvent = $payload | ConvertFrom-Json
            if ($scraperEvent.type -eq "staged_product") {
                Update-ProductListEntry @{
                    id = [string]$scraperEvent.id
                    name = [string]$scraperEvent.name
                    barcode = [string]$scraperEvent.barcode
                    categoryName = [string]$scraperEvent.categoryName
                    presentation = [string]$scraperEvent.presentation
                    image = [string]$scraperEvent.image
                    sourceUrl = [string]$scraperEvent.sourceUrl
                    syncStatus = [string]$scraperEvent.syncStatus
                }
                $state.ExtractedCount = [int]$state.ExtractedCount + 1
            }
        } catch {
        }
        return
    }

    if ($Line -match "Run (?:creado|reanudado):\s+([0-9a-fA-F-]+)") {
        $state.RunId = $matches[1]
        $state.Phase = "Escaneando"
        Set-Content -Path $latestRunFile -Value $state.RunId -Encoding UTF8
        return
    }

    if ($Line -match "^Buffer local:\s+(.+)$") {
        $state.BufferPath = $matches[1]
        return
    }

    if ($Line -match "^Pagina Pricely ->\s+(https?://.+)$") {
        $state.CurrentPageUrl = $matches[1]
        $state.CurrentCategoryUrl = $categoryUrl
        if ($state.CurrentPageUrl -match '[?&]p=(\d+)') {
            $state.CurrentPageNumber = [int]$matches[1]
        } else {
            $state.CurrentPageNumber = 1
        }
        return
    }

    if ($Line -match "^Productos scrapeados:\s+(\d+)$") {
        $state.ExtractedCount = [int]$matches[1]
        return
    }

    if ($Line -match "^Productos bufferizados(?:(?: hasta el corte)?)?:\s+(\d+)$") {
        $state.BufferedCount = [int]$matches[1]
        return
    }

    if ($Line -match "^Productos cargados a staging(?: interno)?:\s+(\d+)$" -or
        $Line -match "^Productos ya cargados a staging:\s+(\d+)$") {
        $state.StagedCount = [int]$matches[1]
        return
    }

    if ($Line -match "^Pendientes de flush:\s+(\d+)$") {
        $state.PendingCount = [int]$matches[1]
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

    if ($Line -match "^Editor admin:\s+(https?://.+)$") {
        $state.ReviewUrl = $matches[1]
        return
    }

    if ($Line -match "^Run\s+[0-9a-fA-F-]+\s+completo\.") {
        $state.Phase = "Scan completo"
        return
    }
}

function Write-RunLogLine {
    param([string]$Line)

    if ($null -eq $Line) {
        return
    }

    [System.IO.File]::AppendAllText($runLogFile, "$Line`r`n", $utf8NoBom)
}

function Process-CommandOutput {
    param([scriptblock]$Command)

    $lastStateWrite = [System.DateTime]::Now
    $stateWriteInterval = [TimeSpan]::FromSeconds(2)

    & $Command 2>&1 | ForEach-Object {
        $line = [string]$_
        Write-Host $line
        Write-RunLogLine $line
        Update-StateFromLine $line

        # Throttle dashboard writes to avoid blocking scraper stdout
        $now = [System.DateTime]::Now
        if (($now - $lastStateWrite) -ge $stateWriteInterval) {
            Write-DashboardState
            $lastStateWrite = $now
        }
    }

    # Final write after process completes
    Write-DashboardState
}

function Resolve-PricelyCategoryUrl {
    param([string]$Value)

    $trimmed = [string]$Value
    $trimmed = $trimmed.Trim()

    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        throw "Indica una categoria de Pricely."
    }

    if ($trimmed -match '^\d+$') {
        return "https://pricely.ar/category/$trimmed"
    }

    if ($trimmed -match '^/category/\d+$') {
        return "https://pricely.ar$trimmed"
    }

    if ($trimmed -match '^https?://') {
        return $trimmed
    }

    throw "Usa una URL completa de categoria Pricely, una ruta /category/<id> o solo el id numerico."
}

function Show-PricelyLaunchDialog {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Escanear Pricely"
    $form.StartPosition = "CenterScreen"
    $form.Width = 640
    $form.Height = 210
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(245, 247, 250)

    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Text = "Categoria Pricely"
    $titleLabel.Left = 20
    $titleLabel.Top = 20
    $titleLabel.Width = 560
    $titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($titleLabel)

    $hintLabel = New-Object System.Windows.Forms.Label
    $hintLabel.Text = "Pega una URL completa, una ruta /category/<id> o solo el id numerico."
    $hintLabel.Left = 20
    $hintLabel.Top = 48
    $hintLabel.Width = 580
    $hintLabel.Height = 20
    $hintLabel.ForeColor = [System.Drawing.Color]::FromArgb(90, 100, 115)
    $hintLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($hintLabel)

    $categoryTextBox = New-Object System.Windows.Forms.TextBox
    $categoryTextBox.Left = 20
    $categoryTextBox.Top = 78
    $categoryTextBox.Width = 585
    $categoryTextBox.Height = 30
    $categoryTextBox.Font = New-Object System.Drawing.Font("Segoe UI", 10)
    $categoryTextBox.Text = "https://pricely.ar/category/65"
    $form.Controls.Add($categoryTextBox)

    $statusLabel = New-Object System.Windows.Forms.Label
    $statusLabel.Left = 20
    $statusLabel.Top = 114
    $statusLabel.Width = 430
    $statusLabel.Height = 20
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(180, 40, 40)
    $statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($statusLabel)

    $startButton = New-Object System.Windows.Forms.Button
    $startButton.Text = "Iniciar"
    $startButton.Left = 430
    $startButton.Top = 138
    $startButton.Width = 85
    $startButton.Height = 32
    $startButton.BackColor = [System.Drawing.Color]::FromArgb(21, 101, 192)
    $startButton.ForeColor = [System.Drawing.Color]::White
    $startButton.FlatStyle = "Flat"
    $startButton.Add_Click({
        try {
            $resolved = Resolve-PricelyCategoryUrl -Value $categoryTextBox.Text
            $form.Tag = $resolved
            $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
            $form.Close()
        } catch {
            $statusLabel.Text = $_.Exception.Message
        }
    })
    $form.Controls.Add($startButton)

    $cancelButton = New-Object System.Windows.Forms.Button
    $cancelButton.Text = "Cancelar"
    $cancelButton.Left = 525
    $cancelButton.Top = 138
    $cancelButton.Width = 80
    $cancelButton.Height = 32
    $cancelButton.FlatStyle = "Flat"
    $cancelButton.Add_Click({
        $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
        $form.Close()
    })
    $form.Controls.Add($cancelButton)

    $form.AcceptButton = $startButton
    $form.CancelButton = $cancelButton
    $form.Add_Shown({
        $categoryTextBox.Focus()
        $categoryTextBox.SelectAll()
    })

    $dialogResult = $form.ShowDialog()
    if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK) {
        return $null
    }

    return [string]$form.Tag
}

if ([string]::IsNullOrWhiteSpace($Category)) {
    try {
        $Category = Show-PricelyLaunchDialog
    } catch {
        $Category = Read-Host "Categoria Pricely (URL completa o id numerico)"
    }
}

if ([string]::IsNullOrWhiteSpace($Category)) {
    Write-Host "Escaneo cancelado." -ForegroundColor Yellow
    exit 0
}

if ([string]::IsNullOrWhiteSpace($BusinessActivity)) {
    $BusinessActivity = "KIOSCO"
}

$categoryUrl = Resolve-PricelyCategoryUrl -Value $Category
$businessActivityValue = $BusinessActivity.Trim().ToUpperInvariant()
$state.BusinessActivity = $businessActivityValue
$state.Phase = "Preparando scan"
$state.CurrentCategoryUrl = $categoryUrl
$state.CategoriesTotal = 1
$state.CurrentCategoryIndex = 1
Write-DashboardState

$scanArgs = @(
    "scan",
    "--source", "pricely",
    "--business-activity", $businessActivityValue,
    "--url", $categoryUrl,
    "--root-url", "https://pricely.ar/"
)

if ($PSBoundParameters.ContainsKey("Limit") -and $Limit -gt 0) {
    $scanArgs += @("--limit", [string]$Limit)
}

Write-Host "Escaneando Pricely..." -ForegroundColor Cyan
Write-Host "Categoria: $categoryUrl" -ForegroundColor DarkGray
Write-Host "Rubro: $businessActivityValue" -ForegroundColor DarkGray
Write-Host "Log local: $runLogFile" -ForegroundColor DarkGray
Write-RunLogLine "Escaneando Pricely..."
Write-RunLogLine "Categoria: $categoryUrl"
Write-RunLogLine "Rubro: $businessActivityValue"
Write-RunLogLine "Log local: $runLogFile"

if (-not $NoOpen) {
    Start-Process (Get-DashboardBaseUrl)
}

Process-CommandOutput { & $exePath @scanArgs }

# Save run ID before checking exit code (in case scan partially completed)
$runIdMatch = Select-String -Path $runLogFile -Pattern 'Run (?:creado|reanudado):\s+([0-9a-fA-F-]+)' | Select-Object -Last 1
if (-not $runIdMatch) {
    throw "No pude detectar el run id del scan de Pricely."
}

$runId = $runIdMatch.Matches[0].Groups[1].Value
Set-Content -Path $latestRunFile -Value $runId -Encoding UTF8

if ($LASTEXITCODE -ne 0) {
    $state.Phase = "Interrumpido"
    $state.Error = "El scan se interrumpio. Los productos hasta ahora estan seguros en el buffer."

    # Read checkpoint to show progress
    $checkpointPath = Join-Path $outputDir "scan-progress-$runId.json"
    $checkpointInfo = ""
    if (Test-Path $checkpointPath) {
        try {
            $cp = Get-Content $checkpointPath -Raw | ConvertFrom-Json
            if ($cp.lastCompletedPageNumber) {
                $checkpointInfo = "Ultima pagina procesada: $($cp.lastCompletedPageNumber)"
            }
        } catch {}
    }

    Write-Host "" -ForegroundColor Yellow
    Write-Host "  El scan se interrumpio pero el progreso esta guardado." -ForegroundColor Yellow
    if ($checkpointInfo) {
        Write-Host "  $checkpointInfo" -ForegroundColor Yellow
    }
    Write-Host "  Run ID: $runId" -ForegroundColor Yellow
    Write-Host "  Para retomar: --resume-run-id $runId" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow

    Write-DashboardState

    # Offer to resume
    $response = Read-Host "Desea retomar el scan desde donde quedo? (S/n)"
    if ($response -match '^[nN]') {
        Write-Host "Scan cancelado. Run ID: $runId" -ForegroundColor Cyan
        exit 0
    }

    # Resume scan
    Write-Host "Retomando scan..." -ForegroundColor Cyan
    $resumeScanArgs = @(
        "scan",
        "--source", "pricely",
        "--business-activity", $businessActivityValue,
        "--url", $categoryUrl,
        "--root-url", "https://pricely.ar/",
        "--resume-run-id", $runId
    )
    if ($PSBoundParameters.ContainsKey("Limit") -and $Limit -gt 0) {
        $resumeScanArgs += @("--limit", [string]$Limit)
    }

    Process-CommandOutput { & $exePath @resumeScanArgs }

    if ($LASTEXITCODE -ne 0) {
        $state.Phase = "Error"
        $state.Error = "El scan de Pricely fallo al retomar."
        Write-DashboardState
        throw "El scan de Pricely fallo al retomar."
    }

    Write-Host "Scan completado tras retomar." -ForegroundColor Green
}

$reviewArgs = @("review", "--run-id", $runId)

Write-Host "Generando review..." -ForegroundColor Cyan
Write-RunLogLine "Generando review..."
Process-CommandOutput { & $exePath @reviewArgs }

if ($LASTEXITCODE -ne 0) {
    $state.Phase = "Error"
    $state.Error = "El review de Pricely termino con error."
    Write-DashboardState
    throw "El review de Pricely termino con error."
}

$reviewOutput = Get-Content -Path $runLogFile
$adminUrlMatch = $reviewOutput | Select-String -Pattern 'Editor admin:\s+(https?://\S+)' | Select-Object -Last 1
$reportPathMatch = $reviewOutput | Select-String -Pattern 'Reporte generado:\s+(.+)$' | Select-Object -Last 1

$adminUrl = $null
if ($adminUrlMatch) {
    $adminUrl = $adminUrlMatch.Matches[0].Groups[1].Value.Trim()
}

$reportPath = $null
if ($reportPathMatch) {
    $reportPath = $reportPathMatch.Matches[0].Groups[1].Value.Trim()
}

if (-not [string]::IsNullOrWhiteSpace($adminUrl)) {
    $state.ReviewUrl = $adminUrl
}
$state.Phase = "Listo para revision"
$state.Error = $null
Write-DashboardState

if (-not $NoOpen) {
    if (-not [string]::IsNullOrWhiteSpace($adminUrl)) {
        Write-Host "Abriendo editor admin..." -ForegroundColor Cyan
        Start-Process $adminUrl
    } elseif (-not [string]::IsNullOrWhiteSpace($reportPath) -and (Test-Path $reportPath)) {
        Write-Warning "No pude detectar la URL del editor admin. Abro el review local como respaldo."
        Start-Process $reportPath
    } else {
        Write-Warning "No pude abrir automaticamente ni el editor admin ni el review local."
    }
}

Write-Host ""
Write-Host "Run listo: $runId" -ForegroundColor Green
Write-Host "Ultimo run guardado en: $latestRunFile" -ForegroundColor DarkGray
Write-Host "Log del run: $runLogFile" -ForegroundColor DarkGray
if (-not [string]::IsNullOrWhiteSpace($adminUrl)) {
    Write-Host "Editor admin: $adminUrl" -ForegroundColor DarkGray
}
