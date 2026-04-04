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

if (Test-Path $exePathRelease) {
    $exePath = $exePathRelease
} elseif (Test-Path $exePathDebug) {
    $exePath = $exePathDebug
    Write-Warning "Usando target\debug (no hay release). Para mejor rendimiento: cargo build --release"
} else {
    throw "No encontre platform-scraper-rs.exe en target\release ni target\debug. Compila con: cargo build --release"
}

$outputDir = Join-Path $scraperRoot "output"
$latestRunFile = Join-Path $outputDir "latest-run.txt"
$runLogFile = Join-Path $outputDir "latest-pricely-run.log"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Set-Location $scraperRoot

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

if (Test-Path $runLogFile) {
    Remove-Item -LiteralPath $runLogFile -Force
}

& $exePath @scanArgs 2>&1 | Tee-Object -FilePath $runLogFile

if ($LASTEXITCODE -ne 0) {
    throw "El scan de Pricely termino con error."
}

$runIdMatch = Select-String -Path $runLogFile -Pattern 'Run (?:creado|reanudado):\s+([0-9a-fA-F-]+)' | Select-Object -Last 1
if (-not $runIdMatch) {
    throw "No pude detectar el run id del scan de Pricely."
}

$runId = $runIdMatch.Matches[0].Groups[1].Value
Set-Content -Path $latestRunFile -Value $runId -Encoding UTF8

$reviewArgs = @("review", "--run-id", $runId)
if (-not $NoOpen) {
    $reviewArgs += "--open-html"
}

Write-Host "Generando review..." -ForegroundColor Cyan
& $exePath @reviewArgs

if ($LASTEXITCODE -ne 0) {
    throw "El review de Pricely termino con error."
}

Write-Host ""
Write-Host "Run listo: $runId" -ForegroundColor Green
Write-Host "Ultimo run guardado en: $latestRunFile" -ForegroundColor DarkGray
