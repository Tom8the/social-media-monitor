$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $root 'server'
$clientDir = Join-Path $root 'client'
$tmpDir = Join-Path $serverDir 'tmp\playwright'
$logDir = Join-Path $serverDir 'logs'

New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$env:TEMP = $tmpDir
$env:TMP = $tmpDir
$env:TMPDIR = $tmpDir

function Stop-ProjectProcessTree {
  $allProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  $rootLower = $root.ToLower()
  $seedIds = @(
    $allProcesses |
      Where-Object {
        $_.ProcessId -ne $PID -and
        $_.CommandLine -and
        $_.CommandLine.ToLower().Contains($rootLower) -and
        (
          $_.CommandLine -match 'npm\s+run\s+dev' -or
          $_.CommandLine -match 'src[\\/]server\.js' -or
          $_.CommandLine -match 'vite(\.js)?' -or
          $_.CommandLine -match 'node_modules[\\/]\.bin'
        )
      } |
      Select-Object -ExpandProperty ProcessId
  )

  $idsToStop = New-Object System.Collections.Generic.HashSet[int]
  foreach ($seedId in $seedIds) {
    [void]$idsToStop.Add([int]$seedId)
  }

  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($processInfo in $allProcesses) {
      if ($processInfo.ProcessId -ne $PID -and $idsToStop.Contains([int]$processInfo.ParentProcessId) -and -not $idsToStop.Contains([int]$processInfo.ProcessId)) {
        [void]$idsToStop.Add([int]$processInfo.ProcessId)
        $changed = $true
      }
    }
  }

  foreach ($processId in ($idsToStop | Sort-Object -Descending)) {
    Write-Host "Stopping project process (PID $processId)"
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }

  if ($idsToStop.Count -gt 0) {
    Start-Sleep -Seconds 1
  }
}

function Stop-ProjectPort {
  param(
    [int]$Port,
    [string]$ExpectedPath
  )

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $processId = $connection.OwningProcess
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    $commandLine = $processInfo.CommandLine

    if (($commandLine -and $commandLine.ToLower().Contains($ExpectedPath.ToLower())) -or ($process -and $process.ProcessName -eq 'node')) {
      Write-Host "Stopping existing service on port $Port (PID $processId)"
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
    } elseif ($commandLine) {
      Write-Host "Port $Port is occupied by another process:"
      Write-Host "  PID $processId - $commandLine"
      throw "Please close the process using port $Port, then run start-local.bat again."
    }
  }
}

Stop-ProjectProcessTree
Stop-ProjectPort -Port 3000 -ExpectedPath $serverDir
Stop-ProjectPort -Port 5173 -ExpectedPath $clientDir

Write-Host 'Starting backend: http://127.0.0.1:3000'
Start-Process powershell -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-Command',
  "cd '$serverDir'; `$env:TEMP='$tmpDir'; `$env:TMP='$tmpDir'; `$env:TMPDIR='$tmpDir'; npm run dev *> '$logDir\server-runtime.log'"
) -WindowStyle Hidden

Start-Sleep -Seconds 3

Write-Host 'Starting frontend: http://127.0.0.1:5173'
Start-Process powershell -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-Command',
  "cd '$clientDir'; npm run dev -- --host 127.0.0.1 *> '$logDir\client-runtime.log'"
) -WindowStyle Hidden

Write-Host ''
Write-Host 'Open: http://127.0.0.1:5173'
Write-Host "XHS log: $logDir\xhs-sync.log"
