$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $root 'server'

Write-Host 'Starting production server...'
Set-Location $serverDir
npm start
