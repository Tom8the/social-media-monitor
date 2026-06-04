$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$releaseRoot = Join-Path $root 'release'
$bundleDir = Join-Path $releaseRoot 'social-media-monitor'
$zipPath = Join-Path $releaseRoot 'social-media-monitor.zip'
$clientDir = Join-Path $root 'client'
$serverDir = Join-Path $root 'server'
$databaseDir = Join-Path $root 'database'

if (Test-Path $releaseRoot) {
  Remove-Item $releaseRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleDir 'server') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleDir 'client') | Out-Null

Write-Host 'Building client...'
Push-Location $clientDir
npm.cmd run build
Pop-Location

function Copy-Tree {
  param(
    [string]$Source,
    [string]$Destination
  )
  if (-not (Test-Path $Source)) { return }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -Path $Source -Force | ForEach-Object {
    Copy-Item $_.FullName -Destination $Destination -Recurse -Force
  }
}

Copy-Tree -Source (Join-Path $serverDir 'src') -Destination (Join-Path $bundleDir 'server\src')
Copy-Item (Join-Path $serverDir 'package.json') -Destination (Join-Path $bundleDir 'server') -Force
Copy-Item (Join-Path $serverDir 'package-lock.json') -Destination (Join-Path $bundleDir 'server') -Force
Copy-Tree -Source (Join-Path $clientDir 'dist') -Destination (Join-Path $bundleDir 'client\dist')
Copy-Tree -Source $databaseDir -Destination (Join-Path $bundleDir 'database')
Copy-Item (Join-Path $root '.env.example') -Destination $bundleDir -Force
Copy-Item (Join-Path $root 'start-production.bat') -Destination $bundleDir -Force
Copy-Item (Join-Path $root 'start-production.ps1') -Destination $bundleDir -Force
Copy-Item (Join-Path $root 'DEPLOYMENT.md') -Destination $bundleDir -Force

Write-Host 'Exporting database snapshot...'
node (Join-Path $root 'scripts\export-database.js') --output (Join-Path $bundleDir 'database\social_media_monitor-data.sql')

Compress-Archive -Path (Join-Path $bundleDir '*') -DestinationPath $zipPath -Force
Write-Host "Release bundle created at $zipPath"
