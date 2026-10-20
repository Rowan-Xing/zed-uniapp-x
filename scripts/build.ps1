[CmdletBinding()]
param(
    [string]$WasiSdkPath,
    [string]$VueGrammarPath,
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

New-Item -ItemType Directory -Force -Path (Join-Path $sourceRoot 'grammars') | Out-Null
$outputPath = Join-Path $sourceRoot 'grammars\vue.wasm'
if ($WasiSdkPath -and $VueGrammarPath) {
    $clangPath = Join-Path $WasiSdkPath 'bin\clang.exe'
    $grammarSrc = Join-Path $VueGrammarPath 'src'
    & $clangPath -fPIC -shared -Os '-Wl,--export=tree_sitter_vue' -o $outputPath -I $grammarSrc (Join-Path $grammarSrc 'parser.c') (Join-Path $grammarSrc 'scanner.c')
    if ($LASTEXITCODE -ne 0) { throw 'Vue grammar build failed.' }
} elseif (-not (Test-Path -LiteralPath $outputPath)) {
    $downloadRoot = Join-Path $sourceRoot '.cache\vue-0.4.1'
    New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
    $archivePath = Join-Path $downloadRoot 'vue.tar.gz'
    Invoke-WebRequest 'https://api.zed.dev/extensions/vue/0.4.1/download' -OutFile $archivePath
    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($archiveHash -ne '97809f37f0ddbeda0be3b232858ba29842d8a39425ce8f779b5cc2d27d906c04') {
        throw 'Zed Vue archive checksum mismatch.'
    }
    & tar -xzf $archivePath -C $downloadRoot 'grammars/vue.wasm'
    if ($LASTEXITCODE -ne 0) { throw 'Vue grammar extraction failed.' }
    Copy-Item -LiteralPath (Join-Path $downloadRoot 'grammars\vue.wasm') -Destination $outputPath
}
Write-Host "Built extension.wasm; Vue grammar is ready in $sourceRoot. UTS uses Zed's built-in TypeScript grammar."
