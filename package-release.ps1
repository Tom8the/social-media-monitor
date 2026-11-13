$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$releaseRoot = Join-Path $root 'release'
$zipPath = Join-Path $releaseRoot 'social-media-monitor-postgresql.zip'
$bundleDir = Join-Path $releaseRoot ('package-' + [Guid]::NewGuid().ToString('N'))
$clientDir = Join-Path $root 'client'
$serverDir = Join-Path $root 'server'
$databaseDir = Join-Path $root 'database'
$serverSources = git -C $root ls-files -- server/src server/wx_auto_open_videohao.py
if ($LASTEXITCODE -ne 0 -or 'server/src/videohao-scraper.js' -notin $serverSources) {
  throw 'Could not list tracked server sources. Build from a Git checkout.'
}

Write-Host 'Building client...'
Push-Location $clientDir
try {
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally {
  Pop-Location
}

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

try {
  foreach ($file in $serverSources) {
    $destination = Join-Path $bundleDir $file
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $destination
  }
  Copy-Item (Join-Path $serverDir 'package.json') -Destination (Join-Path $bundleDir 'server')
  Copy-Item (Join-Path $serverDir 'package-lock.json') -Destination (Join-Path $bundleDir 'server')
  Copy-Tree -Source (Join-Path $clientDir 'dist') -Destination (Join-Path $bundleDir 'client\dist')
  $bundleDatabase = Join-Path $bundleDir 'database'
  New-Item -ItemType Directory -Path $bundleDatabase | Out-Null
  Copy-Item (Join-Path $databaseDir 'postgres.sql') -Destination $bundleDatabase
  Copy-Item (Join-Path $root '.env.example') -Destination $bundleDir
  Copy-Item (Join-Path $root 'compose.yaml') -Destination $bundleDir
  Copy-Item (Join-Path $root 'start-production.bat') -Destination $bundleDir
  Copy-Item (Join-Path $root 'start-production.ps1') -Destination $bundleDir
  Copy-Item (Join-Path $root 'DEPLOYMENT.md') -Destination $bundleDir
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  $temporaryZip = "$bundleDir.zip"
  try {
    $archive = [IO.Compression.ZipFile]::Open($temporaryZip, 'Create')
    try {
      foreach ($file in Get-ChildItem -LiteralPath $bundleDir -Recurse -File -Force) {
        $entryName = $file.FullName.Substring($bundleDir.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName) | Out-Null
      }
    } finally {
      $archive.Dispose()
    }
    Move-Item -LiteralPath $temporaryZip -Destination $zipPath -Force
  } finally {
    if (Test-Path -LiteralPath $temporaryZip) {
      Remove-Item -LiteralPath $temporaryZip -Force
    }
  }
} finally {
  if (Test-Path -LiteralPath $bundleDir) {
    $resolvedBundle = (Resolve-Path -LiteralPath $bundleDir).ProviderPath
    $resolvedRelease = (Resolve-Path -LiteralPath $releaseRoot).ProviderPath
    if ([IO.Path]::GetDirectoryName($resolvedBundle) -ne $resolvedRelease) {
      throw "Unexpected release staging path: $resolvedBundle"
    }
    Remove-Item -LiteralPath $resolvedBundle -Recurse -Force
  }
}
Write-Host "Release bundle created at $zipPath"
