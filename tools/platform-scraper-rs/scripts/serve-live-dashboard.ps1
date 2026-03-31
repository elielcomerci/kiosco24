param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDir,
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"

$resolvedOutputDir = (Resolve-Path $OutputDir).Path
$indexPath = Join-Path $resolvedOutputDir "live-dashboard.html"
$statePath = Join-Path $resolvedOutputDir "live-dashboard-state.json"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Get-HttpStatusText {
    param(
        [int]$StatusCode
    )

    switch ($StatusCode) {
        200 { return "OK" }
        404 { return "Not Found" }
        500 { return "Internal Server Error" }
        503 { return "Service Unavailable" }
        default { return "OK" }
    }
}

function Write-Response {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.Stream]$Stream,
        [Parameter(Mandatory = $true)]
        [byte[]]$Bytes,
        [Parameter(Mandatory = $true)]
        [string]$ContentType,
        [int]$StatusCode = 200
    )

    $reason = Get-HttpStatusText -StatusCode $StatusCode
    $headers = @(
        "HTTP/1.1 $StatusCode $reason",
        "Content-Type: $ContentType",
        "Content-Length: $($Bytes.Length)",
        "Cache-Control: no-store, no-cache, must-revalidate",
        "Pragma: no-cache",
        "Expires: 0",
        "Connection: close",
        ""
        ""
    ) -join "`r`n"

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    $Stream.Write($Bytes, 0, $Bytes.Length)
    $Stream.Flush()
}

function New-TextResponseBytes {
    param([string]$Text)

    return $utf8NoBom.GetBytes($Text)
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 5000
            $client.SendTimeout = 5000
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)

            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                continue
            }

            do {
                $headerLine = $reader.ReadLine()
            } while ($null -ne $headerLine -and $headerLine.Length -gt 0)

            $requestParts = $requestLine.Split(' ')
            $rawTarget = if ($requestParts.Count -ge 2) { $requestParts[1] } else { "/" }
            $path = [System.Uri]::UnescapeDataString(($rawTarget -split '\?')[0])

            switch -Regex ($path) {
                '^/$|^/index\.html$' {
                    if (Test-Path $indexPath) {
                        Write-Response -Stream $stream -Bytes ([System.IO.File]::ReadAllBytes($indexPath)) -ContentType "text/html; charset=utf-8"
                    } else {
                        Write-Response -Stream $stream -Bytes (New-TextResponseBytes "Dashboard no generado todavia.") -ContentType "text/plain; charset=utf-8" -StatusCode 503
                    }
                    continue
                }
                '^/state\.json$' {
                    if (Test-Path $statePath) {
                        Write-Response -Stream $stream -Bytes ([System.IO.File]::ReadAllBytes($statePath)) -ContentType "application/json; charset=utf-8"
                    } else {
                        Write-Response -Stream $stream -Bytes (New-TextResponseBytes "{}") -ContentType "application/json; charset=utf-8"
                    }
                    continue
                }
                '^/health$' {
                    Write-Response -Stream $stream -Bytes (New-TextResponseBytes '{"ok":true}') -ContentType "application/json; charset=utf-8"
                    continue
                }
                default {
                    Write-Response -Stream $stream -Bytes (New-TextResponseBytes "Not Found") -ContentType "text/plain; charset=utf-8" -StatusCode 404
                    continue
                }
            }
        } catch {
            try {
                if ($null -ne $stream) {
                    Write-Response -Stream $stream -Bytes (New-TextResponseBytes $_.Exception.Message) -ContentType "text/plain; charset=utf-8" -StatusCode 500
                }
            } catch {
            }
        } finally {
            try {
                if ($null -ne $reader) {
                    $reader.Dispose()
                }
            } catch {
            }
            try {
                if ($null -ne $stream) {
                    $stream.Dispose()
                }
            } catch {
            }
            try {
                if ($null -ne $client) {
                    $client.Close()
                }
            } catch {
            }
        }
    }
} finally {
    try {
        $listener.Stop()
    } catch {
    }
    $listener.Close()
}
