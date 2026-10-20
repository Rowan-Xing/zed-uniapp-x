[CmdletBinding()]
param(
    [string]$RuntimePath,
    [string]$VsixPath,
    [string]$ZedDataDirectory = (Join-Path $env:LOCALAPPDATA 'Zed'),
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $ZedDataDirectory 'extensions\work\uniapp-x'
$expectedHash = 'd8d0e7838881ed810aa15ecbe3d1466aefa3c6b56d46e1a5695446e597ff5d51'
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

if (-not $RuntimePath) {
    $runtimeContainer = Join-Path $cacheRoot 'dcloud-4.87.0'
    $RuntimePath = Join-Path $runtimeContainer 'extension'
    if (-not (Test-Path -LiteralPath (Join-Path $RuntimePath 'package.json'))) {
        if (Test-Path -LiteralPath $runtimeContainer) {
            throw "An incomplete runtime already exists: $runtimeContainer. Inspect it before retrying."
        }
        if (-not $VsixPath) {
            $VsixPath = Join-Path $cacheRoot 'dcloud-language-services-4.87.0.vsix'
            if (-not (Test-Path -LiteralPath $VsixPath)) {
                Write-Host 'Downloading official DCloud language service 4.87.0 from Open VSX...'
                Invoke-WebRequest -Uri 'https://open-vsx.org/api/dcloud-ide/hbuilderx-language-services/4.87.0/file/dcloud-ide.hbuilderx-language-services-4.87.0.vsix' -OutFile $VsixPath
            }
        }
        $VsixPath = (Resolve-Path -LiteralPath $VsixPath).Path
        if ((Get-FileHash -LiteralPath $VsixPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
            throw "DCloud VSIX checksum mismatch: $VsixPath"
        }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        Write-Host "Extracting the verified runtime to $runtimeContainer..."
        [System.IO.Compression.ZipFile]::ExtractToDirectory($VsixPath, $runtimeContainer)
    }
}
$RuntimePath = (Resolve-Path -LiteralPath $RuntimePath).Path
$manifest = Get-Content -LiteralPath (Join-Path $RuntimePath 'package.json') -Raw | ConvertFrom-Json
if ($manifest.name -ne 'hbuilderx-language-services' -or $manifest.version -ne '4.87.0') {
    throw 'This prototype requires dcloud-ide.hbuilderx-language-services 4.87.0.'
}
foreach ($required in @(
    'node_modules\typescript\lib\tsserver.js',
    'jsservice\out\tsplugins\node_modules\dcloudio\index.js',
    'indexservice\out\server\server.js',
    'vueservice\packages\vue-typescript\out\sourceFile.js'
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $RuntimePath $required))) {
        throw "Incomplete DCloud runtime: $required"
    }
}
[System.IO.File]::WriteAllText((Join-Path $cacheRoot 'runtime-path.txt'), $RuntimePath)

if ($Install) {
    foreach ($required in @('extension.wasm', 'grammars\vue.wasm')) {
        if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $required))) {
            throw "Missing $required. Build the extension first; see README.md."
        }
    }
    $installRoot = Join-Path $ZedDataDirectory 'extensions\installed\uniapp-x'
    if (Test-Path -LiteralPath $installRoot) {
        $existingManifest = Join-Path $installRoot 'extension.toml'
        if (-not (Test-Path -LiteralPath $existingManifest) -or
            (Get-Content -LiteralPath $existingManifest -Raw) -notmatch 'name = "uni-app x \(Local Prototype\)"') {
            throw "A different extension occupies $installRoot. No files were overwritten."
        }
    }
    New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
    foreach ($item in @('extension.toml', 'extension.wasm', 'languages', 'grammars', 'licenses', 'LICENSE', 'THIRD_PARTY_NOTICES.md')) {
        Copy-Item -LiteralPath (Join-Path $sourceRoot $item) -Destination $installRoot -Recurse -Force
    }
    Write-Host "Installed local prototype: $installRoot"
    Write-Host 'In Zed, run "zed: reload extensions" from the command palette, or reopen Zed.'
}
Write-Host "DCloud local runtime: $RuntimePath"
Write-Host "Runtime pointer: $(Join-Path $cacheRoot 'runtime-path.txt')"
