param(
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$serverDir = Join-Path $root 'server'
$clientDir = Join-Path $root 'client'
$serverEntry = Join-Path $serverDir 'src\server.js'
$viteEntry = Join-Path $clientDir 'node_modules\vite\bin\vite.js'
$logDir = Join-Path $serverDir 'logs'

function Get-AvailablePort([int]$FirstPort, [Net.IPAddress]$Address) {
  $lastPort = [Math]::Min($FirstPort + 49, 65535)
  for ($port = $FirstPort; $port -le $lastPort; $port++) {
    $listener = [Net.Sockets.TcpListener]::new($Address, $port)
    try {
      $listener.ExclusiveAddressUse = $true
      if ($Address.Equals([Net.IPAddress]::IPv6Any)) {
        $listener.Server.DualMode = $true
      }
      $listener.Start()
      return $port
    } catch [Net.Sockets.SocketException] {
      if ($_.Exception.SocketErrorCode -notin @('AddressAlreadyInUse', 'AccessDenied')) {
        throw
      }
    } finally {
      $listener.Stop()
    }
  }
  throw "No free TCP port found between $FirstPort and $lastPort."
}

function Wait-ForEndpoint($Process, [string]$Url) {
  $deadline = [DateTime]::UtcNow.AddSeconds(35)
  do {
    $Process.Refresh()
    if ($Process.HasExited) {
      throw "Process $($Process.Id) exited with code $($Process.ExitCode) while starting $Url."
    }
    try {
      return Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    } catch {
      Start-Sleep -Milliseconds 300
    }
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for $Url."
}

$backend = $null
$frontend = $null
$launchLock = $null
$originalPort = $env:PORT
$originalApiTarget = $env:VITE_API_TARGET
try {
  $node = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
  if (!(Test-Path -LiteralPath (Join-Path $serverDir 'node_modules')) -or
      !(Test-Path -LiteralPath $viteEntry -PathType Leaf)) {
    throw 'Run npm ci in server and client before starting.'
  }

  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  try {
    $launchLock = [IO.File]::Open((Join-Path $logDir 'start-local.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
  } catch [IO.IOException] {
    throw "Could not lock the launcher. Check for another startup in progress. $($_.Exception.Message)"
  }

  $firstBackendPort = 3000
  if ($originalPort -and (![int]::TryParse($originalPort, [ref]$firstBackendPort) -or
      $firstBackendPort -lt 1 -or $firstBackendPort -gt 65535)) {
    throw 'PORT must be an integer between 1 and 65535.'
  }

  # Match the full entry paths passed to Node by this launcher.
  $projectEntryPattern = '"(' + [regex]::Escape($serverEntry) + '|' + [regex]::Escape($viteEntry) + ')"'
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match $projectEntryPattern } |
    ForEach-Object {
      $process = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -InputObject $process -Force
        $process.WaitForExit(3000) | Out-Null
      }
    }

  $backendPort = Get-AvailablePort $firstBackendPort ([Net.IPAddress]::IPv6Any)
  $backendUrl = "http://127.0.0.1:$backendPort"
  $env:PORT = "$backendPort"
  Write-Host "Starting backend: $backendUrl"
  $backend = Start-Process -FilePath $node -ArgumentList ('"{0}"' -f $serverEntry) -WorkingDirectory $serverDir `
    -RedirectStandardOutput (Join-Path $logDir 'server-runtime.log') `
    -RedirectStandardError (Join-Path $logDir 'server-runtime.err.log') -WindowStyle Hidden -PassThru

  $health = (Wait-ForEndpoint $backend "$backendUrl/health").Content | ConvertFrom-Json
  if ($health.status -ne 'ok' -or $health.database -ne 'postgresql') {
    throw 'The backend returned an invalid health response.'
  }

  $frontendPort = Get-AvailablePort 5173 ([Net.IPAddress]::Loopback)
  $frontendUrl = "http://127.0.0.1:$frontendPort"
  $env:VITE_API_TARGET = $backendUrl
  Write-Host "Starting frontend: $frontendUrl"
  $frontendArgs = '"{0}" --host 127.0.0.1 --port {1} --strictPort' -f $viteEntry, $frontendPort
  $frontend = Start-Process -FilePath $node -ArgumentList $frontendArgs -WorkingDirectory $clientDir `
    -RedirectStandardOutput (Join-Path $logDir 'client-runtime.log') `
    -RedirectStandardError (Join-Path $logDir 'client-runtime.err.log') -WindowStyle Hidden -PassThru

  Wait-ForEndpoint $frontend "$frontendUrl/" | Out-Null
  $accounts = (Wait-ForEndpoint $frontend "$frontendUrl/api/accounts").Content | ConvertFrom-Json
  if ($accounts.code -ne 0 -or $null -eq $accounts.data.total) {
    throw 'The frontend proxy returned an invalid accounts response.'
  }

  Write-Host "Open: $frontendUrl/accounts"
  Write-Host "Database: $($health.database)"
  Write-Host "Logs: $logDir"
} catch {
  foreach ($process in @($frontend, $backend)) {
    if ($process -and !$process.HasExited) {
      Stop-Process -InputObject $process -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Logs: $logDir"
  exit 1
} finally {
  if ($launchLock) {
    $launchLock.Dispose()
  }
  $env:PORT = $originalPort
  $env:VITE_API_TARGET = $originalApiTarget
}

if ($OpenBrowser) {
  try {
    Start-Process "$frontendUrl/accounts"
  } catch {
    Write-Warning "Could not open the browser. Open $frontendUrl/accounts manually."
  }
}
exit 0
