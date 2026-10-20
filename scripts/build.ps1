[CmdletBinding()]
param(
    [string]$WasiSdkPath,
    [string]$VueGrammarPath,
    [string]$TypeScriptGrammarPath,
    [string]$BuildDirectory = (Join-Path $PSScriptRoot '..\.cache\cargo-target')
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$previousTarget = $env:CARGO_TARGET_DIR
try {
    $env:CARGO_TARGET_DIR = [System.IO.Path]::GetFullPath($BuildDirectory)
    Push-Location $sourceRoot
    try {
        & cargo build --release --locked --target wasm32-wasip2
        if ($LASTEXITCODE -ne 0) { throw 'Rust build failed.' }
    } finally { Pop-Location }
    Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'wasm32-wasip2\release\zed_uniapp_x.wasm') -Destination (Join-Path $sourceRoot 'extension.wasm') -Force
} finally { $env:CARGO_TARGET_DIR = $previousTarget }

& (Join-Path $PSScriptRoot 'build-grammars.ps1') -WasiSdkPath $WasiSdkPath -VueGrammarPath $VueGrammarPath -TypeScriptGrammarPath $TypeScriptGrammarPath
Write-Host "Built extension.wasm and both pinned grammars in $sourceRoot."
