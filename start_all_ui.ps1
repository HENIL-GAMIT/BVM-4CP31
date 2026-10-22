# Smart Dispatch - Single-Port UI Launcher
# Starts one unified UI for emergency requests and authenticated role dashboards

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "       SMART DISPATCH 108 - SINGLE-PORT UI LAUNCHER             " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan

$frontendDir = Join-Path $PSScriptRoot "frontend"
$backendDir = Join-Path $PSScriptRoot "backend"

if (!(Test-Path $frontendDir)) {
    Write-Error "Frontend directory not found at $frontendDir"
    exit 1
}

# 1. Check if .NET backend on port 5000 is listening; if not, launch it
$backendRunning = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $connect = $tcp.BeginConnect("127.0.0.1", 5000, $null, $null)
    $success = $connect.AsyncWaitHandle.WaitOne(1000)
    if ($success) {
        $tcp.EndConnect($connect)
        $backendRunning = $true
    }
    $tcp.Close()
} catch {}

if (!$backendRunning) {
    Write-Host "Launching .NET Backend API (http://localhost:5000)..." -ForegroundColor Yellow
    Start-Process -FilePath "dotnet" -ArgumentList "run --project `"$backendDir`"" -WindowStyle Hidden
    Start-Sleep -Seconds 3
} else {
    Write-Host "✓ .NET Backend API is already active on http://localhost:5000" -ForegroundColor Green
}

# 2. Check if dist exists, if not build it
$distDir = Join-Path $frontendDir "dist"
if (!(Test-Path $distDir)) {
    Write-Host "Building web bundle for first-time launch..." -ForegroundColor Yellow
    Push-Location $frontendDir
    npm run build
    Pop-Location
}

Write-Host "`nStarting unified UI..." -ForegroundColor Green
Write-Host "  🌐 Smart Dispatch UI : http://localhost:3000" -ForegroundColor Green
Write-Host "  🔌 API backend       : http://localhost:5000" -ForegroundColor Gray
Write-Host "`nPress Ctrl+C at any time to stop all servers.`n" -ForegroundColor DarkGray

Push-Location $frontendDir
node multi-server.js
Pop-Location
